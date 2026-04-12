from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Generic, TypeVar

from sqlalchemy.orm import Session

RequestT = TypeVar("RequestT", bound="OperationalResourceListRequest")
RowT = TypeVar("RowT")
ContextT = TypeVar("ContextT")
ItemT = TypeVar("ItemT")


@dataclass(frozen=True, slots=True)
class OperationalResourceListRequest:
    reference_time: datetime
    limit: int | None = None
    offset: int = 0


@dataclass(frozen=True, slots=True)
class OperationalResourceDescriptor(Generic[RequestT, RowT, ContextT, ItemT]):
    resource_key: str
    filters: tuple[str, ...]
    sort_fields: tuple[str, ...]
    actions: tuple[str, ...]
    load_rows: Callable[[Session, RequestT], list[RowT]]
    load_context: Callable[[Session, list[RowT], RequestT], ContextT]
    build_item: Callable[[RowT, ContextT, RequestT], ItemT]
    synchronize: Callable[[Session, RequestT], None] | None = None
    finalize_items: Callable[[list[ItemT], RequestT], list[ItemT]] | None = None


def paginate_operational_items(
    items: list[ItemT],
    request: OperationalResourceListRequest,
) -> list[ItemT]:
    paged_items = items
    if request.offset:
        paged_items = paged_items[request.offset :]
    if request.limit is not None:
        return paged_items[: request.limit]
    return paged_items


def load_operational_resource_items(
    descriptor: OperationalResourceDescriptor[RequestT, RowT, ContextT, ItemT],
    db: Session,
    request: RequestT,
) -> list[ItemT]:
    if descriptor.synchronize is not None:
        descriptor.synchronize(db, request)
    rows = descriptor.load_rows(db, request)
    context = descriptor.load_context(db, rows, request)
    items = [descriptor.build_item(row, context, request) for row in rows]
    if descriptor.finalize_items is not None:
        return descriptor.finalize_items(items, request)
    return items
