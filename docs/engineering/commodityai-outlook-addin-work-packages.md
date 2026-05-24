# CommodityAI Outlook Add-in Work Packages

## Purpose

Make the Outlook add-in useful for sending selected emails into CommodityAI
while keeping authentication, upload behavior, and future production hardening
explicit.

## WP-01 Local Add-in Foundation

Status: implemented

Goal: keep the add-in loadable in Outlook for local development.

Scope:

- Serve the taskpane over trusted `https://localhost:3000`.
- Keep the manifest valid for Outlook message-read mode.
- Store the CommodityAI API key only in `Office.context.roamingSettings`.
- Route API calls through the local HTTPS dev server to avoid browser CORS
  failures.

Verification:

- Microsoft Office manifest validation.
- JavaScript syntax checks for the taskpane and dev server.
- Local HTTPS smoke checks.

## WP-02 Send Current Outlook Email To CommodityAI

Status: implemented

Goal: let a user open an email in Outlook and submit that email to CommodityAI
from the add-in taskpane.

Scope:

- Read the selected Outlook message through Office.js.
- Capture subject, sender, recipients, timestamps, attachment names, body text,
  and available Outlook item identifiers.
- Convert the captured email into a PDF on the local dev server.
- Submit the generated PDF to `POST https://commodityai.app/api/v1/documents`
  using multipart form data.
- Attach structured metadata that identifies Outlook as the source system.
- Show success, validation, permission, rate-limit, payload-size, and processing
  errors in the taskpane.

Out of scope:

- Uploading original email attachments as separate CommodityAI documents.
- Uploading raw `.eml` content. CommodityAI's public upload contract currently
  documents PDF and image files.

## WP-03 Attachment Forwarding

Status: proposed

Goal: send original email attachments to CommodityAI when they are supported
document types.

Scope:

- Use Office.js attachment APIs where supported by the Outlook host.
- Filter by CommodityAI-supported MIME types and file extensions.
- Upload each supported attachment as its own document with parent email
  metadata.
- Report skipped attachments with reasons.

Open questions:

- Whether CommodityAI should receive the email PDF and attachments as a batch or
  independent documents.
- Whether a workflow ID should be selected per attachment type.

## WP-04 Production Backend Hardening

Status: proposed

Goal: replace the local development proxy with a deployable service.

Scope:

- Move upload proxying to an authenticated backend.
- Encrypt or vault user API keys, or replace user keys with a server-side
  CommodityAI integration credential.
- Add request logging that records submission outcomes without storing API keys
  or email body text.
- Add retry policy, upload idempotency, and operator-visible audit records.

## WP-05 Submission History And Review

Status: proposed

Goal: help users understand what was sent and recover from failures.

Scope:

- Show recent submission status in the taskpane.
- Link the returned CommodityAI document ID when available.
- Add resend safeguards to prevent accidental duplicate submissions.
- Add browser smoke coverage for auth, send, and error states.
