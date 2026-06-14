# ECTRM User Manual

This manual is the operator-facing reference inside the app. Use it when you
are onboarding, returning after time away, or deciding which workspace owns the
job in front of you.

You do not need to understand the codebase or database to use this guide. Start
with the job map below, then open the matching workspace.

## Start Here

Use this table when you need the shortest path from a business question to the
screen that should answer it.

| If you need to... | Open this workspace | Why start there |
| --- | --- | --- |
| Get oriented quickly | Live Desk | It gives you the operating picture first: desk health, recent activity, and exposure context. |
| Book, inspect, amend, or cancel a deal | Trade Capture | This is the main trade workspace for entry, review, amendment, and cancellation. |
| Understand what changed | Activity Feed | It shows the recorded sequence of trade and platform events before you chase symptoms. |
| Check concentration or pricing gaps | Exposure | It summarizes open risk and option-sensitive positions on the live book. |
| Confirm net balance by commodity or book | Net Positions | It translates active trades into directional or inventory-style position views. |
| Work deliveries, blockers, or downstream handoffs | Deliveries, Scheduling, or Operations | These surfaces own post-trade execution readiness, scheduling detail, and queue work. |
| Review invoices and payments | Settlement | This is the cash follow-through workspace for invoice and payment status. |
| Maintain books, locations, or counterparties | Reference Data | Controlled master data lives here so downstream workflows stay consistent. |
| Sign in, bootstrap access, or adjust runtime settings | Settings | Start here when the app behaves like read-only software or you need session setup. |

## Workspaces At A Glance

Each workspace has a distinct job. When in doubt, choose the screen whose
primary question best matches your current task.

| Workspace | Use it for | Good first question |
| --- | --- | --- |
| User Manual | Onboarding, orientation, and workflow handoff | "Where should I go for this job?" |
| Live Desk | Desk-wide situational awareness | "What needs attention right now?" |
| Trade Capture | Trade entry and lifecycle review | "What is the current state of this trade?" |
| Activity Feed | Event chronology and explainability | "What changed, and in what order?" |
| Exposure | Concentration and pricing review | "Where is the open risk?" |
| Net Positions | Commodity and book balance | "What is the net position after current trades?" |
| Deliveries | Delivery readiness across modes | "What needs to move or clear operationally?" |
| Scheduling | Schedule detail and execution updates | "What exactly is committed or actualized?" |
| Operations | Queue work, blockers, approvals, and confirmations | "What operational work is waiting on us?" |
| Settlement | Invoices, payments, and cash exceptions | "What is due, issued, or unreconciled?" |
| Reports | Curated analytical views | "Can I answer this faster with a report?" |
| Reference Data | Controlled master data maintenance | "Is the source list or lookup value correct?" |
| Assistant | Grounded product help and desk support | "Can the app help explain this faster?" |
| Settings and Admin | Access, runtime controls, and privileged maintenance | "Is this a configuration or governance issue?" |

## Role-Based Start Paths

Use the role cards below when you want a faster “where do people like me start?”
answer than the general workspace directory above.

Start with the primary workspace for your role, then use the supporting
surfaces in the order shown to widen from entry, to investigation, to
downstream follow-through.

### Trader

Start in `Live Desk` when you need the current operating picture, then move to
`Exposure`, `Net Positions`, and `Trade Capture` as the question becomes more
specific.

Use this path for:

- finding open exposure, pricing gaps, and volatility-sensitive opportunities
- comparing a trade idea against the current book before capture
- checking whether active longs and shorts are offsetting as expected
- validating position, exposure, and P&L context after a new or amended trade

Today, trade entry still belongs in `Trade Capture`. Future pre-trade,
opportunity, freight-cost, and book-flattening recommendations should hand off
to the same workspace instead of bypassing the normal trade review path.

### Risk Manager

Start in `Exposure` when the job is concentration, pricing coverage, option
sensitivity, or residual delta. Move to `Net Positions` for commodity and book
balance, then to `Reports` for broader risk and P&L context.

Use this path for:

- seeing the gross and net exposure that needs review
- identifying hedge candidates or residual deltas
- checking whether stale marks, missing prices, or option sensitivity explain a
  risk change
- reviewing how asset forecasts or physical commitments should affect forward
  views once those inputs are modeled

Hedge recommendations should be treated as reviewable analysis. Futures,
options, swaps, physical offsets, and other hedge actions remain human-owned
until deterministic policy, approval, and execution controls exist.

### Operations Manager

Start in `Operations` when the question is ownership, blockers, approvals, or
queue work. Move to `Deliveries`, `Scheduling`, or `Settlement` when the queue
item points to a specific movement, schedule, confirmation, invoice, or payment.

Use this path for:

- clearing overdue workflow items
- checking confirmation, delivery, scheduling, and document follow-through
- turning repeated manual checklists into workflow templates
- finding reconciliations that should become deterministic controls

Agents can help summarize blockers and stage approved internal workflow updates.
External logistics commitments and ambiguous actualization changes should stay
with human operators until the policy path is explicit.

### Accountant / Settlement User

Start in `Settlement` when the job is invoice, payment, aging, cash forecast,
or reconciliation follow-through. Move to `Reports` for broader summaries and
to `Operations` when a finance issue needs ownership or escalation.

Use this path for:

- seeing which invoices are due, issued, disputed, overdue, paid, or open
- finding payment mismatches, short pays, overpayments, and unreconciled cash
- confirming whether settlement status lines up with trade and delivery context
- reviewing accrual and billed-versus-collected questions as the accrual domain
  matures

Invoice and payment actions should remain approval-gated. Accrual recognition,
cash application, write-offs, and payment release need deterministic services,
clear audit trails, and human finance ownership.

## Troubleshooting Matrix

Use this matrix when you are diagnosing a symptom instead of performing a
planned workflow.

| If you notice... | Open first | Then check | Why this order helps |
| --- | --- | --- | --- |
| A trade looks wrong or incomplete | Trade Capture | Activity Feed, then Exposure | Confirm current state first, then explain the change history and downstream impact. |
| A blotter value does not match what someone remembers entering | Activity Feed | Trade Capture | The event trail confirms what was actually recorded before you debate the current row. |
| Exposure looks off | Exposure | Net Positions, then Activity Feed | Start with the risk summary, then confirm net balance and recent trade changes. |
| A delivery or scheduling issue is blocking execution | Deliveries or Scheduling | Operations | Confirm execution detail first, then move into ownership and queue follow-up. |
| A confirmation, approval, or handoff is stalled | Operations | Trade Capture, then Activity Feed | Queue work needs the operational context first, then the underlying commercial story. |
| An invoice is missing, a payment looks late, or cash is unreconciled | Settlement | Operations | Cash follow-through lives in settlement first, with queue follow-up only if ownership or blockers are unclear. |
| A dropdown or lookup value is missing or incorrect | Reference Data | Trade Capture or the affected downstream workspace | Fix the controlled value at the source, then return to the business workflow that depends on it. |
| A user cannot reach a workflow or mutate data | Settings | Admin | Check session and runtime setup first, then escalate to privileged controls if the problem is policy or system-level. |

## Task Playbooks

Use these playbooks when you want a short operator sequence for a real desk job
instead of a broad reference section.

### Book a trade

Open `Trade Capture` first, confirm the correct `book`, `commodity`,
counterparty, pricing setup, and delivery window, then submit and verify the
saved result in the trade overview before moving on.

1. Start in `Trade Capture`.
2. Choose the correct `book`, `commodity`, and trade structure before entering economics.
3. Enter counterparty, pricing, quantity, unit, and settlement details carefully enough that downstream teams do not need to reconstruct intent.
4. Submit the trade and confirm the saved state in the overview instead of trusting the unsaved ticket.
5. Open `Activity Feed` if you need proof of what was recorded or when the trade became visible to other workflows.

### Amend or cancel a trade

Use this when someone says the trade amendment is urgent, the economics are
wrong, or the live trade should be cancelled instead of left ambiguous.

1. Open `Trade Capture` and select the exact live trade first.
2. Confirm the current state before editing so you do not overwrite the wrong economics.
3. Use the amend or cancel path instead of rebooking the trade as a new record.
4. Review `Activity Feed` after saving so the amendment or cancellation history is explicit.
5. Check `Exposure` or `Net Positions` if the change should have shifted downstream projections.

### Investigate a mismatch

Use this when a blotter row, position number, exposure value, confirmation, or
cash record does not match what someone expected.

1. Open `Activity Feed` and find the trade, work item, or timing window that looks suspicious.
2. Open `Trade Capture`, `Exposure`, or `Net Positions` depending on whether the mismatch is about current trade state, risk, or net balance.
3. Continue into `Operations` or `Settlement` if the mismatch is now a downstream blocker instead of a trading question.
4. Escalate with the trade ID, work item, invoice, or payment identifier after you confirm where the divergence first appears.

### Clear a settlement blocker

Use this when an invoice is missing, a payment looks late, cash is
unreconciled, or ownership of the blocker is not obvious.

1. Open `Settlement` and inspect the exact invoice or payment record before escalating.
2. Confirm whether the problem is issuance, payment status, aging, or reconciliation.
3. Open `Operations` if the blocker needs explicit ownership, approval, or a handoff.
4. Return to `Trade Capture` or `Activity Feed` only if the cash issue traces back to trade setup or a recent amendment.

### Fix access issues

Use this when sign-in fails, the app behaves like read-only software, or a user
cannot reach a workflow they are supposed to own.

1. Open `Settings` and confirm the session is active.
2. Retry the blocked workflow after sign-in before assuming the issue is privilege-related.
3. Open `Admin` if the problem is role policy, bootstrap state, or a runtime control.
4. Escalate with the exact screen, action, and account context instead of a generic "it does not work" report.

## Book Or Amend A Trade

Use Trade Capture when the task is creating a position, inspecting commercial
terms, or changing an existing trade.

1. Open `Trade Capture`.
2. Choose the `book`, `commodity`, and trade structure that match the deal.
3. Enter the commercial terms that drive downstream workflows, including
   counterparty, pricing status, settlement status, and delivery window.
4. If the trade is multi-leg, complete each leg before submitting.
5. Submit the trade, then review the overview and event history to confirm the
   app stored what you intended.
6. If a live trade needs a change, select it first and use the amend path
   rather than re-entering it as a new deal.

## Investigate A Trade Or Exposure Question

Move through these workspaces in order when the current state looks surprising
or someone asks why a trade, position, or exposure number changed.

1. Open `Activity Feed` and locate the relevant trade or event pattern.
2. Use the event trail to confirm what changed, when it changed, and whether a
   follow-up action is still open.
3. Open `Trade Capture` if you need the current trade state in one place.
4. Open `Exposure` when the question is open risk, pricing coverage, or option
   sensitivity.
5. Open `Net Positions` when the question is directional balance or net volume
   by commodity or book.
6. If the problem has moved downstream, continue into `Operations` or
   `Settlement` rather than staying inside the trading surfaces.

## Run Post-Trade Work

Post-trade work is intentionally split by job so the app does not force every
delivery, schedule, confirmation, and cash task into one crowded screen.

| Stage | Workspace | What it owns |
| --- | --- | --- |
| Delivery readiness | Deliveries | Cross-mode delivery obligations, execution status, and move-specific blockers. |
| Schedule detail | Scheduling | Scheduling edits, actualization context, and committed execution detail. |
| Queue management | Operations | Workflow items, confirmations, approvals, blockers, and operational handoffs. |
| Cash follow-through | Settlement | Invoices, payments, aging, and cash reconciliation exceptions. |

When an issue is already assigned as queue work, start in `Operations`. When it
starts as a logistics or movement question, start in `Deliveries` or
`Scheduling` first, then move into the queue if a blocker needs ownership.

## Maintain Desk Data And Get Support

Not every question should begin in a trading screen.

- Use `Reference Data` to maintain books, commodities, currencies, units,
  locations, counterparties, and portfolios.
- Use `Reports` when someone needs a summarized answer faster than raw tables
  can provide.
- Use `Assistant` when you need grounded help explaining the product, the desk
  state, or the likely next workspace to open.

## Access And Safe Use

The app has clear boundaries between learning, read access, mutation work, and
privileged administration.

- If the app feels read-only or routes you away from a workflow, open
  `Settings` first and confirm you are signed in.
- Expect privileged controls to live under `Admin`, not mixed into day-to-day
  operating screens.
- Expect some reference data deactivations to be blocked when active trades
  still depend on those records.
- Expect amendments and follow-on actions to add history rather than silently
  rewriting the past.

## When Something Looks Wrong

Use this checklist before escalating an issue.

1. Confirm you are in the workspace that actually owns the job.
2. Check `Activity Feed` to see whether the current state is the result of a
   recent event.
3. Compare the live current-state view in `Trade Capture`, `Deliveries`, or
   `Settlement`, depending on where the symptom appears.
4. Check `Exposure` or `Net Positions` if the question is about projection or
   downstream impact rather than raw trade entry.
5. Open `Settings` or `Admin` if the issue looks like access, configuration, or
   runtime health.
6. Use `Assistant` with a concrete trade ID, work item, or business question if
   you need help translating what you are seeing.

## Shared Terms

These terms appear across the product and are worth keeping straight.

| Term | What it means in the app |
| --- | --- |
| Trade | The current commercial state of a position. |
| Event | A recorded business action such as trade creation, amendment, or cancellation. |
| Position | A net exposure view derived from active trades. |
| Exposure | The risk-oriented summary of what the desk is carrying. |
| Reference data | Controlled lists such as books, commodities, currencies, units, locations, and counterparties. |
| Work item | An operational task that needs follow-up, ownership, or a decision. |
| Settlement item | An invoice or payment record tied to cash follow-through. |
