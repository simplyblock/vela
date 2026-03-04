# Spec: Secrets Bootstrap and UX Hardening

- RFC: `docs/rfcs/2026-03-02-secrets-bootstrap-ux-hardening.md`
- Depends on: operator model (for ownership), profiles

## Implementation Context

1. RFC-verified leakage paths include secret-like values in unsafe surfaces.
2. Startup and integration flows depend on required secrets.

## Invariants

1. Sensitive values MUST exist only in Secret resources or external secret stores.
2. Secrets MUST never be returned from APIs except one-time bootstrap responses when explicitly allowed.
3. Weak/default secrets MUST fail strict policy.

## Files and Packages

1. Chart hardening:
   - `vela-controller/chart/`
   - `vela-controller/src/deployment/charts/vela/`
2. Runtime secret handling:
   - `vela-controller/src/api/settings.py`
   - `vela-controller/src/api/__init__.py`
3. Secret metadata model + migration:
   - `vela-controller/src/models/`
   - `vela-controller/src/models/migrations/versions/`
4. Terraform secret integration:
   - `vela-terraform/secrets/*`

## Ordered Commit Plan

1. Commit 1: secret ownership matrix and metadata model.
2. Commit 2: chart/template hardening (ConfigMap -> Secret moves).
3. Commit 3: strict bootstrap validation and one-time generation paths.
4. Commit 4: rotation API/workflow + audit logging.

## Contract Details

1. Secret metadata API includes: owner, rotated_at, expires_at, source_type, status.
2. Rotation endpoint requires explicit principal authorization and emits audit events.
3. No secret material persisted in controller DB, except hashed values where required.

## Verification Protocol

1. Static scan test: fail build if known secret keys appear in ConfigMap manifests.
2. Integration tests for bootstrap generation and rotation.
3. API tests ensuring responses redact secret values.
4. Security logging tests to confirm no secret leakage.

## Definition of Done

1. Verified leakage paths in RFC are closed.
2. Rotation is test-covered and rollback-safe.
3. Strict installs fail on missing/weak required secrets.
