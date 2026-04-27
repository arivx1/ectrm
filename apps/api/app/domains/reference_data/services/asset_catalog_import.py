from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.core.auth import resolve_audit_actor_id
from apps.api.app.domains.reference_data.services.asset_standards import (
    DEFAULT_ASSET_OPERATING_STATUS,
    DEFAULT_ASSET_REALITY,
    DEFAULT_ASSET_TYPE_BY_CLASS,
    normalize_asset_class,
    normalize_asset_operating_status,
    normalize_asset_reality,
    normalize_asset_type,
)
from apps.api.app.domains.reference_data.services.records import normalize_code
from apps.api.app.models.reference_asset import ReferenceAsset

_MAX_ASSET_NAME_LENGTH = 120
_ROW_OR_FEATURE_SUFFIX_PATTERN = re.compile(r"_(ROW|FEATURE)_(\d+)$")


@dataclass(frozen=True, slots=True)
class AssetCatalogImportSummary:
    source_path: str
    total_rows: int
    created_count: int
    updated_count: int
    skipped_existing_count: int
    derived_name_count: int
    defaulted_asset_type_count: int
    defaulted_operating_status_count: int


def import_reference_asset_catalog(
    db: Session,
    *,
    source_path: str | Path,
    requested_by: str,
    replace_existing: bool = True,
) -> AssetCatalogImportSummary:
    path = Path(source_path).expanduser().resolve()
    rows = _load_catalog_rows(path)
    now = datetime.now(timezone.utc)
    actor_id = resolve_audit_actor_id(requested_by)

    created_count = 0
    updated_count = 0
    skipped_existing_count = 0
    derived_name_count = 0
    defaulted_asset_type_count = 0
    defaulted_operating_status_count = 0

    for raw_row in rows:
        normalized_row = _normalize_catalog_row(raw_row)
        derived_name_count += int(normalized_row.pop("_derived_name"))
        defaulted_asset_type_count += int(normalized_row.pop("_defaulted_asset_type"))
        defaulted_operating_status_count += int(normalized_row.pop("_defaulted_operating_status"))

        record = db.get(ReferenceAsset, normalized_row["code"])
        if record is None:
            db.add(
                ReferenceAsset(
                    **normalized_row,
                    is_active=True,
                    effective_from=None,
                    effective_to=None,
                    created_at=now,
                    created_by=actor_id,
                    updated_at=now,
                    updated_by=actor_id,
                    version=1,
                )
            )
            created_count += 1
            continue

        if not replace_existing:
            skipped_existing_count += 1
            continue

        for field, value in normalized_row.items():
            setattr(record, field, value)
        record.is_active = True
        record.updated_at = now
        record.updated_by = actor_id
        record.version += 1
        updated_count += 1

    db.commit()
    return AssetCatalogImportSummary(
        source_path=str(path),
        total_rows=len(rows),
        created_count=created_count,
        updated_count=updated_count,
        skipped_existing_count=skipped_existing_count,
        derived_name_count=derived_name_count,
        defaulted_asset_type_count=defaulted_asset_type_count,
        defaulted_operating_status_count=defaulted_operating_status_count,
    )


def _load_catalog_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, dict):
        rows = payload.get("assets")
    else:
        rows = payload

    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Asset catalog JSON must contain an 'assets' list of objects")

    return rows


def _normalize_catalog_row(row: dict[str, Any]) -> dict[str, Any]:
    code = normalize_code(_require_text(row.get("code"), field_name="code"))
    if len(code) > 100:
        raise ValueError(f"Asset code '{code}' exceeds the 100 character limit")

    asset_class = normalize_asset_class(_require_text(row.get("asset_class"), field_name="asset_class"))

    raw_asset_type = _clean_optional_text(row.get("asset_type"))
    defaulted_asset_type = raw_asset_type is None
    asset_type = (
        DEFAULT_ASSET_TYPE_BY_CLASS[asset_class]
        if defaulted_asset_type
        else normalize_asset_type(raw_asset_type, asset_class=asset_class)
    )

    raw_operating_status = _clean_optional_text(row.get("operating_status"))
    defaulted_operating_status = raw_operating_status is None
    operating_status = (
        DEFAULT_ASSET_OPERATING_STATUS
        if defaulted_operating_status
        else normalize_asset_operating_status(raw_operating_status)
    )

    source_name = _clean_optional_text(row.get("source_name"))
    name = _clean_optional_text(row.get("name"))
    derived_name = name is None
    if name is None:
        name = _derive_name(code=code, source_name=source_name)

    notes = _build_notes(
        base_notes=_clean_optional_text(row.get("notes")),
        derived_name=derived_name,
        defaulted_asset_type=defaulted_asset_type,
        defaulted_operating_status=defaulted_operating_status,
    )

    return {
        "code": code,
        "name": name,
        "asset_class": asset_class,
        "asset_type": asset_type,
        "asset_reality": normalize_asset_reality(
            _clean_optional_text(row.get("asset_reality")) or DEFAULT_ASSET_REALITY
        ),
        "commodity_code": _normalize_optional_code(row.get("commodity_code")),
        "location_code": _normalize_optional_code(row.get("location_code")),
        "capacity_value": _normalize_optional_float(row.get("capacity_value"), field_name="capacity_value"),
        "capacity_unit_code": _normalize_optional_code(row.get("capacity_unit_code")),
        "operator_name": _clean_optional_text(row.get("operator_name")),
        "operating_status": operating_status,
        "source_name": source_name,
        "source_url": _clean_optional_text(row.get("source_url")),
        "confidence": _normalize_optional_confidence(row.get("confidence")),
        "notes": notes,
        "description": _clean_optional_text(row.get("description")),
        "_derived_name": derived_name,
        "_defaulted_asset_type": defaulted_asset_type,
        "_defaulted_operating_status": defaulted_operating_status,
    }


def _require_text(value: Any, *, field_name: str) -> str:
    cleaned = _clean_optional_text(value)
    if cleaned is None:
        raise ValueError(f"Asset catalog row is missing required field '{field_name}'")
    return cleaned


def _clean_optional_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def _normalize_optional_code(value: Any) -> str | None:
    cleaned = _clean_optional_text(value)
    return normalize_code(cleaned) if cleaned is not None else None


def _normalize_optional_float(value: Any, *, field_name: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Asset catalog field '{field_name}' must be numeric when provided") from exc


def _normalize_optional_confidence(value: Any) -> float | None:
    if value is None or value == "":
        return None
    normalized = _normalize_optional_float(value, field_name="confidence")
    assert normalized is not None
    if normalized < 0 or normalized > 1:
        raise ValueError("Asset catalog field 'confidence' must be between 0 and 1")
    return normalized


def _derive_name(*, code: str, source_name: str | None) -> str:
    match = _ROW_OR_FEATURE_SUFFIX_PATTERN.search(code)
    if source_name is not None:
        source_label = source_name.split(" via ", 1)[0].replace("_", " ").strip(" -")
        if match is not None:
            return _truncate_name(f"{source_label} {match.group(1).title()} {match.group(2)}")
        return _truncate_name(source_label)
    return _truncate_name(code.replace("_", " "))


def _truncate_name(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) <= _MAX_ASSET_NAME_LENGTH:
        return trimmed
    return trimmed[: _MAX_ASSET_NAME_LENGTH - 3].rstrip() + "..."


def _build_notes(
    *,
    base_notes: str | None,
    derived_name: bool,
    defaulted_asset_type: bool,
    defaulted_operating_status: bool,
) -> str | None:
    import_notes: list[str] = []
    if derived_name:
        import_notes.append("display name derived during import because source row omitted name")
    if defaulted_asset_type:
        import_notes.append("asset type defaulted from asset class during import")
    if defaulted_operating_status:
        import_notes.append("operating status defaulted to OPERATING during import")

    if not import_notes:
        return base_notes

    normalized_import_note = "Import normalization: " + "; ".join(import_notes) + "."
    if base_notes is None:
        return normalized_import_note
    return base_notes + "\n\n" + normalized_import_note
