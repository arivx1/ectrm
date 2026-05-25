from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.app.domains.reports.services.report_registry import (
    CURRENT_POSITIONS_REPORT_DEFINITION,
    RegisteredReportDefinition,
    ReportDefinitionRegistrationError,
    ReportDefinitionRegistry,
    ReportDependencyResolutionError,
    build_registered_report_workbook,
    build_report_definition_registry,
)
from apps.api.app.domains.reports.services.workbook_runtime import (
    WorkbookAssemblyError,
    WorkbookColumnDefinition,
    WorkbookGenerationContract,
    WorkbookGenerationContext,
    WorkbookRenderResult,
    WorkbookRowInput,
    WorkbookSheetDefinition,
)
from apps.api.app.models import Base
from apps.api.app.models.position import Position


class ReportWorkbookRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.SessionLocal = sessionmaker(bind=cls.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls) -> None:
        Base.metadata.drop_all(bind=cls.engine)
        cls.engine.dispose()

    def setUp(self) -> None:
        self.now = datetime(2026, 5, 24, 15, 30, tzinfo=timezone.utc)
        with self.SessionLocal() as session:
            session.query(Position).delete()
            session.commit()

    def test_registry_registers_current_positions_report_once(self) -> None:
        registry = build_report_definition_registry()

        definitions = registry.list_definitions()
        self.assertEqual([definition.report_key for definition in definitions], ["current-positions"])

        definition = registry.get("current-positions")
        self.assertEqual(definition.name, "Current Positions")
        self.assertEqual(definition.workbook_contract.workbook_key, "current-positions")
        self.assertEqual(definition.workbook_contract.sheets[0].sheet_key, "positions")

        with self.assertRaises(ReportDefinitionRegistrationError):
            registry.register(CURRENT_POSITIONS_REPORT_DEFINITION)

    def test_dependency_resolution_uses_semantic_dataset_source_and_fields(self) -> None:
        registry = build_report_definition_registry()

        dependencies = registry.resolve_dependencies("current-positions")

        self.assertTrue(
            any(
                edge.from_ref == "registered_report:current-positions.sheet:positions"
                and edge.to_kind == "semantic_dataset"
                and edge.to_ref == "current_positions"
                and edge.dependency_role == "source"
                for edge in dependencies
            )
        )
        field_refs = {
            edge.field_ref
            for edge in dependencies
            if edge.to_ref == "current_positions" and edge.dependency_role == "field"
        }
        self.assertEqual(field_refs, {"commodity", "net_volume", "updated_at"})

    def test_dependency_resolution_rejects_unknown_dataset_fields(self) -> None:
        bad_definition = RegisteredReportDefinition(
            report_key="bad-position-report",
            name="Bad Position Report",
            description="Invalid fixture.",
            workbook_contract=WorkbookGenerationContract(
                workbook_key="bad-position-report",
                workbook_name="Bad Position Report",
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
                                field_key="not_exposed",
                                label="Not Exposed",
                                data_type="number",
                                role="measure",
                            ),
                        ),
                    ),
                ),
            ),
            renderer=_empty_renderer,
        )

        with self.assertRaises(ReportDependencyResolutionError):
            ReportDefinitionRegistry((bad_definition,))

    def test_current_positions_report_builds_workbook_from_projection_rows(self) -> None:
        with self.SessionLocal() as session:
            session.add_all(
                [
                    Position(
                        commodity="WTI",
                        net_volume=Decimal("1250.500000"),
                        updated_at=self.now,
                    ),
                    Position(
                        commodity="BRENT",
                        net_volume=Decimal("-200.000000"),
                        updated_at=self.now,
                    ),
                ]
            )
            session.commit()

            workbook = build_registered_report_workbook(
                session,
                report_key="current-positions",
                requested_by="reports_viewer",
                generated_at=self.now,
            )

        self.assertEqual(workbook.report_key, "current-positions")
        self.assertEqual(workbook.workbook_key, "current-positions")
        self.assertEqual(workbook.generated_at, self.now)
        self.assertEqual(workbook.requested_by, "reports_viewer")
        self.assertEqual(workbook.parameters, {})
        self.assertEqual(len(workbook.sheets), 1)

        sheet = workbook.sheets[0]
        self.assertEqual(sheet.sheet_key, "positions")
        self.assertEqual(sheet.source_dataset_id, "current_positions")
        self.assertEqual([column.field_key for column in sheet.columns], ["commodity", "net_volume", "updated_at"])
        stored_now = self.now.replace(tzinfo=None)
        self.assertEqual(
            [row.values for row in sheet.rows],
            [
                {"commodity": "BRENT", "net_volume": -200.0, "updated_at": stored_now},
                {"commodity": "WTI", "net_volume": 1250.5, "updated_at": stored_now},
            ],
        )
        self.assertEqual([row.source_ref for row in sheet.rows], ["position:BRENT", "position:WTI"])
        self.assertTrue(
            any(
                edge.to_ref == "current_positions" and edge.dependency_role == "source"
                for edge in workbook.dependency_edges
            )
        )

    def test_workbook_assembly_rejects_renderer_columns_outside_contract(self) -> None:
        def _extra_column_renderer(context: WorkbookGenerationContext) -> WorkbookRenderResult:
            return WorkbookRenderResult(
                sheet_rows={
                    "positions": (
                        WorkbookRowInput(
                            values={
                                "commodity": "WTI",
                                "net_volume": 10,
                                "updated_at": context.generated_at,
                                "freeform_commentary": "not part of the contract",
                            },
                        ),
                    )
                }
            )

        registry = ReportDefinitionRegistry(
            (
                replace(
                    CURRENT_POSITIONS_REPORT_DEFINITION,
                    report_key="bad-current-positions",
                    renderer=_extra_column_renderer,
                ),
            )
        )

        with self.SessionLocal() as session:
            with self.assertRaises(WorkbookAssemblyError):
                build_registered_report_workbook(
                    session,
                    report_key="bad-current-positions",
                    requested_by="reports_viewer",
                    generated_at=self.now,
                    registry=registry,
                )

    def test_workbook_assembly_rejects_parameters_outside_contract(self) -> None:
        with self.SessionLocal() as session:
            with self.assertRaises(WorkbookAssemblyError):
                build_registered_report_workbook(
                    session,
                    report_key="current-positions",
                    requested_by="reports_viewer",
                    parameters={"as_of": self.now.date()},
                    generated_at=self.now,
                )


def _empty_renderer(context: WorkbookGenerationContext) -> WorkbookRenderResult:
    return WorkbookRenderResult(sheet_rows={"positions": ()})


if __name__ == "__main__":
    unittest.main()
