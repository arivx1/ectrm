from __future__ import annotations

from dataclasses import dataclass, field

from apps.api.app.domains.reports.services.semantic_datasets import (
    get_semantic_dataset_definition,
)
from apps.api.app.schemas.report import (
    ReportDefinitionColumnDraft,
    ReportDefinitionDependencyEdge,
    ReportDefinitionDraft,
    ReportDefinitionValidationIssue,
    ReportDefinitionValidationResult,
    WorkbookDefinitionDraft,
    WorkbookSheetDefinitionDraft,
)


@dataclass
class _ValidationBuilder:
    issues: list[ReportDefinitionValidationIssue] = field(default_factory=list)
    dependency_edges: list[ReportDefinitionDependencyEdge] = field(default_factory=list)
    referenced_dataset_ids: set[str] = field(default_factory=set)

    def error(self, *, code: str, message: str, location: str) -> None:
        self.issues.append(
            ReportDefinitionValidationIssue(
                severity="error",
                code=code,
                message=message,
                location=location,
            )
        )

    def warning(self, *, code: str, message: str, location: str) -> None:
        self.issues.append(
            ReportDefinitionValidationIssue(
                severity="warning",
                code=code,
                message=message,
                location=location,
            )
        )

    def dependency(
        self,
        *,
        from_ref: str,
        to_kind: str,
        to_ref: str,
        dependency_role: str,
        field_ref: str | None = None,
    ) -> None:
        self.dependency_edges.append(
            ReportDefinitionDependencyEdge(
                from_ref=from_ref,
                to_kind=to_kind,
                to_ref=to_ref,
                dependency_role=dependency_role,
                field_ref=field_ref,
            )
        )

    def result(self) -> ReportDefinitionValidationResult:
        error_count = sum(1 for issue in self.issues if issue.severity == "error")
        warning_count = sum(1 for issue in self.issues if issue.severity == "warning")
        return ReportDefinitionValidationResult(
            status="invalid" if error_count else "valid",
            valid=error_count == 0,
            error_count=error_count,
            warning_count=warning_count,
            issues=self.issues,
            dependency_edges=self.dependency_edges,
            referenced_dataset_ids=sorted(self.referenced_dataset_ids),
        )


def _validate_column_refs(
    *,
    builder: _ValidationBuilder,
    columns: list[ReportDefinitionColumnDraft],
    dataset_id: str,
    known_field_keys: set[str],
    from_ref: str,
    location_prefix: str,
) -> None:
    seen_columns: set[str] = set()
    for index, column in enumerate(columns):
        location = f"{location_prefix}.columns[{index}].field_key"
        if column.field_key in seen_columns:
            builder.error(
                code="duplicate_column",
                message=f"Column field '{column.field_key}' is selected more than once.",
                location=location,
            )
        seen_columns.add(column.field_key)

        if column.field_key not in known_field_keys:
            builder.error(
                code="unknown_field",
                message=f"Dataset '{dataset_id}' does not expose field '{column.field_key}'.",
                location=location,
            )
            continue

        builder.dependency(
            from_ref=from_ref,
            to_kind="semantic_dataset",
            to_ref=dataset_id,
            dependency_role="field",
            field_ref=column.field_key,
        )


def _validate_sort_refs(
    *,
    builder: _ValidationBuilder,
    sort_fields: list[str],
    dataset_id: str,
    known_field_keys: set[str],
    location_prefix: str,
) -> None:
    for index, field_key in enumerate(sort_fields):
        if field_key not in known_field_keys:
            builder.error(
                code="unknown_sort_field",
                message=f"Dataset '{dataset_id}' does not expose sort field '{field_key}'.",
                location=f"{location_prefix}.default_sort[{index}]",
            )


def _validate_parameter_refs(
    *,
    builder: _ValidationBuilder,
    parameter_keys: list[str],
    parameter_sources: dict[str, set[str]],
    from_ref: str,
    location_prefix: str,
    allow_unresolved_sources: bool = False,
) -> None:
    seen_parameters: set[str] = set()
    for index, parameter_key in enumerate(parameter_keys):
        location = f"{location_prefix}.parameter_keys[{index}]"
        if parameter_key in seen_parameters:
            builder.error(
                code="duplicate_parameter",
                message=f"Parameter key '{parameter_key}' is declared more than once.",
                location=location,
            )
        seen_parameters.add(parameter_key)

        source_dataset_ids = parameter_sources.get(parameter_key)
        if not source_dataset_ids:
            if allow_unresolved_sources:
                builder.warning(
                    code="parameter_resolution_not_enabled",
                    message=(
                        f"Parameter '{parameter_key}' may resolve through report or workbook run sources "
                        "after definition persistence is implemented."
                    ),
                    location=location,
                )
                continue
            builder.error(
                code="unknown_parameter",
                message=f"No referenced semantic dataset exposes parameter '{parameter_key}'.",
                location=location,
            )
            continue

        for dataset_id in sorted(source_dataset_ids):
            builder.dependency(
                from_ref=from_ref,
                to_kind="semantic_dataset",
                to_ref=dataset_id,
                dependency_role="parameter",
                field_ref=parameter_key,
            )


def validate_report_definition_draft(payload: ReportDefinitionDraft) -> ReportDefinitionValidationResult:
    builder = _ValidationBuilder()
    from_ref = f"report_definition:{payload.report_key}"
    dataset = get_semantic_dataset_definition(payload.dataset_id)

    if dataset is None:
        builder.error(
            code="unknown_dataset",
            message=f"Semantic dataset '{payload.dataset_id}' was not found.",
            location="dataset_id",
        )
        return builder.result()

    builder.referenced_dataset_ids.add(dataset.dataset_id)
    builder.dependency(
        from_ref=from_ref,
        to_kind="semantic_dataset",
        to_ref=dataset.dataset_id,
        dependency_role="source",
    )

    if not payload.columns:
        builder.warning(
            code="empty_column_selection",
            message="No columns were selected; the report will default to all dataset fields when execution is implemented.",
            location="columns",
        )

    known_field_keys = {field.field_key for field in dataset.fields}
    _validate_column_refs(
        builder=builder,
        columns=payload.columns,
        dataset_id=dataset.dataset_id,
        known_field_keys=known_field_keys,
        from_ref=from_ref,
        location_prefix="report_definition",
    )
    _validate_parameter_refs(
        builder=builder,
        parameter_keys=payload.parameter_keys,
        parameter_sources={parameter_key: {dataset.dataset_id} for parameter_key in dataset.parameter_keys},
        from_ref=from_ref,
        location_prefix="report_definition",
    )
    _validate_sort_refs(
        builder=builder,
        sort_fields=payload.default_sort,
        dataset_id=dataset.dataset_id,
        known_field_keys=known_field_keys,
        location_prefix="report_definition",
    )

    return builder.result()


def _validate_dataset_sheet(
    *,
    builder: _ValidationBuilder,
    workbook_ref: str,
    sheet: WorkbookSheetDefinitionDraft,
    sheet_index: int,
) -> None:
    location_prefix = f"workbook_definition.sheets[{sheet_index}]"
    if sheet.dataset_id is None:
        builder.error(
            code="missing_dataset",
            message="Dataset sheets must reference a semantic dataset.",
            location=f"{location_prefix}.dataset_id",
        )
        return

    dataset = get_semantic_dataset_definition(sheet.dataset_id)
    if dataset is None:
        builder.error(
            code="unknown_dataset",
            message=f"Semantic dataset '{sheet.dataset_id}' was not found.",
            location=f"{location_prefix}.dataset_id",
        )
        return

    sheet_ref = f"{workbook_ref}.sheet:{sheet.sheet_key}"
    builder.referenced_dataset_ids.add(dataset.dataset_id)
    builder.dependency(
        from_ref=sheet_ref,
        to_kind="semantic_dataset",
        to_ref=dataset.dataset_id,
        dependency_role="source",
    )

    known_field_keys = {field.field_key for field in dataset.fields}
    _validate_column_refs(
        builder=builder,
        columns=sheet.columns,
        dataset_id=dataset.dataset_id,
        known_field_keys=known_field_keys,
        from_ref=sheet_ref,
        location_prefix=location_prefix,
    )


def _validate_formula_sheet(
    *,
    builder: _ValidationBuilder,
    workbook_ref: str,
    sheet: WorkbookSheetDefinitionDraft,
    sheet_index: int,
    sheet_keys: set[str],
) -> None:
    location_prefix = f"workbook_definition.sheets[{sheet_index}]"
    sheet_ref = f"{workbook_ref}.sheet:{sheet.sheet_key}"

    if not sheet.depends_on:
        builder.warning(
            code="formula_sheet_without_dependencies",
            message="Formula sheets should declare sheet dependencies before workbook execution is enabled.",
            location=f"{location_prefix}.depends_on",
        )

    for dependency_index, dependency_key in enumerate(sheet.depends_on):
        if dependency_key not in sheet_keys:
            builder.error(
                code="unknown_sheet_dependency",
                message=f"Sheet '{sheet.sheet_key}' depends on unknown sheet '{dependency_key}'.",
                location=f"{location_prefix}.depends_on[{dependency_index}]",
            )
            continue

        builder.dependency(
            from_ref=sheet_ref,
            to_kind="workbook_sheet",
            to_ref=dependency_key,
            dependency_role="formula_input",
        )

    if sheet.formulas:
        builder.warning(
            code="formula_parse_not_enabled",
            message="Formula parsing is not enabled yet; expressions are accepted as draft metadata only.",
            location=f"{location_prefix}.formulas",
        )


def _collect_dataset_parameter_sources(payload: WorkbookDefinitionDraft) -> dict[str, set[str]]:
    parameter_sources: dict[str, set[str]] = {}
    for sheet in payload.sheets:
        if sheet.sheet_kind != "dataset" or sheet.dataset_id is None:
            continue

        dataset = get_semantic_dataset_definition(sheet.dataset_id)
        if dataset is None:
            continue

        for parameter_key in dataset.parameter_keys:
            parameter_sources.setdefault(parameter_key, set()).add(dataset.dataset_id)

    return parameter_sources


def _has_unresolved_parameter_sources(payload: WorkbookDefinitionDraft) -> bool:
    return any(
        (sheet.sheet_kind == "report" and sheet.report_key is not None)
        or (sheet.sheet_kind == "workbook_run" and sheet.run_id is not None)
        for sheet in payload.sheets
    )


def _validate_report_sheet(
    *,
    builder: _ValidationBuilder,
    workbook_ref: str,
    sheet: WorkbookSheetDefinitionDraft,
    sheet_index: int,
) -> None:
    location_prefix = f"workbook_definition.sheets[{sheet_index}]"
    if sheet.report_key is None:
        builder.error(
            code="missing_report",
            message="Report sheets must reference a report definition.",
            location=f"{location_prefix}.report_key",
        )
        return

    builder.dependency(
        from_ref=f"{workbook_ref}.sheet:{sheet.sheet_key}",
        to_kind="report_definition",
        to_ref=sheet.report_key,
        dependency_role="source",
    )
    builder.warning(
        code="report_sheet_resolution_not_enabled",
        message="Report sheet references will be resolved after report definition persistence is implemented.",
        location=f"{location_prefix}.report_key",
    )


def _validate_workbook_run_sheet(
    *,
    builder: _ValidationBuilder,
    workbook_ref: str,
    sheet: WorkbookSheetDefinitionDraft,
    sheet_index: int,
) -> None:
    location_prefix = f"workbook_definition.sheets[{sheet_index}]"
    if sheet.run_id is None:
        builder.error(
            code="missing_run",
            message="Workbook run sheets must reference an immutable workbook run.",
            location=f"{location_prefix}.run_id",
        )
        return

    builder.dependency(
        from_ref=f"{workbook_ref}.sheet:{sheet.sheet_key}",
        to_kind="workbook_run",
        to_ref=sheet.run_id,
        dependency_role="prior_run",
    )
    builder.warning(
        code="run_sheet_resolution_not_enabled",
        message="Workbook run sheet references will be resolved after immutable run persistence is implemented.",
        location=f"{location_prefix}.run_id",
    )


def validate_workbook_definition_draft(payload: WorkbookDefinitionDraft) -> ReportDefinitionValidationResult:
    builder = _ValidationBuilder()
    workbook_ref = f"workbook_definition:{payload.workbook_key}"

    if not payload.sheets:
        builder.error(
            code="empty_workbook",
            message="Workbook definitions must contain at least one sheet.",
            location="sheets",
        )
        return builder.result()

    sheet_keys: set[str] = set()
    for index, sheet in enumerate(payload.sheets):
        if sheet.sheet_key in sheet_keys:
            builder.error(
                code="duplicate_sheet_key",
                message=f"Sheet key '{sheet.sheet_key}' is used more than once.",
                location=f"workbook_definition.sheets[{index}].sheet_key",
            )
        sheet_keys.add(sheet.sheet_key)

    _validate_parameter_refs(
        builder=builder,
        parameter_keys=payload.parameter_keys,
        parameter_sources=_collect_dataset_parameter_sources(payload),
        from_ref=workbook_ref,
        location_prefix="workbook_definition",
        allow_unresolved_sources=_has_unresolved_parameter_sources(payload),
    )

    for index, sheet in enumerate(payload.sheets):
        if sheet.sheet_kind == "dataset":
            _validate_dataset_sheet(
                builder=builder,
                workbook_ref=workbook_ref,
                sheet=sheet,
                sheet_index=index,
            )
        elif sheet.sheet_kind == "formula":
            _validate_formula_sheet(
                builder=builder,
                workbook_ref=workbook_ref,
                sheet=sheet,
                sheet_index=index,
                sheet_keys=sheet_keys,
            )
        elif sheet.sheet_kind == "manual":
            continue
        elif sheet.sheet_kind == "report":
            _validate_report_sheet(
                builder=builder,
                workbook_ref=workbook_ref,
                sheet=sheet,
                sheet_index=index,
            )
        elif sheet.sheet_kind == "workbook_run":
            _validate_workbook_run_sheet(
                builder=builder,
                workbook_ref=workbook_ref,
                sheet=sheet,
                sheet_index=index,
            )

    return builder.result()
