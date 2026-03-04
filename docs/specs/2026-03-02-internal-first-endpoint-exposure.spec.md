# Spec: Internal-First Endpoint Exposure

- RFC: `docs/rfcs/2026-03-02-internal-first-endpoint-exposure.md`
- Depends on: gateway provider modes, DNS provider abstraction, profiles

## Implementation Context

1. Branch domain construction currently happens in deployment and branch APIs.
2. External endpoint assumptions are embedded in existing flows.

## Invariants

1. Default self-hosted behavior MUST be internal-only unless explicitly configured otherwise.
2. Public exposure MUST require validated gateway and DNS capabilities.
3. Mode transitions MUST be idempotent and reversible where safe.

## Files and Packages

1. Add exposure mode model in settings (`vela-controller/src/api/settings.py` and/or settings model module).
2. Refactor endpoint reconciliation in `vela-controller/src/deployment/__init__.py`.
3. Update branch endpoint response logic in `vela-controller/src/api/organization/project/branch/__init__.py`.
4. Update Terraform profile defaults and mode wiring in root and network/addon modules.

## Ordered Commit Plan

1. Commit 1: exposure mode enum + settings migration.
2. Commit 2: endpoint reconciler and branch response contract changes.
3. Commit 3: public exposure gating with DNS/gateway capabilities.
4. Commit 4: Studio UX mode selector and warnings.

## API Contract

1. Mode values: `internal_only`, `public_enabled`, `public_required`.
2. Branch endpoint payload MUST include `exposure_mode` and resolved endpoints.
3. System status endpoint MUST expose exposure mode and dependency readiness.

## Compatibility Matrix

1. Existing public deployments -> `public_enabled` unless overridden.
2. New self-hosted install -> `internal_only` default.
3. `public_required` + missing provider capabilities -> blocking failure.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/exposure`
2. Integration test mode transitions across existing branch lifecycle.
3. `cd vela-terraform && terraform validate` on profile fixtures.
4. Verify internal-only mode avoids DNS record writes.

## Definition of Done

1. Internal-first default is enforced for self-hosted profiles.
2. Public mode dependencies are preflight-gated.
3. Endpoint behavior remains backward compatible for existing public installs.
