# WeCom Integration Status

**Status:** External Dependency / School Tenant Pending

The WeCom adapter is implementation-ready at the application layer:

- WeCom callback application layer ready.
- `GET` and `POST` callback handlers ready.
- Signature verification and cryptographic processing implemented.
- WeCom identity binding implemented.
- Production callback route available at `/api/wecom/callback`.

Real-tenant URL verification is currently blocked by the external callback-domain/ICP filing requirement of the test WeCom tenant. This is an external deployment dependency, not a code defect.

Real tenant activation is deferred until integration with the school's WeCom tenant. The existing adapter, identity, Inbox, NormalizedMessage, and Event Engine architecture remains unchanged.
