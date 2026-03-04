# Spec: Controller Auth for Non-Interactive Clients

- RFC: `docs/rfcs/2026-03-02-controller-auth-apikey-vs-keycloak-device.md`
- Depends on: secrets hardening

## Implementation Context

1. FastAPI auth dependencies are applied in API routers (`vela-controller/src/api/*`).
2. OpenAPI is assembled in `vela-controller/src/api/__init__.py` with custom Keycloak path mappings.
3. Non-interactive machine auth requires JWT principal mapping + optional API key fallback.

## Invariants

1. Existing human auth behavior MUST remain backward compatible.
2. Machine principals MUST be least-privileged by explicit RBAC mapping.
3. API keys MUST be hashed and one-time reveal only.

## Files and Packages

1. Auth core:
   - `vela-controller/src/api/auth.py`
   - `vela-controller/src/api/_util/*`
2. API key model/migrations:
   - `vela-controller/src/models/`
   - `vela-controller/src/models/migrations/versions/`
3. OpenAPI/auth docs:
   - `vela-controller/src/api/__init__.py`

## Ordered Commit Plan

1. Commit 1: principal model and JWT mapping for machine identities.
2. Commit 2: API key DB model, hash/verify utilities, admin key lifecycle endpoints.
3. Commit 3: RBAC mapping and endpoint authorization integration.
4. Commit 4: OpenAPI docs and CLI flow updates.

## API/Data Contracts

1. API key table fields: id, name, prefix, key_hash, scope, created_by, created_at, expires_at, revoked_at.
2. Admin endpoints:
   - create key (returns plaintext once)
   - list key metadata
   - revoke key
3. Audit log event fields: principal_type, principal_id, auth_method, outcome.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/auth`
2. Token validation tests (`aud/iss/exp/nbf`) and API key revoke/expire tests.
3. Negative RBAC tests for unauthorized machine principal access.
4. Confirm existing user token auth tests remain green.

## Definition of Done

1. Machine JWT and API key flows both function with explicit RBAC controls.
2. No plaintext API keys stored or retrievable after creation.
3. Auth decisions are fully auditable.
