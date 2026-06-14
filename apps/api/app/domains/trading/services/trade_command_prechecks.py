from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy.orm import Session

from apps.api.app.domains.trading.services.trade_command_contracts import (
    TradeWriteCommand,
)
from apps.api.app.domains.trading.services.trade_command_guards import (
    enforce_trade_write_stale_state,
    ensure_trade_write_authorized,
    load_existing_trade,
    require_expected_last_event_id,
)
from apps.api.app.domains.trading.services.trade_command_payload_prechecks import (
    precheck_amend_trade,
    precheck_book_trade,
    precheck_cancel_trade,
    precheck_correct_trade,
)


def precheck_trade_write(db: Session, command: TradeWriteCommand) -> Mapping[str, Any]:
    ensure_trade_write_authorized()
    if command.command_type == "BookTrade":
        return precheck_book_trade(db, command)
    if command.command_type == "AmendTradeTerms":
        trade = load_existing_trade(db, command.trade_id)
        enforce_trade_write_stale_state(trade, command)
        return precheck_amend_trade(db, command, trade=trade)
    if command.command_type == "CancelTrade":
        trade = load_existing_trade(db, command.trade_id)
        enforce_trade_write_stale_state(trade, command)
        return precheck_cancel_trade(command, trade=trade)
    if command.command_type == "CorrectTrade":
        require_expected_last_event_id(command)
        trade = load_existing_trade(db, command.trade_id)
        enforce_trade_write_stale_state(trade, command)
        return precheck_correct_trade(db, command, trade=trade)
    return dict(command.payload or {})
