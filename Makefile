.PHONY: db-up db-down api-install api-dev api-test api-mcp-test api-assistant-evals api-codex-smoke api-contract-refresh api-contract-check web-install web-build web-lint web-test web-smoke-install web-smoke-install-ci web-smoke-test verify verify-wave0 rebuild-trades rebuild-positions rebuild-all audit-trade-projections clean-trade-projections

VENV_PYTHON := ./.venv/bin/python
WEB_DIR := apps/web

db-up:
	docker compose up -d

db-down:
	docker compose down

api-install:
	python3 -m venv .venv && . .venv/bin/activate && pip install -r apps/api/requirements.txt

api-dev:
	. .venv/bin/activate && uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload

api-test:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) -m unittest discover -s apps/api/tests -p 'test_*.py'

api-mcp-test:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) -m unittest \
		apps.api.tests.test_mcp_api \
		apps.api.tests.test_mcp_oauth \
		apps.api.tests.test_http_router_registry

api-assistant-evals:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) -m unittest apps.api.tests.test_assistant_evals

api-codex-smoke:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) apps/api/scripts/run_codex_task_smoke.py

api-contract-refresh:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) apps/api/scripts/export_trade_metadata_contract.py

api-contract-check:
	@test -x $(VENV_PYTHON) || (echo "Missing $(VENV_PYTHON). Run 'make api-install' first." && exit 1)
	PYTHONPATH=. $(VENV_PYTHON) apps/api/scripts/export_trade_metadata_contract.py --check

web-install:
	npm --prefix $(WEB_DIR) ci

web-build:
	npm --prefix $(WEB_DIR) run build

web-lint:
	npm --prefix $(WEB_DIR) run lint

web-test:
	npm --prefix $(WEB_DIR) run test

web-smoke-install:
	npm --prefix $(WEB_DIR) exec playwright install chromium

web-smoke-install-ci:
	npm --prefix $(WEB_DIR) exec playwright install --with-deps chromium

web-smoke-test:
	npm --prefix $(WEB_DIR) run test:smoke

verify-wave0: api-contract-check api-test web-build web-lint web-test

verify: api-assistant-evals verify-wave0

rebuild-trades:
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/rebuild_trades_projection.py

rebuild-positions:
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/rebuild_positions_projection.py

rebuild-all:
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/rebuild_trades_projection.py
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/rebuild_positions_projection.py

audit-trade-projections:
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/audit_trade_projection_integrity.py

clean-trade-projections:
	. .venv/bin/activate && PYTHONPATH=. python apps/api/scripts/audit_trade_projection_integrity.py --clean
