# Spec: Self-Hosted Storage Backend Abstraction

- RFC: `docs/rfcs/2026-03-02-self-hosted-storage-backend-abstraction.md`
- Depends on: profiles, capability manifest, terraform provider decoupling

## Implementation Context

Verified active coupling points (from current code):

1. `vela-controller/src/deployment/__init__.py` has simplyblock-specific class/qos/runtime API calls.
2. `vela-controller/src/api/organization/project/branch/__init__.py` uses hardcoded snapshot class expectations.
3. `vela-controller/src/api/backup.py` and `backupmonitor.py` use simplyblock snapshot defaults.
4. `vela-controller/src/deployment/deployment.py` and `vela-controller/src/models/branch.py` treat `iops` as required.
5. Terraform includes always-on simplyblock addon resources.

## Invariants

1. Legacy simplyblock behavior MUST remain parity-compatible behind adapter.
2. Storage class and snapshot class MUST be setting-driven, not hardcoded.
3. Unsupported QoS operations MUST fail explicitly in strict mode.
4. PostgreSQL remains the only database backend.

## Files and Packages

1. Add backend interface package: `vela-controller/src/deployment/storage_backends/`.
2. Adapter implementations: `simplyblock.py`, `zfs.py`, `lvm.py`, `generic_csi.py`.
3. Refactor call sites in:
   - `vela-controller/src/deployment/__init__.py`
   - `vela-controller/src/api/organization/project/branch/__init__.py`
   - `vela-controller/src/api/backup.py`
   - `vela-controller/src/api/backupmonitor.py`
   - `vela-controller/src/api/resources.py`
4. Evolve QoS contract in:
   - `vela-controller/src/deployment/deployment.py`
   - `vela-controller/src/models/branch.py`
   - `vela-controller/src/models/migrations/versions/*`

## Ordered Commit Plan

1. Commit 1: interface + simplyblock adapter parity wrapper.
2. Commit 2: de-hardcode class/snapshot settings and refactor call sites.
3. Commit 3: structured QoS model with `legacy-iops-compat` transition mode.
4. Commit 4: zfs/lvm/generic-csi adapters and profile wiring.
5. Commit 5: Studio capability-driven UX updates.

## API and Data Contracts

1. Add `GET /system/storage-capabilities` in `vela-controller/src/api/system.py`.
2. Capabilities include operations + qos support granularity.
3. Branch schema migration path:
   - phase 1: keep `iops`, add optional structured qos object fields.
   - phase 2: make `iops` compatibility-derived.

## Compatibility Matrix

1. Backend `simplyblock`: full parity expected.
2. Backend `zfs`/`lvm`: clone/resize/snapshot subject to CSI capability flags.
3. Backend `generic-csi`: minimal supported set; unsupported ops fail with actionable errors.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/storage_backends`
2. Run parity tests against current simplyblock fixtures.
3. Run matrix tests for `simplyblock`, `zfs`, `lvm`, `generic-csi` profiles.
4. Validate migration up/down and legacy record behavior.

## Definition of Done

1. No direct simplyblock calls remain in generic branch lifecycle paths.
2. Capability endpoint drives API validation and Studio controls.
3. Existing simplyblock deployments upgrade without behavior regressions.
