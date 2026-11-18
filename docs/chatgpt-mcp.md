# ChatGPT MCP adapter (Stage 2)

The production Streamable HTTP endpoint is `/api/mcp`. The same application
handler is also mounted at `/mcp`, but Sites currently returns an edge 404
before that path reaches the application; use `/api/mcp` on the current Sites
domain. It is stateless and responds to
each POST with JSON; GET and DELETE return 405. It supports the current
`2026-07-28` protocol plus the listed legacy Streamable HTTP versions. It
advertises exactly one write tool, `add_to_big_baby`, with the minimal schema
`text`, `explicit_intent`, optional `category_hint`, and optional
`source_reference`. Tool discovery is public; execution requires OAuth.

The authorization server is Big Baby's existing origin. Discovery:

- `/.well-known/oauth-protected-resource` (also `/api/mcp`-specific well-known path)
- `/.well-known/oauth-authorization-server`

ChatGPT registers a public OAuth client at `/oauth/register` (DCR, with an
allowlist of ChatGPT callback URLs), then uses `/oauth/authorize` and
`/oauth/token`. The user signs in to their own Big Baby account and explicitly
consents to `handoff:create`. Authorization codes expire after five minutes,
are one-use, and require S256 PKCE. The `resource` parameter must exactly
match the protected MCP URL. Access tokens expire after one hour; rotating
refresh tokens expire after 30 days. `/oauth/revoke` revokes the grant family
and its existing integration credential. Big Baby stores only code/token
digests and never accepts a tool-supplied user ID. The existing account UI can
also revoke the grant's credential, immediately disabling its OAuth tokens.

The tool maps the verified user to an existing ChatGPT integration credential
and calls `handoffFromChatGpt`. It never writes Task/Event/Action directly.
One credential-scoped idempotency key is derived from the four canonical tool
arguments; retransmitting identical arguments under the same OAuth grant
returns the same result. A deliberate second copy of identical text requires
a new grant or a distinct `source_reference`.

Only the handed-off text is sent. No conversation history, inferred user
identity, or nonselected messages are attached. The result mirrors the actual
Event Engine decision. The pre-existing opaque credential Handoff API remains
available to non-Plugin clients.

Developer-mode acceptance remains separate from deployment: connect the public
HTTPS `/api/mcp` endpoint in ChatGPT, complete the OAuth consent, confirm
`tools/list` exposes one tool, then invoke exact/ambiguous/retry/revoke cases.
Do not claim developer-mode validation solely from server-side tests.
