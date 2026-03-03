# RFC: Extending Vela-Controller Auth for Non-Interactive Clients

- Status: Draft
- Target release: Phased

## 1. Summary

Extend `vela-controller` authentication to support non-interactive clients beyond the current user Bearer-token flow.

Two candidate approaches are evaluated:

1. Native controller `apikey` authorization scheme.
2. Separate device-to-device authentication via Keycloak (OAuth2 device flow and/or service-account client credentials).

This RFC proposes the target architecture, API changes, security model, and migration plan.

## 2. Current State

Current controller auth behavior:

- API enforces `Authorization: Bearer <token>` through `HTTPBearer` dependency.
- Token validation is JWT/JWKS-based with these current implementation details:
  - `jwt_secret` is interpreted as either a symmetric signing key or a JWKS URL.
  - token decoding currently disables audience verification (`verify_aud=false`).
  - issuer and token-use typing are not explicitly enforced in auth dependency.
  - JWT payload validation currently focuses on `sub` and optional `aal`, while extra claims are ignored.
- Principal resolution maps `sub` to `User`; if user row is absent, an in-memory `User(id=sub)` is returned.
- No first-class controller-level machine identity model exists for external automation clients.

Important related capability already present:

- Branch-scoped API keys exist for branch services, but they are not controller-management API credentials.
- Existing branch API keys are branch data-plane credentials and are currently stored as raw key values in DB records.

## 3. Problem Statement

Automation clients (CLI, CI/CD, agents, GitOps jobs, device workflows) need stable, non-interactive access.

Current options are weak:

- reusing human tokens
- long-lived copied tokens
- ad-hoc credentials without lifecycle governance

We need a secure, auditable, and operator-friendly machine-auth model.

## 4. Goals

1. Support secure non-interactive auth for controller API.
2. Preserve existing RBAC/permission semantics.
3. Provide clear credential lifecycle: create, scope, rotate, revoke, audit.
4. Keep compatibility with existing Bearer-token clients.
5. Enable staged rollout with minimal operational risk.

## 5. Non-Goals

1. Replacing current user Bearer auth.
2. Supporting unauthenticated API access.
3. Introducing custom cryptography primitives.

## 6. Options

## 6.1 Option A: Native `apikey` scheme in controller

### 6.1.1 High-level design

- Add support for `Authorization: ApiKey <key>` (or `X-API-Key`) in auth dependency chain.
- Store only hashed API key material in database.
- Bind each API key to principal metadata and RBAC scope.

### 6.1.2 Required components

- API key model/table for controller principals.
- Key issuance endpoints (admin-protected).
- Hashing/verification pipeline.
- Rotation/revocation endpoints.
- OpenAPI security scheme for `ApiKeyAuth`.

### 6.1.3 Pros

- Simple operator mental model.
- Independent of IdP availability during runtime auth.
- Fast implementation path.

### 6.1.4 Cons

- Duplicates identity lifecycle outside Keycloak.
- Adds sensitive credential storage and policy burden in controller.
- Harder SSO/compliance alignment for enterprises.

## 6.2 Option B: Keycloak device-to-device auth

### 6.2.1 High-level design

Use Keycloak as sole token issuer for non-interactive clients via:

1. OAuth 2.0 Device Authorization Grant for human-approved device login flows.
2. OAuth 2.0 Client Credentials for service-account machine-to-machine flows.

Controller continues to accept Bearer JWT only, but now includes non-user machine principals issued by Keycloak.

### 6.2.2 Required components

- Dedicated Keycloak clients for machine auth.
- Scope/role mapping for machine principals.
- Controller claim-to-principal mapper for service accounts.
- Optional token exchange rules for delegated workflows.

### 6.2.3 Pros

- Single identity plane and policy source.
- Mature standards-based lifecycle and revocation.
- Better enterprise interoperability and compliance posture.

### 6.2.4 Cons

- More Keycloak setup complexity.
- Runtime dependency on IdP/JWKS health remains critical.
- Device flow UX requires extra CLI polling flow.

## 6.3 Option C: Hybrid

- Primary: Keycloak non-interactive auth (Option B).
- Secondary fallback: controller-native API keys only for break-glass/self-host constrained setups.

## 7. Recommendation

Adopt Option B as default architecture, with optional Option A fallback behind explicit feature flag.

Rationale:

- minimizes identity duplication
- keeps auth standards-based
- aligns with existing Keycloak-centric auth topology

If fallback API key mode is implemented, it must be explicitly enabled and constrained (short TTL, strict scopes, audit
requirements).

## 8. Proposed Auth Architecture

## 8.1 Principal types

- `user` (existing)
- `service_account` (Keycloak client credentials)
- `device` (approved via device flow, represented by user token)
- `controller_apikey` (optional fallback mode)

## 8.2 Token acceptance

Controller auth middleware validates Bearer JWT and then resolves principal type from claims:

- `sub`, `azp`, `client_id`, realm/client roles, and audience

For fallback API keys, auth chain attempts API key verification only when feature enabled.

Required validation hardening before machine-auth GA:

1. Enforce issuer allow-list.
2. Enforce audience checks for controller API.
3. Enforce token type/use constraints for service-account vs user tokens.
4. Reject ambiguous principal mapping where claims cannot be deterministically classified.

## 8.3 RBAC mapping

Reuse existing permission model:

- map machine principal to role bindings in org/project/branch scope
- support least-privilege service roles

Clarification:

- Authentication and authorization remain distinct concerns.
- This RFC extends authentication for non-interactive principals and requires explicit role bindings for those principals.
- Endpoint-level permission enforcement hardening is complementary work and should not be silently assumed by machine-auth rollout.

## 9. API and CLI Changes

## 9.1 Controller API

Keep existing Bearer security scheme and add machine principal semantics.

Add principal-management endpoints (admin-protected) for Keycloak-backed machine identities:

- `POST /system/machine-principals/bind` (bind Keycloak `client_id` or subject to Vela role scope)
- `GET /system/machine-principals` (list bindings and metadata)
- `DELETE /system/machine-principals/{id}` (remove binding)

If fallback API key mode enabled, add admin endpoints:

- `POST /system/apikeys` create
- `GET /system/apikeys` list metadata
- `POST /system/apikeys/{id}/rotate`
- `DELETE /system/apikeys/{id}` revoke

No endpoint ever returns stored key hash or secret after creation.

## 9.2 CLI flows

- `vela auth device-login` (Device Authorization Grant)
- `vela auth service-token` (Client Credentials)
- optional: `vela auth apikey create|rotate|revoke` in fallback mode

## 9.3 OpenAPI

Define security schemes:

- `HTTPBearer` (default)
- `ApiKeyAuth` (only when fallback enabled)

Operations remain Bearer-first for compatibility.

Clarification:

- Branch API key endpoints are out of scope for this RFC and remain branch data-plane credentials.

## 10. Data Model (Fallback API Key Mode)

Proposed fields:

- `id`
- `name`
- `key_prefix`
- `key_hash`
- `principal_type`
- `principal_ref`
- `scopes`
- `expires_at`
- `last_used_at`
- `revoked_at`
- `created_by`
- `created_at`

Security requirements:

- store hash only (Argon2id or bcrypt with strong cost)
- constant-time comparison
- one-time reveal on creation

Additional model requirement (Keycloak-first path):

- Add machine-principal binding model for RBAC assignment without duplicating credential material:
  - `id`
  - `principal_type` (`service_account|device_subject`)
  - `principal_external_id` (for example `client_id` or stable subject)
  - `org_id|project_id|branch_id|env_type`
  - `role_ids`
  - `created_at|updated_at|created_by`

## 11. Security Requirements

1. Short-lived tokens preferred over static credentials.
2. Enforce audience and issuer validation for machine tokens (and existing bearer tokens).
3. Require explicit scopes/roles for machine principals.
4. Log auth events with principal type and key/token identifier (never secret).
5. Rate-limit failed auth attempts.
6. Rotation and revocation must propagate quickly.
7. Do not persist raw fallback API keys; hash-only storage is mandatory.
8. Define fail-closed behavior for JWT validation failures and claim mismatches.

## 12. Operational Requirements

1. Keycloak bootstrap should include machine-auth client templates.
2. Preflight should validate machine-auth configuration when enabled.
3. Health endpoint should include auth-provider readiness details.
4. Document break-glass path when IdP is unavailable.
5. JWKS retrieval behavior must include bounded caching and retry policy with explicit timeout controls.
6. Air-gapped deployments must support explicit offline IdP/JWKS configuration or fallback mode policy guidance.

## 13. Migration Plan

Phase 0:

- tighten existing bearer validation (audience/issuer/type checks)
- add deterministic principal classification and explicit reject reasons
- add auth observability counters/log fields for reject causes

Phase A:

- Add machine principal mapping for Bearer tokens.
- Introduce CLI device-login and service-account flow docs.

Phase B:

- Add service-account RBAC assignment APIs/UX.
- Add audit events and usage telemetry.

Phase C (optional fallback):

- Add controller API key mode behind feature flag.
- Provide strict default policies (expiry required, scope required).

## 14. Testing Plan

1. Unit:
    - principal type resolution from JWT claims
    - RBAC mapping correctness
    - fallback API key hash/verify logic
2. Integration:
    - device flow login and token use
    - client-credentials token use with scoped permissions
    - revocation behavior
    - mixed user + machine auth
3. E2E:
    - CI agent workflow using service account
    - device login workflow from CLI
    - fallback API key workflow (if enabled)
4. Security regression:
    - invalid audience/issuer rejection
    - wrong token type rejection
    - revoked principal/binding enforcement

## 15. Risks and Mitigations

1. Risk: Role mapping mistakes grant excess machine privileges.
    - Mitigation: explicit scope mapping + deny-by-default + integration tests.
2. Risk: Keycloak outage impacts token validation.
    - Mitigation: resilient JWKS caching, readiness checks, break-glass guidance.
3. Risk: Two auth modes increase complexity.
    - Mitigation: make fallback API key mode opt-in and clearly documented as secondary.

## 16. Open Questions

1. Should fallback API key mode be shipped in v1 or deferred?
2. Which token audiences should be mandatory for machine principals?
3. Do we require organization approval workflow for service-account credential issuance?
4. Should device flow be enabled by default in all profiles?
5. Should machine principal bindings use `client_id` only or immutable Keycloak internal identifiers?

## 17. Decision

Adopt Keycloak-based non-interactive auth (device flow + client credentials) as the primary extension to controller
authorization, while keeping an optional, tightly controlled native API key fallback for constrained self-hosted
environments.
