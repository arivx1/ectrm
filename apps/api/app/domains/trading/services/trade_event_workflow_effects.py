from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from apps.api.app.domains.operations.services.trade_confirmations import (
    ensure_trade_confirmation_draft_for_trade_capture,
)
from apps.api.app.domains.operations.services.trade_confirmations import (
    maybe_supersede_trade_confirmation_for_trade_amendment,
)
from apps.api.app.domains.operations.services.workflow_items import create_trade_workflow_item
from apps.api.app.domains.operations.services.workflow_items import synchronize_trade_workflow_items
from apps.api.app.domains.reports.services.pretrade_governance import (
    build_pretrade_governance_audit_export,
)
from apps.api.app.domains.reports.services.pretrade_reviews import (
    REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY,
    link_approved_pretrade_review_to_trade,
    persist_review_governance_snapshot,
)
from apps.api.app.domains.trading.services.trade_credit_approval_workflow import (
    sync_credit_approval_workflow_item,
)
from apps.api.app.domains.trading.services.trade_write_contracts import (
    ValidatedAmendTradeWrite,
    ValidatedBookTradeWrite,
)
from apps.api.app.models.trade import Trade
from apps.api.app.shared.enums import OptionSettlementStatus, TradeStatus, TradeWorkflowType


def sync_trade_created_workflows(
    db: Session,
    *,
    trade: Trade,
    validated: ValidatedBookTradeWrite,
    payload_data: dict[str, object],
    actor_id: str,
    recorded_at: datetime,
) -> None:
    synchronize_trade_workflow_items(
        db,
        trade,
        actor_id=actor_id,
        now=recorded_at,
        rollup_settlement_status="settlement_status" not in payload_data,
    )
    sync_credit_approval_workflow_item(
        db,
        trade=trade,
        actor_id=actor_id,
        now=recorded_at,
        policy_result=validated.counterparty_credit_policy,
    )
    ensure_trade_confirmation_draft_for_trade_capture(
        db,
        trade=trade,
        actor_id=actor_id,
        now=recorded_at,
    )
    if validated.pretrade_review_id is not None:
        try:
            linked_review = link_approved_pretrade_review_to_trade(
                db,
                review_id=validated.pretrade_review_id,
                trade_id=trade.trade_id,
                actor_id=actor_id,
                booked_at=recorded_at,
            )
            persist_review_governance_snapshot(
                linked_review,
                snapshot=build_pretrade_governance_audit_export(
                    db,
                    actor_id=actor_id,
                    generated_at=recorded_at,
                ),
                snapshot_key=REVIEW_BOOKING_GOVERNANCE_SNAPSHOT_KEY,
                activity_action="BOOKED",
            )
        except LookupError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


def sync_trade_amended_workflows(
    db: Session,
    *,
    trade: Trade,
    validated: ValidatedAmendTradeWrite,
    payload_data: dict[str, object],
    actor_id: str,
    recorded_at: datetime,
    before_confirmation_revision: dict[str, object | None],
) -> None:
    synchronize_trade_workflow_items(
        db,
        trade,
        actor_id=actor_id,
        now=recorded_at,
        rollup_settlement_status=(
            "settlement_status" not in payload_data
            and bool({"invoice_status", "payment_status"} & set(payload_data))
        ),
    )
    sync_credit_approval_workflow_item(
        db,
        trade=trade,
        actor_id=actor_id,
        now=recorded_at,
        policy_result=validated.counterparty_credit_policy,
    )
    maybe_supersede_trade_confirmation_for_trade_amendment(
        db,
        trade=trade,
        actor_id=actor_id,
        now=recorded_at,
        before_revision_snapshot=before_confirmation_revision,
    )


def sync_option_settlement_workflow(
    db: Session,
    *,
    trade: Trade,
    actor_id: str,
    recorded_at: datetime,
) -> None:
    if trade.status not in {TradeStatus.EXERCISED.value, TradeStatus.ASSIGNED.value}:
        return
    create_trade_workflow_item(
        db,
        trade_id=trade.trade_id,
        workflow_type=TradeWorkflowType.OPTION_SETTLEMENT.value,
        actor_id=actor_id,
        enforce_credit_authorization=False,
        status=OptionSettlementStatus.PENDING.value,
        now=recorded_at,
    )
