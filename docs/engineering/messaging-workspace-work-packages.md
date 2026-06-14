# Messaging Workspace Work Packages

## Goal

Turn the current Slack-style `Messages` prototype into a governed collaboration
surface that can support real desk communication instead of a seeded demo
thread.

The target experience is:

- messages, channels, DMs, and threads are durable work objects, not local UI
  state
- operators can move between channels and threads without leaving the messaging
  surface or getting rerouted into unrelated workspaces
- the composer and message actions meet a practical Slack/Teams baseline for
  daily internal work
- agent participation stays in-thread, but every assistant message preserves
  identity, provenance, and governed action-request boundaries
- freeform chat never becomes the only home of business truth, external
  commitment, or business-record mutation

## Primary Design Inputs

- [Prompt-First Operator Experience Work Packages](./prompt-first-operator-experience-work-packages.md)
- [AI Workflow](./ai-workflow.md)
- [Agent Autonomy Rubric](./agent-autonomy-rubric.md)
- [Human-Agent Authority Matrix](./human-agent-authority-matrix.md)
- [Agent Action Request Contract](./agent-action-request-contract.md)
- [Canonical Work Object Inventory](./canonical-work-object-inventory.md)
- [Agent Knowledge Base](./agent-knowledge-base.md)
- [Platform Blueprint](./platform-blueprint.md)

## Current Repo Signals

- `apps/web/src/workspaces/messages/MessagingWorkspace.tsx` still stores sent
  messages and agent replies in local React state.
- the workspace currently selects `channels[0]`, so the user is effectively in
  one pinned demo lane instead of a real multi-channel or multi-DM surface.
- `apps/web/src/workspaces/messages/messagingInboxData.ts` models a flat
  timeline of `system` and `message` items with no parent-message or thread
  metadata.
- compose affordances such as `B`, `I`, `Link`, `List`, and `Code` are mostly
  visual labels rather than working message capabilities.
- sent messages are rendered as static feed items with no edit, delete,
  reply-to-message, save, pin, or quote actions.
- `apps/web/src/workspaces/messages/messagingAgentSession.ts` can auto-claim a
  shared single-user admin session in local development so an agent reply can
  appear in-thread without explicit sign-in.

## Experience And Governance Principles

1. Durable message records before surface polish.
   Slack-like visuals are useful, but the first maturity gap is that the
   conversation does not survive refresh or support more than one user.

2. Messaging is a collaboration surface, not a hidden write path.
   Business mutations, approvals, and external commitments still need typed
   services, policy checks, audit, and governed action requests.

3. Thread participation should stay in-thread.
   Human and agent replies should continue to appear in the message surface
   rather than routing the operator into another workspace to continue the
   conversation.

4. Identity and provenance must stay explicit.
   Every message needs a clear author, source, and audit story, especially for
   assistant-authored content.

5. Do not restore removed UI just to mimic Slack mechanically.
   Channel switching is required, but it should come back in a deliberate form
   that fits this app instead of recreating the bulky rail that the current
   user feedback rejected.

## Delivery Order

### Wave 0: make messaging real

1. MWP-01 durable conversation and message records
2. MWP-02 channel, DM, and inbox navigation
3. MWP-03 per-message threads and reply semantics

### Wave 1: make collaboration usable

4. MWP-04 production composer capabilities
5. MWP-05 post-send message actions and audit

### Wave 2: harden trust and assistant provenance

6. MWP-06 governed messaging-agent identity and provenance

## Shared Definition Of Done

Each work package is done only when:

- message, conversation, and thread state is backed by typed application
  services instead of frontend-only state
- direct URLs and normal navigation can reopen the relevant channel or thread
- human and agent authorship, timestamps, and provenance are visible and
  auditable
- no freeform message or assistant reply can directly mutate business records
  or externally commit the firm
- signed-in and signed-out behavior is explicit where relevant instead of
  relying on implicit local-dev assumptions
- focused backend tests, web tests, and browser smoke or assistant eval
  coverage are added where the change affects persistence, routing, or governed
  assistant behavior
- docs and the knowledge base are updated when the work changes messaging
  operating rules or assistant boundaries

## MWP-01: Durable Conversation And Message Records

### Priority

P0

### Size

L

### Outcome

Messages, conversations, participants, and agent replies persist as durable
records that survive refresh, support multi-user sync, and can become the
backbone for audit, unread state, and future search.

### Why this matters

The current `Messages` surface behaves like a local demo because both human and
agent posts only live in React state. Until that changes, every other
Slack/Teams-like improvement sits on top of a fragile foundation.

### Scope

- define the first typed messaging work objects, likely including:
  - conversation or channel
  - participant or membership
  - message
  - message author metadata
  - read or unread state
- choose the owning backend seam for messaging instead of leaving it as a
  frontend-only helper model
- add typed services and API routes for:
  - list conversations available to the current user
  - load message history for a conversation
  - post a message
  - persist agent-authored replies in the same store
- preserve message timestamps, authorship, conversation kind, and source
  metadata such as human post, agent reply, or system event
- link agent-authored messages to assistant run IDs or equivalent provenance
- move the current `Send message` and in-thread agent-reply flow off local-only
  append helpers

### Out Of Scope

- Slack or Teams connector sync
- enterprise retention or e-discovery policy
- full-text search ranking
- attachment binary storage beyond what is required for the first persisted
  message contract

### Suggested Owner Profile

One backend engineer and one frontend engineer pairing across API contract and
workspace integration.

### Dependencies

- current `Messages` workspace prototype
- current governed assistant runtime for in-thread agent replies

### Acceptance Criteria

- a message posted in `Messages` still exists after browser refresh
- the current user can reopen the same conversation from a direct URL and see
  prior messages
- agent replies are stored as durable message records with clear provenance
- the web app no longer needs local-only append state to preserve the thread
  timeline
- focused tests cover message creation, reload behavior, and failed-write
  handling

### Verification

- focused API tests for message and conversation persistence
- focused web tests for reload and re-open behavior
- browser smoke for post, refresh, and recover-thread flow

## MWP-02: Channel, DM, And Inbox Navigation

### Priority

P0

### Size

M

### Outcome

The workspace supports real channel and DM switching, stable deep-linking, and
explicit unread context instead of always pinning the user to one hard-coded
conversation.

### Why this matters

A messaging surface without first-class conversation switching is not yet a
messaging client. It is a single thread with a chat skin.

### Scope

- replace the implicit `channels[0]` selection with explicit conversation
  selection state
- decide the first route contract for messaging navigation, for example:
  - `view=messages&channel=<id>`
  - optional thread or message focus when that model exists
- provide a deliberate conversation switcher that respects current user
  feedback and does not require restoring the removed bulky left rail exactly
  as it was
- support at least:
  - channel switching
  - DM switching
  - unread state display
  - re-entry into the last or linked conversation
- preserve navigation back into related operational workspaces without making
  those route changes the primary way to continue a conversation
- ensure the signed-out public `Messages` route fails clearly when a target
  conversation is unavailable

### Out Of Scope

- fully replicating Slack's entire sidebar information architecture
- cross-workspace shared channels
- notification center redesign outside the messages surface

### Suggested Owner Profile

Frontend engineer with route-state ownership and UX judgment on compact
navigation patterns.

### Dependencies

- MWP-01 for durable conversation IDs and conversation lists

### Acceptance Criteria

- the user can switch between at least two channels and one DM without leaving
  `view=messages`
- deep links reopen the intended conversation instead of defaulting to the
  first seeded lane
- unread counts or equivalent attention markers are tied to the selected
  conversation, not demo placeholders only
- browser and component tests fail if the workspace regresses back to
  always-on `channels[0]`

### Verification

- focused web tests for route-driven conversation selection
- browser smoke for open, switch, refresh, and deep-link reopen behavior

## MWP-03: Per-Message Threads And Reply Semantics

### Priority

P0

### Size

L

### Outcome

Replies attach to a specific message, thread context is explicit, and both
human and agent responses can continue a sub-conversation without flattening
everything into one main feed.

### Why this matters

Slack and Teams both use message-level threading to keep the main channel
readable. The current flat timeline cannot support that model or the review and
follow semantics that come with it.

### Scope

- extend the message model to support at least:
  - parent or root message identity
  - thread reply count
  - thread last activity metadata
  - follow or subscription state as needed
- add a reply-to-message interaction that anchors the composer to a specific
  parent message
- decide the first thread presentation model, such as:
  - side thread pane
  - message detail drawer
  - inline expansion
- ensure agent replies can target either the main channel or a specific thread
- distinguish channel-level system events from message-level thread activity
- preserve clear deep-link behavior for opening a specific thread

### Out Of Scope

- federated or shared-company threading
- every advanced thread notification preference in one pass

### Suggested Owner Profile

Full-stack engineer comfortable changing both data shape and thread rendering
behavior.

### Dependencies

- MWP-01 for durable messages
- MWP-02 for stable conversation routing

### Acceptance Criteria

- the user can reply to a specific message and see the reply associated with
  that parent message
- the main feed shows thread context without duplicating every reply inline as
  flat noise
- agent replies can be posted into the selected thread instead of only the root
  channel feed
- tests cover thread creation, thread reopen, and invalid-parent failure modes

### Verification

- focused API tests for parent-message and thread metadata rules
- focused web tests for reply-to-message behavior
- browser smoke for open thread, reply, refresh, and reopen flow

## MWP-04: Production Composer Capabilities

### Priority

P1

### Size

M

### Outcome

The composer affordances become real capabilities so the message box supports
practical daily drafting instead of a styled textarea with decorative labels.

### Why this matters

Once persistence and threading exist, the next usability gap is that the
message composer advertises features it does not actually provide.

### Scope

- choose the first supported compose model:
  - markdown-like formatting
  - structured rich text
  - or a limited formatting schema that maps cleanly to stored messages
- implement working support for the visible formatting affordances that remain
  in the UI
- add first-class mention resolution for at least:
  - people
  - channels or conversations
  - governed agent identities where allowed
- add the first attachment or linked-document path appropriate to the current
  platform scope
- preserve familiar chat behavior such as `Enter` send and `Shift+Enter`
  newline
- decide explicitly whether schedule-send or send-later is part of this first
  package or a follow-on package, rather than leaving it implied by UI chrome

### Out Of Scope

- perfect Slack or Teams rich-text parity
- external email-style formatting or signature management
- document OCR or file-ingestion workflow redesign

### Suggested Owner Profile

Frontend engineer with editor-integration experience, paired with a backend
engineer if stored message structure changes.

### Dependencies

- MWP-01 for stored message bodies
- MWP-03 when reply context must be represented in the composer

### Acceptance Criteria

- visible formatting controls that remain in the UI apply real formatting to
  sent messages
- mentions resolve deterministically and render meaningfully in stored
  messages
- at least one attachment or linked-document path works end to end
- tests cover keyboard behavior, formatting, and mention resolution

### Verification

- focused web interaction tests for the composer
- browser smoke for formatted send and mention flows

## MWP-05: Post-Send Message Actions And Audit

### Priority

P1

### Size

M

### Outcome

Messages become manageable objects after send, with editing, withdrawal, save,
pin, quote, and reply actions that preserve audit and do not require users to
copy text manually into new drafts.

### Why this matters

A mature messaging surface is not only about sending. Operators need ways to
correct, reference, and organize messages after they are posted.

### Scope

- add a message action menu or hover affordances for the first supported set of
  actions
- start with a deliberate subset such as:
  - edit
  - delete or withdraw
  - reply to message
  - copy link
  - save or pin
  - quote into a reply
- define audit and retention behavior for edits and deletions so the platform
  does not rely on destructive mutation
- ensure permissions are explicit for who can edit, delete, pin, or save
- link message actions to the thread model rather than implementing parallel
  one-off interaction paths

### Out Of Scope

- enterprise retention administration
- global search over saved or pinned items
- cross-system forwarding

### Suggested Owner Profile

Full-stack engineer with workflow, permissions, and audit-model experience.

### Dependencies

- MWP-01 for durable message records
- MWP-03 for reply and quote semantics

### Acceptance Criteria

- users can edit or withdraw their own supported messages through typed
  application behavior
- edits and withdrawals preserve inspectable audit history
- reply-to-message and quote actions reuse the thread model instead of opening
  unrelated screens
- tests cover permission boundaries and audit-safe edit or delete behavior

### Verification

- focused API tests for message edit or withdraw rules
- focused web tests for message action menus
- browser smoke for edit, reply, and pin or save flows

## MWP-06: Governed Messaging-Agent Identity And Provenance

### Priority

P1

### Size

M

### Outcome

Assistant participation in the messaging surface has explicit identity,
authorship, and execution provenance, and production behavior no longer depends
on silently borrowing a shared admin session.

### Why this matters

In-thread agent replies are the right UX direction, but the current local-dev
session shortcut would not meet enterprise expectations for who said what and
under whose authority.

### Scope

- define the supported identity model for agent-authored messages, including:
  - human requester
  - assistant agent or bot identity
  - execution mode
  - assistant run linkage
  - session or service-principal provenance
- separate local-development convenience behavior from supported signed-in and
  production behavior
- render clear authorship indicators in the thread UI for agent messages
- ensure agent replies continue to respect the Phase 1 ceiling:
  draft, explain, and stage only; no external commitment
- decide the signed-out behavior for reply-worthy public messages explicitly:
  sign-in requirement, restricted guest draft, or other governed fallback
- add evals or equivalent checks that confirm message authorship and action
  staging remain inspectable

### Out Of Scope

- autonomous external counterparty messaging
- widening agent authority beyond current draft and stage boundaries
- broad SSO or enterprise identity-provider redesign

### Suggested Owner Profile

Backend or platform engineer with assistant-runtime ownership, paired with a
frontend engineer on provenance UI.

### Dependencies

- MWP-01 for durable message storage
- current governed assistant runtime and action-request contract

### Acceptance Criteria

- every agent-authored message shows a clear agent identity and provenance path
- production or signed-in behavior does not rely on silently borrowing a shared
  admin user
- in-thread assistant replies remain linked to assistant runs and governed
  action requests where relevant
- assistant evals or equivalent tests fail if identity provenance disappears or
  agent replies exceed the current authority ceiling

### Verification

- focused API tests for session and provenance rules
- `make api-assistant-evals` when assistant runtime behavior changes
- focused web tests for authorship display
- browser smoke for signed-in and signed-out reply-worthy flows

## Recommended First Slice

If the team only funds one near-term slice, the highest-leverage path is:

1. MWP-01 durable conversation and message records
2. MWP-02 channel, DM, and inbox navigation
3. MWP-03 per-message threads and reply semantics

That sequence turns `Messages` from a seeded prototype into a real
collaboration surface. Compose polish and richer message actions are more
valuable after the underlying work objects exist.
