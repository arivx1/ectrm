from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Protocol, TypeAlias

from sqlalchemy.orm import Session

from apps.api.app.schemas.report import (
    ReportDefinitionDependencyEdge,
    SemanticDatasetFieldRole,
    SemanticDatasetFieldType,
)

WorkbookCellValue: TypeAlias = str | int | float | bool | date | datetime | None


class WorkbookAssemblyError(ValueError):
    pass


@dataclass(frozen=True)
class WorkbookColumnDefinition:
    field_key: str
    label: str
    data_type: SemanticDatasetFieldType
    role: SemanticDatasetFieldRole
    source_field_key: str | None = None

    @property
    def source_key(self) -> str:
        return self.source_field_key or self.field_key


@dataclass(frozen=True)
class WorkbookSheetDefinition:
    sheet_key: str
    sheet_name: str
    source_dataset_id: str | None
    columns: tuple[WorkbookColumnDefinition, ...]

    @property
    def column_keys(self) -> tuple[str, ...]:
        return tuple(column.field_key for column in self.columns)


@dataclass(frozen=True)
class WorkbookGenerationContract:
    workbook_key: str
    workbook_name: str
    sheets: tuple[WorkbookSheetDefinition, ...]
    parameter_keys: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkbookGenerationContext:
    db: Session
    requested_by: str
    parameters: Mapping[str, WorkbookCellValue]
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class WorkbookRowInput:
    values: Mapping[str, object]
    source_ref: str | None = None


@dataclass(frozen=True)
class WorkbookRenderResult:
    sheet_rows: Mapping[str, Sequence[WorkbookRowInput]]
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkbookRowSnapshot:
    values: dict[str, WorkbookCellValue]
    source_ref: str | None = None


@dataclass(frozen=True)
class WorkbookSheetSnapshot:
    sheet_key: str
    sheet_name: str
    source_dataset_id: str | None
    columns: tuple[WorkbookColumnDefinition, ...]
    rows: tuple[WorkbookRowSnapshot, ...]


@dataclass(frozen=True)
class WorkbookSnapshot:
    report_key: str
    workbook_key: str
    workbook_name: str
    generated_at: datetime
    requested_by: str
    parameters: dict[str, WorkbookCellValue]
    sheets: tuple[WorkbookSheetSnapshot, ...]
    dependency_edges: tuple[ReportDefinitionDependencyEdge, ...]
    warnings: tuple[str, ...] = ()


class WorkbookReportRenderer(Protocol):
    def __call__(self, context: WorkbookGenerationContext) -> WorkbookRenderResult:
        ...


def assemble_workbook_snapshot(
    *,
    report_key: str,
    contract: WorkbookGenerationContract,
    context: WorkbookGenerationContext,
    render_result: WorkbookRenderResult,
    dependency_edges: Sequence[ReportDefinitionDependencyEdge],
) -> WorkbookSnapshot:
    sheet_definitions_by_key = _sheet_definitions_by_key(contract)
    emitted_sheet_keys = set(render_result.sheet_rows)
    expected_sheet_keys = set(sheet_definitions_by_key)
    missing_sheets = sorted(expected_sheet_keys - emitted_sheet_keys)
    extra_sheets = sorted(emitted_sheet_keys - expected_sheet_keys)
    if missing_sheets or extra_sheets:
        raise WorkbookAssemblyError(
            "Workbook renderer output did not match the contract sheets: "
            f"missing={missing_sheets!r}, extra={extra_sheets!r}."
        )

    return WorkbookSnapshot(
        report_key=report_key,
        workbook_key=contract.workbook_key,
        workbook_name=contract.workbook_name,
        generated_at=context.generated_at,
        requested_by=context.requested_by,
        parameters=_normalize_parameters(context.parameters),
        sheets=tuple(
            _assemble_sheet(
                sheet_definition=sheet_definition,
                rows=render_result.sheet_rows[sheet_definition.sheet_key],
            )
            for sheet_definition in contract.sheets
        ),
        dependency_edges=tuple(dependency_edges),
        warnings=tuple(render_result.warnings),
    )


def _sheet_definitions_by_key(
    contract: WorkbookGenerationContract,
) -> dict[str, WorkbookSheetDefinition]:
    if not contract.sheets:
        raise WorkbookAssemblyError("Workbook generation contracts must define at least one sheet.")

    sheets_by_key: dict[str, WorkbookSheetDefinition] = {}
    for sheet in contract.sheets:
        if sheet.sheet_key in sheets_by_key:
            raise WorkbookAssemblyError(f"Duplicate workbook sheet key '{sheet.sheet_key}' in generation contract.")
        if not sheet.columns:
            raise WorkbookAssemblyError(f"Workbook sheet '{sheet.sheet_key}' must define at least one column.")
        sheets_by_key[sheet.sheet_key] = sheet
    return sheets_by_key


def _assemble_sheet(
    *,
    sheet_definition: WorkbookSheetDefinition,
    rows: Sequence[WorkbookRowInput],
) -> WorkbookSheetSnapshot:
    column_keys = set(sheet_definition.column_keys)
    assembled_rows: list[WorkbookRowSnapshot] = []

    for row_index, row in enumerate(rows):
        row_keys = set(row.values)
        missing_columns = sorted(column_keys - row_keys)
        extra_columns = sorted(row_keys - column_keys)
        if missing_columns or extra_columns:
            raise WorkbookAssemblyError(
                f"Workbook sheet '{sheet_definition.sheet_key}' row {row_index} does not match "
                f"the declared columns: missing={missing_columns!r}, extra={extra_columns!r}."
            )

        assembled_rows.append(
            WorkbookRowSnapshot(
                values={
                    column.field_key: _normalize_cell_value(row.values[column.field_key])
                    for column in sheet_definition.columns
                },
                source_ref=row.source_ref,
            )
        )

    return WorkbookSheetSnapshot(
        sheet_key=sheet_definition.sheet_key,
        sheet_name=sheet_definition.sheet_name,
        source_dataset_id=sheet_definition.source_dataset_id,
        columns=sheet_definition.columns,
        rows=tuple(assembled_rows),
    )


def _normalize_parameters(
    parameters: Mapping[str, WorkbookCellValue],
) -> dict[str, WorkbookCellValue]:
    return {key: _normalize_cell_value(value) for key, value in parameters.items()}


def _normalize_cell_value(value: object) -> WorkbookCellValue:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        return value
    raise WorkbookAssemblyError(f"Unsupported workbook cell value type: {type(value).__name__}.")
