# ChatGPT Handoff Contract

This is a provider-neutral external-client contract. It does not require an
OpenAI SDK, ChatGPT Plugin, App, Connector, or Action implementation.

## Credential lifecycle

An authenticated Big Baby user manages only their own credentials through
`/api/integrations/chatgpt`:

- `GET` lists credential metadata; raw access tokens are never returned.
- `POST { "action": "create_credential" }` creates an active credential and
  returns its opaque access token once.
- `POST { "action": "revoke_credential", "credential_id": "…" }` revokes
  the caller's credential. Existing Inbox, Event, Action, and Evidence data is
  not removed.

## Handoff request

`POST /api/integrations/chatgpt/handoff`

Required headers:

- `Authorization: Bearer <opaque integration credential>`
- `Idempotency-Key: <stable request identifier>`

The payload contains `original_text`, optional `explicit_intent`, `category`,
`title`, `deadline`, `location`, `materials`, `source_reference`, and compact
metadata. Structured fields are hints only; they never override Event Engine
role, conflict, matching, or confidence rules.

The route authenticates the credential, derives the internal user exclusively
from that credential, writes one `InboxItem` with `source_type = chatgpt`, then
uses the existing normalization and Event Engine pipeline. It returns the Inbox
ID, any Event ID, the final review decision, review reasons, and candidate
Action IDs. It does not create a confirmed Task directly.

Important time facts should also be present in `original_text`. An ambiguous
relative date remains subject to the existing `NEEDS_REVIEW` safety gate.
