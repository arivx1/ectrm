# AI Workflow

## Codex Task Dispatch Workflow

The repository includes a `Codex Task` GitHub Actions workflow at
`.github/workflows/codex.yml`. The ECTRM admin Codex dispatcher can use this
workflow as the remote execution target for repository-local engineering tasks.

Required GitHub secrets:

- `OPENAI_API_KEY`: used by the Codex CLI inside the workflow.
- `ECTRM_CODEX_CALLBACK_TOKEN`: must match the API's `CODEX_CALLBACK_TOKEN`.

Workflow dispatch inputs:

- `prompt`: rendered Codex prompt from ECTRM.
- `task_id`: optional ECTRM task request id.
- `callback_url`: optional ECTRM callback URL.
- `run_mode`: `SINGLE_TASK` or `LONG_RUNNING`.
- `max_iterations`: maximum long-running iterations.

The workflow installs the Codex CLI, creates a task branch, runs Codex, opens a
draft pull request when repository files change, uploads the raw Codex output as
an artifact, and posts running/final status callbacks when `callback_url` and
`ECTRM_CODEX_CALLBACK_TOKEN` are configured.

Long-running mode is still bounded engineering automation. Codex should stop
when there is no concrete next repository-local task, the iteration cap is
reached, the next step needs human judgment, or verification fails in a way that
requires review.
