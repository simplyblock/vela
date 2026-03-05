# Spec: Kubernetes Operator Installation and Operations

- RFC: `docs/rfcs/2026-03-03-kubernetes-operator-installation-and-operations.md`
- Depends on: profiles, preflight engines, air-gap model, capability manifest

## Implementation Context

1. Current installation/operations are primarily Terraform/controller-driven.
2. This spec introduces CRD-driven reconciliation for platform install/upgrade and branch lifecycle operations.

## Invariants

1. Reconciliation MUST be level-triggered and idempotent.
2. CRDs MUST have strict schema validation and status conditions.
3. Upgrade reconciliation MUST invoke upgrade preflight gates.
4. Branch lifecycle reconciliation MUST support declarative `deploy|update|restart|restore|deprovision` operations.
5. Secret data MUST NOT be stored in CRD spec/status plaintext.

## Implementation Layout

1. Add operator package/repo path `vela-operator/` (preferred) or `vela-controller/src/operator/`.
2. Define CRDs:
   - `VelaInstallation`
   - `VelaAddon`
   - `VelaUpgradePlan`
   - `VelaBranchOperation`
   - `VelaBackupPolicy`
   - `VelaConformanceRun`
3. Add helm deployment under `vela-operator/chart/`.

## Ordered Commit Plan

1. Commit 1: scaffolding, scheme registration, leader election.
2. Commit 2: CRD definitions + validating webhooks.
3. Commit 3: installation and addon reconcilers.
4. Commit 4: upgrade and branch-operation reconcilers (`deploy|update|restart`).
5. Commit 5: backup/conformance + branch restore/deprovision flows.
6. Commit 6: metrics, events, and air-gapped packaging.

## CRD Contract Requirements

1. `spec` must include profile/provider/backend references (as applicable).
2. `status.conditions` must implement `Ready`, `Progressing`, `Degraded`.
3. Every reconciler must write `observedGeneration` and last transition reason/message.
4. `VelaBranchOperation.spec.operation` must be enum-constrained to supported branch lifecycle actions.

## Verification Protocol

1. Unit tests for each reconciler transition function.
2. `envtest` integration tests for CRD validation and reconcile loops.
3. HA test for leader-election failover.
4. Upgrade path tests asserting preflight gating behavior.
5. Branch lifecycle tests covering deploy, update, restart, restore, and deprovision operations.

## Definition of Done

1. Operator can install and upgrade Vela from CRDs in clean clusters.
2. Operator can execute branch deploy/update/restart/restore/deprovision from declarative CRDs.
3. Condition and event streams are actionable.
4. Air-gapped operator deployment path is documented and tested.
