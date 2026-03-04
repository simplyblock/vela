# Spec: Upgrade Preflight and Compatibility Gates

- RFC: `docs/rfcs/2026-03-02-upgrade-preflight-and-compatibility-gates.md`
- Depends on: capability manifest contract, install preflight

## Implementation Context

1. `vela-controller/src/api/__init__.py` currently runs Alembic `upgrade head` in startup path.
2. `/system/version` in `vela-controller/src/api/system.py` exposes only commit/timestamp.
3. No canonical upgrade compatibility manifest is enforced.

## Invariants

1. Production/HA startup MUST NOT auto-migrate without successful preflight decision.
2. Upgrade gates MUST run before point-of-no-return steps.
3. Upgrade reports MUST be auditable and immutable once generated.

## Files and Packages

1. Add `vela-controller/src/upgrade_preflight/` (engine, policy, models, checks).
2. Refactor `vela-controller/src/api/__init__.py` to support migration policy modes.
3. Extend `vela-controller/src/api/system.py` with upgrade preflight endpoints.
4. Add compatibility manifest artifact under `docs/capabilities/` or release bundle path.

## Ordered Commit Plan

1. Commit 1: upgrade manifest schema and fixtures.
2. Commit 2: gate engine and checks.
3. Commit 3: startup migration policy integration.
4. Commit 4: CLI/API/reporting and CI hooks.

## Required Gates

1. Version path gate.
2. DB migration chain integrity gate.
3. Addon/module compatibility gate.
4. CRD/API compatibility gate.
5. Provider capability gate.
6. Rollback readiness gate.

## Compatibility Behavior

1. Local dev profile may keep auto-migrate enabled with explicit setting.
2. Existing deployments without manifest: run compatibility wrapper using default conservative rules.
3. Mutable dependency refs (e.g. `ref=main`) fail strict upgrades.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/upgrade_preflight`
2. Simulate blocked and allowed upgrade edges.
3. Verify startup with production profile blocks migration when preflight is missing/failing.
4. Confirm API returns check-level evidence and remediation details.

## Definition of Done

1. Unsafe upgrades are blocked before migrations.
2. Decision reports are machine-readable and reproducible.
3. Startup migration behavior is policy-aware by profile.
