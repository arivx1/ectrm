from __future__ import annotations

from datetime import date
from datetime import datetime
from datetime import timezone
from decimal import Decimal
from decimal import InvalidOperation
from typing import Any
from typing import Iterable
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_counterparty import ReferenceCounterparty
from apps.api.app.models.reference_currency import ReferenceCurrency
from apps.api.app.schemas.external_data import CounterpartyCreditSnapshotImport


def preview_dnb_counterparty_credit_rows(
    db: Session,
    *,
    rows: list[dict[str, Any]],
    default_limit_currency_code: Optional[str] = "USD",
) -> dict[str, Any]:
    counterparties = db.execute(
        select(ReferenceCounterparty).order_by(ReferenceCounterparty.code.asc())
    ).scalars().all()
    active_currency_codes = {
        row.code
        for row in db.execute(
            select(ReferenceCurrency).where(ReferenceCurrency.is_active.is_(True))
        ).scalars().all()
    }
    indexes = _build_counterparty_indexes(counterparties)

    preview_rows: list[dict[str, Any]] = []
    matched_rows = 0
    ready_rows = 0
    warning_rows = 0
    blocked_rows = 0

    for row_number, raw_row in enumerate(rows, start=1):
        preview_row = _preview_single_row(
            raw_row,
            row_number=row_number,
            indexes=indexes,
            active_currency_codes=active_currency_codes,
            default_limit_currency_code=default_limit_currency_code,
        )
        preview_rows.append(preview_row)
        if preview_row["matched_counterparty_code"] is not None:
            matched_rows += 1
        has_warning = any(issue["severity"] == "warning" for issue in preview_row["issues"])
        has_error = any(issue["severity"] == "error" for issue in preview_row["issues"])
        if preview_row["ready_to_import"]:
            ready_rows += 1
        if has_warning:
            warning_rows += 1
        if has_error:
            blocked_rows += 1

    return {
        "provider": "DNB",
        "total_rows": len(rows),
        "matched_rows": matched_rows,
        "ready_rows": ready_rows,
        "warning_rows": warning_rows,
        "blocked_rows": blocked_rows,
        "rows": preview_rows,
    }


def _preview_single_row(
    raw_row: dict[str, Any],
    *,
    row_number: int,
    indexes: dict[str, dict[str, list[ReferenceCounterparty]]],
    active_currency_codes: set[str],
    default_limit_currency_code: Optional[str],
) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    flattened = _flatten_mapping(raw_row)
    explicit_counterparty_code = _normalize_optional_code(_find_text(flattened, "counterpartycode", "counterparty"))
    duns_number = _normalize_duns_number(_find_text(flattened, "duns", "dunsnumber", "dunsnum"))
    lei_code = _normalize_optional_code(_find_text(flattened, "lei", "leicode"))
    ticker_symbol = _normalize_optional_code(_find_text(flattened, "ticker", "tickersymbol"))
    source_entity_name = _find_text(
        flattened,
        "organizationprimaryname",
        "primaryname",
        "organizationname",
        "companyname",
        "name",
    )
    source_entity_id = duns_number or _find_text(flattened, "sourceentityid", "organizationid")
    as_of_date = _find_date(
        flattened,
        "asofdate",
        "scoredate",
        "lastupdatedate",
        "analysisdate",
        "date",
    )
    if as_of_date is None:
        issues.append(
            _issue(
                "error",
                "missing_as_of_date",
                "D&B preview rows need an as_of_date, score_date, analysis_date, or similar source date.",
            )
        )

    dnb_rating = _find_text(flattened, "dnbstandardrating", "dnbrating", "dnbratingtext")
    rating_value = dnb_rating or _find_text(flattened, "ratingvalue", "rating")
    rating_outlook = _find_text(flattened, "ratingoutlook", "outlook")
    credit_score = _find_numeric(
        flattened,
        path_fragments=("commercialcreditscore",),
        aliases=("rawscore", "currentscore", "creditscore"),
    )
    if credit_score is None:
        credit_score = _find_numeric(flattened, aliases=("commercialcreditscore", "creditscore"))
    probability_of_default = _find_numeric(
        flattened,
        aliases=(
            "probabilityofdefault",
            "probabilityoffailurewiththisscore",
            "businessfailureprobability",
            "failureprobability",
        ),
    )

    recommended_limit_amount = _find_numeric(
        flattened,
        path_fragments=("dnbcreditlimitrecommendation",),
        aliases=("maximumrecommendedlimitamount", "recommendedlimitamount"),
    )
    if recommended_limit_amount is None:
        recommended_limit_amount = _find_numeric(
            flattened,
            aliases=("maximumcreditrecommendation", "recommendedlimitamount", "maximumcreditlimit"),
        )
    recommended_limit_currency_code = _normalize_optional_code(
        _find_text(
            flattened,
            "recommendedlimitcurrencycode",
            "maximumrecommendedlimitcurrencycode",
            "currencycode",
            "currency",
        )
    )

    if recommended_limit_amount is not None and recommended_limit_currency_code is None:
        fallback_currency = _normalize_optional_code(default_limit_currency_code)
        if fallback_currency is None:
            issues.append(
                _issue(
                    "error",
                    "missing_limit_currency",
                    "A recommended limit amount was found, but no limit currency was provided or configured.",
                )
            )
        else:
            recommended_limit_currency_code = fallback_currency
            issues.append(
                _issue(
                    "warning",
                    "assumed_limit_currency",
                    f"No D&B limit currency was provided, so the preview assumed {fallback_currency}.",
                )
            )

    if recommended_limit_currency_code is not None and recommended_limit_currency_code not in active_currency_codes:
        issues.append(
            _issue(
                "error",
                "inactive_limit_currency",
                f"Recommended limit currency '{recommended_limit_currency_code}' is not active in reference data.",
            )
        )

    match = _match_counterparty(
        indexes=indexes,
        explicit_counterparty_code=explicit_counterparty_code,
        duns_number=duns_number,
        lei_code=lei_code,
        ticker_symbol=ticker_symbol,
        source_entity_name=source_entity_name,
    )
    issues.extend(match["issues"])

    matched_counterparty: ReferenceCounterparty | None = match["counterparty"]
    matched_counterparty_code = matched_counterparty.code if matched_counterparty is not None else None
    matched_counterparty_name = matched_counterparty.name if matched_counterparty is not None else None
    counterparty_is_active = matched_counterparty.is_active if matched_counterparty is not None else None
    if matched_counterparty is not None and not matched_counterparty.is_active:
        issues.append(
            _issue(
                "warning",
                "inactive_counterparty",
                f"Matched counterparty '{matched_counterparty.code}' is inactive in reference data.",
            )
        )

    commentary = _find_text(flattened, "commentary", "commentarytext", "scorecommentary", "riskcommentary")
    derived_notes = []
    if dnb_rating:
        derived_notes.append(f"D&B rating {dnb_rating}")
    financial_stress_class = _find_text(
        flattened,
        "financialstressclass",
        "financialstressscoreclass",
        "financialstressclassscore",
    )
    if financial_stress_class:
        derived_notes.append(f"Financial Stress Class {financial_stress_class}")
    if commentary:
        derived_notes.append(commentary)
    combined_commentary = "; ".join(derived_notes) if derived_notes else None

    if (
        rating_value is None
        and credit_score is None
        and probability_of_default is None
        and recommended_limit_amount is None
    ):
        issues.append(
            _issue(
                "error",
                "no_credit_metrics",
                "No D&B rating, score, probability of default, or recommended limit was found in this row.",
            )
        )

    ready_to_import = matched_counterparty_code is not None and not any(
        issue["severity"] == "error" for issue in issues
    )
    snapshot = None
    if ready_to_import and as_of_date is not None:
        snapshot = CounterpartyCreditSnapshotImport(
            counterparty_code=matched_counterparty_code,
            source_entity_id=source_entity_id,
            source_entity_name=source_entity_name,
            match_basis=match["basis"],
            matched_identifier_value=match["identifier_value"],
            as_of_date=as_of_date,
            rating_scale="D&B Rating" if rating_value is not None else None,
            rating_value=rating_value,
            rating_outlook=rating_outlook,
            credit_score=credit_score,
            probability_of_default=probability_of_default,
            recommended_limit_currency_code=recommended_limit_currency_code,
            recommended_limit_amount=recommended_limit_amount,
            commentary=combined_commentary,
            downloaded_at=datetime.now(timezone.utc),
            raw_payload=raw_row,
        )

    return {
        "row_number": row_number,
        "source_entity_id": source_entity_id,
        "source_entity_name": source_entity_name,
        "matched_counterparty_code": matched_counterparty_code,
        "matched_counterparty_name": matched_counterparty_name,
        "counterparty_is_active": counterparty_is_active,
        "match_status": match["status"],
        "match_basis": match["basis"],
        "matched_identifier_value": match["identifier_value"],
        "rating_scale": "D&B Rating" if rating_value is not None else None,
        "rating_value": rating_value,
        "rating_outlook": rating_outlook,
        "credit_score": credit_score,
        "probability_of_default": probability_of_default,
        "recommended_limit_currency_code": recommended_limit_currency_code,
        "recommended_limit_amount": recommended_limit_amount,
        "commentary": combined_commentary,
        "issues": issues,
        "ready_to_import": ready_to_import,
        "snapshot": snapshot.model_dump(mode="json") if snapshot is not None else None,
    }


def _build_counterparty_indexes(
    counterparties: Iterable[ReferenceCounterparty],
) -> dict[str, dict[str, list[ReferenceCounterparty]]]:
    indexes: dict[str, dict[str, list[ReferenceCounterparty]]] = {
        "code": {},
        "duns": {},
        "lei": {},
        "ticker": {},
        "name": {},
    }
    for counterparty in counterparties:
        _add_to_index(indexes["code"], counterparty.code, counterparty)
        if counterparty.duns_number:
            _add_to_index(indexes["duns"], _normalize_duns_number(counterparty.duns_number), counterparty)
        if counterparty.lei_code:
            _add_to_index(indexes["lei"], normalize_code(counterparty.lei_code), counterparty)
        if counterparty.ticker_symbol:
            _add_to_index(indexes["ticker"], normalize_code(counterparty.ticker_symbol), counterparty)
        for value in (counterparty.name, counterparty.short_name, counterparty.legal_entity_name):
            normalized_name = _normalize_name(value)
            if normalized_name:
                _add_to_index(indexes["name"], normalized_name, counterparty)
    return indexes


def _match_counterparty(
    *,
    indexes: dict[str, dict[str, list[ReferenceCounterparty]]],
    explicit_counterparty_code: Optional[str],
    duns_number: Optional[str],
    lei_code: Optional[str],
    ticker_symbol: Optional[str],
    source_entity_name: Optional[str],
) -> dict[str, Any]:
    candidates = (
        ("COUNTERPARTY_CODE", explicit_counterparty_code, indexes["code"]),
        ("DUNS", duns_number, indexes["duns"]),
        ("LEI", lei_code, indexes["lei"]),
        ("TICKER", ticker_symbol, indexes["ticker"]),
        ("NAME", _normalize_name(source_entity_name), indexes["name"]),
    )

    issues: list[dict[str, str]] = []
    for basis, value, index in candidates:
        if not value:
            continue
        matches = index.get(value, [])
        unique_matches = []
        seen_codes: set[str] = set()
        for match in matches:
            if match.code in seen_codes:
                continue
            seen_codes.add(match.code)
            unique_matches.append(match)

        if len(unique_matches) == 1:
            if basis == "NAME":
                issues.append(
                    _issue(
                        "warning",
                        "name_match",
                        f"Matched {unique_matches[0].code} by exact name instead of a stable identifier.",
                    )
                )
            return {
                "status": "MATCHED",
                "basis": basis,
                "identifier_value": value,
                "counterparty": unique_matches[0],
                "issues": issues,
            }

        if len(unique_matches) > 1:
            issues.append(
                _issue(
                    "error",
                    "ambiguous_match",
                    f"{basis} value '{value}' matched multiple counterparties: "
                    + ", ".join(match.code for match in unique_matches),
                )
            )
            return {
                "status": "AMBIGUOUS",
                "basis": basis,
                "identifier_value": value,
                "counterparty": None,
                "issues": issues,
            }

    issues.append(
        _issue(
            "error",
            "unmatched_counterparty",
            "No counterparty match was found using counterparty code, DUNS, LEI, ticker, or exact name.",
        )
    )
    return {
        "status": "UNMATCHED",
        "basis": None,
        "identifier_value": None,
        "counterparty": None,
        "issues": issues,
    }


def _issue(severity: str, code: str, message: str) -> dict[str, str]:
    return {
        "severity": severity,
        "code": code,
        "message": message,
    }


def _add_to_index(
    index: dict[str, list[ReferenceCounterparty]],
    key: Optional[str],
    counterparty: ReferenceCounterparty,
) -> None:
    if not key:
        return
    index.setdefault(key, []).append(counterparty)


def _flatten_mapping(
    value: Any,
    *,
    path: tuple[str, ...] = (),
) -> list[tuple[str, str, Any]]:
    if isinstance(value, dict):
        flattened: list[tuple[str, str, Any]] = []
        for key, nested_value in value.items():
            key_text = str(key)
            flattened.extend(_flatten_mapping(nested_value, path=(*path, key_text)))
        return flattened
    if isinstance(value, list):
        flattened: list[tuple[str, str, Any]] = []
        for index, nested_value in enumerate(value):
            flattened.extend(_flatten_mapping(nested_value, path=(*path, str(index))))
        return flattened

    leaf_key = path[-1] if path else ""
    return [
        (
            "".join(_normalize_token(token) for token in path),
            _normalize_token(leaf_key),
            value,
        )
    ]


def _find_text(flattened: list[tuple[str, str, Any]], *aliases: str) -> Optional[str]:
    alias_set = {_normalize_token(alias) for alias in aliases}
    for path_key, leaf_key, value in flattened:
        if value is None:
            continue
        if leaf_key in alias_set or path_key in alias_set:
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    return stripped
            else:
                return str(value)
    return None


def _find_numeric(
    flattened: list[tuple[str, str, Any]],
    *,
    aliases: Iterable[str] = (),
    path_fragments: Iterable[str] = (),
) -> Optional[float]:
    alias_set = {_normalize_token(alias) for alias in aliases}
    path_fragment_set = {_normalize_token(fragment) for fragment in path_fragments}

    for path_key, leaf_key, value in flattened:
        if value is None:
            continue
        if alias_set and leaf_key not in alias_set and path_key not in alias_set:
            continue
        if path_fragment_set and not any(fragment in path_key for fragment in path_fragment_set):
            continue
        numeric_value = _coerce_float(value)
        if numeric_value is not None:
            return numeric_value
    return None


def _find_date(flattened: list[tuple[str, str, Any]], *aliases: str) -> Optional[date]:
    value = _find_text(flattened, *aliases)
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value.split("T", maxsplit=1)[0])
        except ValueError:
            return None


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip().replace(",", "")
        if not normalized:
            return None
        try:
            return float(Decimal(normalized))
        except (InvalidOperation, ValueError):
            return None
    return None


def _normalize_name(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = " ".join(value.upper().split())
    return normalized or None


def _normalize_optional_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return normalize_code(stripped) if stripped else None


def _normalize_duns_number(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    digits_only = "".join(character for character in value if character.isdigit())
    return digits_only or None


def _normalize_token(value: str) -> str:
    return "".join(character for character in value.lower() if character.isalnum())
