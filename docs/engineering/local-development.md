# Local Development Workflow

## Standard workflow

The project should be developed with a GUI-first workflow:

1. open the repo in your IDE
2. run the API from an IDE run/debug configuration
3. run the web app from an IDE run/debug configuration
4. run projection rebuild scripts from IDE run/debug configurations
5. inspect PostgreSQL with a database GUI

The terminal is still useful, but it should not be the only way to operate the
project locally.

## Recommended tools

- IDE: PyCharm Professional or VS Code
- Python environment: `venv` or Miniconda
- Database GUI: pgAdmin or DBeaver

## Canonical local commands

These are the commands the IDE configurations should wrap.

### API

```bash
uvicorn apps.api.app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Web

```bash
npm run dev
```

Run this from:

```text
apps/web
```

### Rebuild trades projection

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_trades_projection.py
```

### Rebuild positions projection

```bash
PYTHONPATH=. python apps/api/scripts/rebuild_positions_projection.py
```
