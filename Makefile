.PHONY: db-up db-down api-install api-dev rebuild-trades rebuild-positions rebuild-all audit-trade-projections clean-trade-projections

db-up:
	docker compose up -d

db-down:
	docker compose down

api-install:
	python3 -m venv .venv && . .venv/bin/activate && pip install -r apps/api/requirements.txt

api-dev:
	. .venv/bin/activate && uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload

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
