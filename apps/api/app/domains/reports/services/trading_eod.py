from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from apps.api.app.domains.accruals.services.accruals import (
    build_accrual_reconciliation_report,
)
from apps.api.app.domains.operations.services import build_workspace_bootstrap_summary
from apps.api.app.domains.operations.services.trade_projection_integrity import (
    list_trade_projection_invariant_issues,
    list_trade_projection_integrity_issues,
)
from apps.api.app.domains.reports.services.pnl_history import build_pnl_history_report
from apps.api.app.domains.reports.services.settlement import (
    build_settlement_aging_report,
    build_settlement_exception_report,
)

TRADING_EOD_BASIS = (
    "Trading EOD combines current trade, workflow, settlement, projection-integrity, accrual, and "
    "P&L evidence into one deterministic close posture. P&L and settlement sections honor the requested "
    "as_of date, while trade, workflow, projection, and accrual sections currently reflect live "
    "projections evaluated at the EOD timestamp."
)
LIVE_PROJECTION_COVERAGE_NOTE = (
    "Trade, workflow, projection-integrity, and accrual sections currently reflect live projections "
    "evaluated at the EOD timestamp rather than historical as_of snapshots."
)
ACCRUAL_COVERAGE_NOTE = (
    "Accrual reconciliation currently reflects live accrual lot projections and does not yet support "
    "historical as_of snapshotting."
)
PNL_COVERAGE_NOTE = (
    "P&L totals currently exclude active trades outside the supported valuation methodology or missing "
    "required pricing inputs."
)

STATUS_READY = "READY"
STATUS_WARNING = "WARNING"
STATUS_BLOCKED = "BLOCKED"


def _resolve_basis(
    *,
    business_date: date | None,
    as_of: date | None,
    generated_at: datetime,
) -> tuple[date, date]:
    resolved_as_of = as_of or business_date or generated_at.date()
    resolved_business_date = business_date or resolved_as_of
    return resolved_business_date, resolved_as_of


def _eod_timestamp(as_of: date) -> datetime:
    return datetime.combine(as_of, time(hour=23, minute=59, second=59), tzinfo=timezone.utc)


def _build_pricing_check(
    *,
    active_trade_count: int,
    pending_pricing_count: int,
    pnl_priced_trade_count: int,
) -> dict[str, Any]:
    pnl_excluded_trade_count = max(active_trade_count - pnl_priced_trade_count, 0)
    if active_trade_count == 0:
        return {
            "key": "pricing_readiness",
            "title": "Pricing readiness",
            "status": STATUS_READY,
            "owner_role": "Desk Lead",
            "reason": "No active trades are currently loaded for the close date.",
            "supporting_metrics": {
                "active_trade_count": active_trade_count,
                "pending_pricing_count": pending_pricing_count,
                "pnl_priced_trade_count": pnl_priced_trade_count,
                "pnl_excluded_trade_count": pnl_excluded_trade_count,
            },
        }

    if pending_pricing_count == 0 and pnl_excluded_trade_count == 0:
        status = STATUS_READY
        reason = "All active trades are priced and included in current P&L totals."
    else:
        status = STATUS_WARNING
        reason_parts: list[str] = []
        if pending_pricing_count > 0:
            reason_parts.append(f"{pending_pricing_count} active trade(s) remain in pending pricing")
        if pnl_excluded_trade_count > 0:
            reason_parts.append(
                f"{pnl_excluded_trade_count} active trade(s) are not included in current P&L totals"
            )
        reason = "; ".join(reason_parts) + "."

    return {
        "key": "pricing_readiness",
        "title": "Pricing readiness",
        "status": status,
        "owner_role": "Desk Lead",
        "reason": reason,
        "supporting_metrics": {
            "active_trade_count": active_trade_count,
            "pending_pricing_count": pending_pricing_count,
            "pnl_priced_trade_count": pnl_priced_trade_count,
            "pnl_excluded_trade_count": pnl_excluded_trade_count,
        },
    }


def _build_workflow_check(
    *,
    open_work_item_count: int,
    operations_queue_count: int,
    settlement_queue_count: int,
    attention_count: int,
) -> dict[str, Any]:
    if open_work_item_count == 0 and attention_count == 0:
        status = STATUS_READY
        reason = "No open workflow items or attention candidates remain across operations or settlement."
    else:
        status = STATUS_WARNING
        reason = (
            f"{open_work_item_count} open workflow item(s) and {attention_count} attention candidate(s) "
            "still need follow-through."
        )

    return {
        "key": "workflow_pressure",
        "title": "Workflow pressure",
        "status": status,
        "owner_role": "Operations Lead",
        "reason": reason,
        "supporting_metrics": {
            "open_work_item_count": open_work_item_count,
            "operations_queue_count": operations_queue_count,
            "settlement_queue_count": settlement_queue_count,
            "attention_count": attention_count,
        },
    }


def _build_settlement_check(
    *,
    blocked_exception_count: int,
    warning_exception_count: int,
    overdue_invoice_count: int,
    disputed_invoice_count: int,
) -> dict[str, Any]:
    if blocked_exception_count > 0:
        status = STATUS_BLOCKED
        reason = (
            f"{blocked_exception_count} blocked settlement exception(s) remain, with "
            f"{overdue_invoice_count} overdue invoice(s) and {disputed_invoice_count} disputed invoice(s)."
        )
    elif warning_exception_count > 0 or overdue_invoice_count > 0 or disputed_invoice_count > 0:
        status = STATUS_WARNING
        reason = (
            f"{warning_exception_count} in-progress settlement exception(s) remain, with "
            f"{overdue_invoice_count} overdue invoice(s) and {disputed_invoice_count} disputed invoice(s)."
        )
    else:
        status = STATUS_READY
        reason = "No settlement exceptions, overdue invoices, or disputed invoices are currently open."

    return {
        "key": "settlement_posture",
        "title": "Settlement posture",
        "status": status,
        "owner_role": "Settlement Lead",
        "reason": reason,
        "supporting_metrics": {
            "blocked_exception_count": blocked_exception_count,
            "warning_exception_count": warning_exception_count,
            "overdue_invoice_count": overdue_invoice_count,
            "disputed_invoice_count": disputed_invoice_count,
        },
    }


def _build_projection_check(
    *,
    structural_issue_count: int,
    invariant_issue_count: int,
    impacted_trade_count: int,
) -> dict[str, Any]:
    if structural_issue_count > 0 or invariant_issue_count > 0:
        status = STATUS_BLOCKED
        reason = (
            f"{structural_issue_count} structural issue(s) and {invariant_issue_count} invariant issue(s) "
            f"currently affect {impacted_trade_count} trade(s)."
        )
    else:
        status = STATUS_READY
        reason = "No structural projection-integrity or invariant issues are currently open."

    return {
        "key": "projection_integrity",
        "title": "Projection integrity",
        "status": status,
        "owner_role": "Admin or Platform Owner",
        "reason": reason,
        "supporting_metrics": {
            "structural_issue_count": structural_issue_count,
            "invariant_issue_count": invariant_issue_count,
            "impacted_trade_count": impacted_trade_count,
        },
    }


def _rollup_status(checks: list[dict[str, Any]]) -> tuple[str, int, int, int]:
    blocked_count = sum(1 for check in checks if check["status"] == STATUS_BLOCKED)
    warning_count = sum(1 for check in checks if check["status"] == STATUS_WARNING)
    ready_count = sum(1 for check in checks if check["status"] == STATUS_READY)

    if blocked_count > 0:
        return STATUS_BLOCKED, blocked_count, warning_count, ready_count
    if warning_count > 0:
        return STATUS_WARNING, blocked_count, warning_count, ready_count
    return STATUS_READY, blocked_count, warning_count, ready_count


def _sum_float_rows(rows: list[dict[str, Any]], key: str) -> float:
    total = Decimal("0")
    for row in rows:
        total += Decimal(str(row.get(key) or 0))
    return float(total)


def build_trading_eod_report(
    db: Session,
    *,
    business_date: date | None = None,
    as_of: date | None = None,
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    resolved_business_date, resolved_as_of = _resolve_basis(
        business_date=business_date,
        as_of=as_of,
        generated_at=generated_at,
    )
    evaluation_timestamp = _eod_timestamp(resolved_as_of)

    workspace_summary = build_workspace_bootstrap_summary(db, now=evaluation_timestamp)
    pnl_report = build_pnl_history_report(db, as_of=resolved_as_of)
    settlement_aging = build_settlement_aging_report(db, as_of=resolved_as_of)
    settlement_exceptions = build_settlement_exception_report(db, as_of=resolved_as_of)
    accrual_report = build_accrual_reconciliation_report(db)
    structural_issues = list_trade_projection_integrity_issues(db)
    invariant_issues = list_trade_projection_invariant_issues(db, now=evaluation_timestamp)

    trade_summary = workspace_summary["trades"]
    work_item_summary = workspace_summary["work_items"]
    attention_summary = workspace_summary["dashboard"]["attention"]
    settlement_summary = workspace_summary["settlement"]
    pnl_summary = pnl_report["summary"]

    impacted_trade_ids = {
        *[issue.trade_id for issue in structural_issues],
        *[issue.trade_id for issue in invariant_issues],
    }

    checks = [
        _build_pricing_check(
            active_trade_count=int(trade_summary["active_count"]),
            pending_pricing_count=int(trade_summary["pending_pricing_count"]),
            pnl_priced_trade_count=int(pnl_summary["priced_trade_count"]),
        ),
        _build_workflow_check(
            open_work_item_count=int(work_item_summary["total_count"]),
            operations_queue_count=int(work_item_summary["operations_queue_count"]),
            settlement_queue_count=int(work_item_summary["settlement_queue_count"]),
            attention_count=int(attention_summary["total_count"]),
        ),
        _build_settlement_check(
            blocked_exception_count=int(settlement_exceptions["blocked_count"]),
            warning_exception_count=int(settlement_exceptions["warning_count"]),
            overdue_invoice_count=int(settlement_aging["overdue_invoice_count"]),
            disputed_invoice_count=int(settlement_aging["disputed_invoice_count"]),
        ),
        _build_projection_check(
            structural_issue_count=len(structural_issues),
            invariant_issue_count=len(invariant_issues),
            impacted_trade_count=len(impacted_trade_ids),
        ),
    ]
    status, blocked_check_count, warning_check_count, ready_check_count = _rollup_status(checks)

    coverage_notes = [
        LIVE_PROJECTION_COVERAGE_NOTE,
        ACCRUAL_COVERAGE_NOTE,
    ]
    if int(pnl_summary["priced_trade_count"]) < int(trade_summary["active_count"]):
        coverage_notes.append(PNL_COVERAGE_NOTE)

    return {
        "generated_at": generated_at,
        "business_date": resolved_business_date,
        "as_of": resolved_as_of,
        "evaluation_timestamp": evaluation_timestamp,
        "basis": TRADING_EOD_BASIS,
        "status": status,
        "blocked_check_count": blocked_check_count,
        "warning_check_count": warning_check_count,
        "ready_check_count": ready_check_count,
        "checks": checks,
        "coverage_notes": coverage_notes,
        "trade_summary": {
            "active_trade_count": int(trade_summary["active_count"]),
            "priced_active_count": int(trade_summary["priced_active_count"]),
            "pending_pricing_count": int(trade_summary["pending_pricing_count"]),
            "pending_settlement_count": int(trade_summary["pending_settlement_count"]),
            "tracked_book_count": int(trade_summary["tracked_book_count"]),
            "total_active_volume": float(trade_summary["total_active_volume"]),
        },
        "pnl_summary": {
            "basis": str(pnl_report["basis"]),
            "methodology": str(pnl_report["methodology"]),
            "total_pnl": float(pnl_summary["total_pnl"]),
            "realized_pnl": float(pnl_summary["realized_pnl"]),
            "unrealized_pnl": float(pnl_summary["unrealized_pnl"]),
            "priced_trade_count": int(pnl_summary["priced_trade_count"]),
            "realized_trade_count": int(pnl_summary["realized_trade_count"]),
            "unrealized_trade_count": int(pnl_summary["unrealized_trade_count"]),
        },
        "operations_summary": {
            "open_work_item_count": int(work_item_summary["total_count"]),
            "operations_queue_count": int(work_item_summary["operations_queue_count"]),
            "settlement_queue_count": int(work_item_summary["settlement_queue_count"]),
            "attention_count": int(attention_summary["total_count"]),
            "stale_pricing_count": int(attention_summary["stale_pricing_count"]),
            "incomplete_ops_data_count": int(attention_summary["incomplete_ops_data_count"]),
        },
        "settlement_summary": {
            "invoice_count": int(settlement_aging["invoice_count"]),
            "overdue_invoice_count": int(settlement_aging["overdue_invoice_count"]),
            "disputed_invoice_count": int(settlement_aging["disputed_invoice_count"]),
            "blocked_exception_count": int(settlement_exceptions["blocked_count"]),
            "warning_exception_count": int(settlement_exceptions["warning_count"]),
            "payment_due_count": int(settlement_summary["payment_due_count"]),
            "invoice_pending_count": int(settlement_summary["invoice_pending_count"]),
        },
        "projection_summary": {
            "structural_issue_count": len(structural_issues),
            "invariant_issue_count": len(invariant_issues),
            "impacted_trade_count": len(impacted_trade_ids),
        },
        "accrual_summary": {
            "row_count": int(accrual_report["row_count"]),
            "lot_count": int(accrual_report["lot_count"]),
            "unbilled_amount_total": _sum_float_rows(accrual_report["rows"], "unbilled_amount"),
            "billed_uncollected_amount_total": _sum_float_rows(
                accrual_report["rows"],
                "billed_uncollected_amount",
            ),
            "net_open_amount_total": _sum_float_rows(accrual_report["rows"], "net_open_amount"),
            "coverage_basis": "live_accrual_lot_projection",
        },
    }
