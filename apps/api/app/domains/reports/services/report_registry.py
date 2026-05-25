from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.app.domains.reports.services.semantic_datasets import get_semantic_dataset_definition
from apps.api.app.domains.reports.services.workbook_runtime import (
    WorkbookAssemblyError,
    WorkbookCellValue,
    WorkbookColumnDefinition,
    WorkbookGenerationContext,
    WorkbookGenerationContract,
    WorkbookRenderResult,
    WorkbookReportRenderer,
    WorkbookRowInput,
    WorkbookSheetDefinition,
    WorkbookSnapshot,
    assemble_workbook_snapshot,
)
from apps.api.app.models.position import Position
from apps.api.app.schemas.report import ReportDefinitionDependencyEdge


class ReportDefinitionRegistrationError(ValueError):
    pass


class ReportDefinitionNotRegisteredError(LookupError):
    pass


class ReportDependencyResolutionError(ValueError):
    pass


@dataclass(frozen=True)
class RegisteredReportDefinition:
    report_key: str
    name: str
    description: str
    workbook_contract: WorkbookGenerationContract
    renderer: WorkbookReportRenderer


class ReportDefinitionRegistry:
    def __init__(
        self,
        definitions: Sequence[RegisteredReportDefinition] = (),
    ) -> None:
        self._definitions: dict[str, RegisteredReportDefinition] = {}
        for definition in definitions:
            self.register(definition)

    def register(self, definition: RegisteredReportDefinition) -> None:
        if definition.report_key in self._definitions:
            raise ReportDefinitionRegistrationError(
                f"Report definition '{definition.report_key}' is already registered."
            )
        _resolve_report_dependencies(definition)
        self._definitions[definition.report_key] = definition

    def get(self, report_key: str) -> RegisteredReportDefinition:
        try:
            return self._definitions[report_key]
        except KeyError as exc:
            raise ReportDefinitionNotRegisteredError(
                f"Report definition '{report_key}' is not registered."
            ) from exc

    def list_definitions(self) -> list[RegisteredReportDefinition]:
        return [
            definition
            for _, definition in sorted(
                self._definitions.items(),
                key=lambda item: item[0],
            )
        ]

    def resolve_dependencies(
        self,
        report_key: str,
    ) -> tuple[ReportDefinitionDependencyEdge, ...]:
        return _resolve_report_dependencies(self.get(report_key))


def build_registered_report_workbook(
    db: Session,
    *,
    report_key: str,
    requested_by: str,
    parameters: Mapping[str, WorkbookCellValue] | None = None,
    generated_at: datetime | None = None,
    registry: ReportDefinitionRegistry | None = None,
) -> WorkbookSnapshot:
    active_registry = registry or get_report_definition_registry()
    definition = active_registry.get(report_key)
    normalized_parameters = dict(parameters or {})
    _validate_report_parameters(definition, normalized_parameters)
    context = WorkbookGenerationContext(
        db=db,
        requested_by=requested_by,
        parameters=normalized_parameters,
        generated_at=generated_at or datetime.now(timezone.utc),
    )
    render_result = definition.renderer(context)
    return assemble_workbook_snapshot(
        report_key=definition.report_key,
        contract=definition.workbook_contract,
        context=context,
        render_result=render_result,
        dependency_edges=active_registry.resolve_dependencies(definition.report_key),
    )


def build_report_definition_registry(
    definitions: Sequence[RegisteredReportDefinition] | None = None,
) -> ReportDefinitionRegistry:
    return ReportDefinitionRegistry(definitions if definitions is not None else REGISTERED_REPORT_DEFINITIONS)


@lru_cache(maxsize=1)
def get_report_definition_registry() -> ReportDefinitionRegistry:
    return build_report_definition_registry()


def _validate_report_parameters(
    definition: RegisteredReportDefinition,
    parameters: Mapping[str, WorkbookCellValue],
) -> None:
    expected_parameter_keys = set(definition.workbook_contract.parameter_keys)
    provided_parameter_keys = set(parameters)
    missing = sorted(expected_parameter_keys - provided_parameter_keys)
    extra = sorted(provided_parameter_keys - expected_parameter_keys)
    if missing or extra:
        raise WorkbookAssemblyError(
            f"Report '{definition.report_key}' parameters do not match the workbook contract: "
            f"missing={missing!r}, extra={extra!r}."
        )


def _resolve_report_dependencies(
    definition: RegisteredReportDefinition,
) -> tuple[ReportDefinitionDependencyEdge, ...]:
    _validate_registered_definition_shape(definition)
    edges: list[ReportDefinitionDependencyEdge] = []
    parameter_sources: dict[str, set[str]] = {}

    for sheet in definition.workbook_contract.sheets:
        if sheet.source_dataset_id is None:
            continue

        dataset = get_semantic_dataset_definition(sheet.source_dataset_id)
        if dataset is None:
            raise ReportDependencyResolutionError(
                f"Report '{definition.report_key}' references unknown semantic dataset "
                f"'{sheet.source_dataset_id}'."
            )

        dataset_field_keys = {field.field_key for field in dataset.fields}
        sheet_ref = f"registered_report:{definition.report_key}.sheet:{sheet.sheet_key}"
        edges.append(
            ReportDefinitionDependencyEdge(
                from_ref=sheet_ref,
                to_kind="semantic_dataset",
                to_ref=dataset.dataset_id,
                dependency_role="source",
            )
        )
        for column in sheet.columns:
            if column.source_key not in dataset_field_keys:
                raise ReportDependencyResolutionError(
                    f"Report '{definition.report_key}' sheet '{sheet.sheet_key}' references field "
                    f"'{column.source_key}' that semantic dataset '{dataset.dataset_id}' does not expose."
                )
            edges.append(
                ReportDefinitionDependencyEdge(
                    from_ref=sheet_ref,
                    to_kind="semantic_dataset",
                    to_ref=dataset.dataset_id,
                    dependency_role="field",
                    field_ref=column.source_key,
                )
            )

        for parameter_key in dataset.parameter_keys:
            parameter_sources.setdefault(parameter_key, set()).add(dataset.dataset_id)

    report_ref = f"registered_report:{definition.report_key}"
    for parameter_key in definition.workbook_contract.parameter_keys:
        source_dataset_ids = parameter_sources.get(parameter_key)
        if not source_dataset_ids:
            raise ReportDependencyResolutionError(
                f"Report '{definition.report_key}' declares unsupported parameter '{parameter_key}'."
            )
        for dataset_id in sorted(source_dataset_ids):
            edges.append(
                ReportDefinitionDependencyEdge(
                    from_ref=report_ref,
                    to_kind="semantic_dataset",
                    to_ref=dataset_id,
                    dependency_role="parameter",
                    field_ref=parameter_key,
                )
            )

    return tuple(edges)


def _validate_registered_definition_shape(definition: RegisteredReportDefinition) -> None:
    if not definition.report_key.strip():
        raise ReportDependencyResolutionError("Registered report definitions require a report key.")
    if not definition.workbook_contract.workbook_key.strip():
        raise ReportDependencyResolutionError(
            f"Report '{definition.report_key}' requires a workbook key."
        )
    if not definition.workbook_contract.sheets:
        raise ReportDependencyResolutionError(
            f"Report '{definition.report_key}' must define at least one workbook sheet."
        )

    seen_sheet_keys: set[str] = set()
    for sheet in definition.workbook_contract.sheets:
        if sheet.sheet_key in seen_sheet_keys:
            raise ReportDependencyResolutionError(
                f"Report '{definition.report_key}' has duplicate sheet key '{sheet.sheet_key}'."
            )
        seen_sheet_keys.add(sheet.sheet_key)
        if not sheet.columns:
            raise ReportDependencyResolutionError(
                f"Report '{definition.report_key}' sheet '{sheet.sheet_key}' must define at least one column."
            )

        seen_columns: set[str] = set()
        for column in sheet.columns:
            if column.field_key in seen_columns:
                raise ReportDependencyResolutionError(
                    f"Report '{definition.report_key}' sheet '{sheet.sheet_key}' has duplicate "
                    f"column '{column.field_key}'."
                )
            seen_columns.add(column.field_key)


def _render_current_positions_report(
    context: WorkbookGenerationContext,
) -> WorkbookRenderResult:
    positions = context.db.execute(select(Position).order_by(Position.commodity.asc())).scalars().all()
    return WorkbookRenderResult(
        sheet_rows={
            "positions": tuple(
                WorkbookRowInput(
                    values={
                        "commodity": position.commodity,
                        "net_volume": float(position.net_volume),
                        "updated_at": position.updated_at,
                    },
                    source_ref=f"position:{position.commodity}",
                )
                for position in positions
            )
        }
    )


CURRENT_POSITIONS_REPORT_DEFINITION = RegisteredReportDefinition(
    report_key="current-positions",
    name="Current Positions",
    description="Workbook-ready snapshot of the current position projection.",
    workbook_contract=WorkbookGenerationContract(
        workbook_key="current-positions",
        workbook_name="Current Positions",
        sheets=(
            WorkbookSheetDefinition(
                sheet_key="positions",
                sheet_name="Positions",
                source_dataset_id="current_positions",
                columns=(
                    WorkbookColumnDefinition(
                        field_key="commodity",
                        label="Commodity",
                        data_type="string",
                        role="identifier",
                    ),
                    WorkbookColumnDefinition(
                        field_key="net_volume",
                        label="Net Volume",
                        data_type="number",
                        role="measure",
                    ),
                    WorkbookColumnDefinition(
                        field_key="updated_at",
                        label="Updated At",
                        data_type="datetime",
                        role="timestamp",
                    ),
                ),
            ),
        ),
    ),
    renderer=_render_current_positions_report,
)


REGISTERED_REPORT_DEFINITIONS: tuple[RegisteredReportDefinition, ...] = (
    CURRENT_POSITIONS_REPORT_DEFINITION,
)
