# Spec: Install Preflight Validation

- RFC: `docs/rfcs/2026-03-02-install-preflight-validation.md`
- Depends on: capability manifest contract, profile resolver

## Implementation Context

1. There is no preflight package currently.
2. App startup (`vela-controller/src/api/__init__.py`) proceeds directly to DB migration/background tasks.
3. Validation failures today happen late in deployment/branch code.

## Invariants

1. `strict` mode MUST block install on any blocking failure.
2. Hard blockers MUST remain blockers in all policies.
3. Checks MUST NOT mutate infrastructure.

## Files and Packages

1. Create `vela-controller/src/preflight/` with `cli.py`, `engine.py`, `models.py`, `policy.py`, `checks/`, `reporters/`.
2. Add system API preflight endpoint(s) in `vela-controller/src/api/system.py`.
3. Add Terraform integration in `vela-terraform/main.tf` via explicit preflight execution step/documented wrapper.

## Ordered Commit Plan

1. Commit 1: base check/result model + reporters.
2. Commit 2: Kubernetes, CRD, class, provider, profile checks.
3. Commit 3: CLI/API surface and exit code contract.
4. Commit 4: Terraform gating and CI examples.

## Check Contract (required fields)

1. `id`, `category`, `severity`, `status`, `scope`, `blocking`, `message`, `evidence`, `remediation`, `docs_ref`.
2. Allowed status: `pass`, `fail`, `skip`.
3. Allowed severity: `error`, `warning`, `info`.

## Mandatory Blocking Checks (v1)

1. Kubernetes API reachable and authenticated.
2. Required CRDs present (snapshot, gateway/kong if selected).
3. Required StorageClass and VolumeSnapshotClass present.
4. Capability/profile combination supported by manifest.
5. Required credentials present for selected providers.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/preflight`
2. `cd vela-controller && tox -e lint,type-check,format-check`
3. Run `vela install preflight --format json --policy strict` against test clusters.
4. Validate Terraform integration path does not apply on blocking result.

## Definition of Done

1. Preflight engine returns deterministic machine-readable decisions.
2. CLI/API surfaces match contract and exit codes.
3. Install paths can be gated by preflight before any apply/install action.
