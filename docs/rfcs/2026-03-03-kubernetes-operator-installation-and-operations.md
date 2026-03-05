# RFC: Kubernetes Operator-Based Installation and Operations for Self-Hosted Vela

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03
- Related RFCs:
  - `2026-03-02-dag-workflow-manager.md`
  - `2026-03-02-install-preflight-validation.md`
  - `2026-03-02-upgrade-preflight-and-compatibility-gates.md`
  - `2026-03-02-opinionated-deployment-profiles.md`
  - `2026-03-02-self-hosted-storage-backend-abstraction.md`
  - `2026-03-02-gateway-provider-modes.md`
  - `2026-03-02-dns-management-provider-abstraction.md`
  - `2026-03-03-capability-manifest-contract-for-terraform-and-preflight.md`

## 1. Summary

Introduce a Kubernetes Operator as the primary control-plane installer and lifecycle manager for self-hosted Vela.

The operator provides:

1. Declarative installation via CRDs.
2. Continuous reconciliation for drift correction and health remediation.
3. Profile-aware orchestration for install, upgrade, branch deployment/update/restart/restore, backup guardrails, and provider capability gates.
4. A consistent API surface for day-0, day-1, and day-2 operations in Kubernetes-native environments.

## 2. Motivation

Current install/ops flows are split across Terraform modules, manual runbooks, and controller startup logic. This creates:

- non-declarative drift and hard-to-audit changes
- inconsistent behavior across providers/environments
- weak convergence guarantees for long-running operations

An operator provides a native reconciliation model for installation and operations and reduces imperative orchestration sprawl.

## 2.1 Current implementation verification (as of 2026-03-03)

The current repository has no dedicated Kubernetes operator implementation yet. Installation and operations are handled through Terraform modules, Helm, and controller runtime code.

Verified current-state facts relevant to this RFC:

1. No operator project/controller-runtime scaffolding exists in the repository.
2. Terraform addons manage major dependencies (cert-manager, StackGres operator, Kong operator, simplyblock CSI, Neon autoscaler manifests).
3. Controller branch lifecycle uses imperative orchestration in Python (`helm install/uninstall`, DNS provisioning, Gateway API route/Kong plugin application).
4. Controller startup currently auto-runs DB migrations to Alembic head.
5. Gateway/DNS/storage assumptions are effectively hardcoded in several paths (Kong + Gateway API, Cloudflare DNS, simplyblock storage class defaults).

Implication: operator introduction is a net-new control plane and must define clear ownership boundaries with existing Terraform and controller flows.

## 3. Goals

1. Make platform install/upgrade/rollback-prep and branch lifecycle operations declarative through CRDs.
2. Encode profile and capability policy directly in reconciliation.
3. Provide idempotent, resumable workflows for platform operations.
4. Support HA operator deployment and safe leader-elected control loops.
5. Integrate with existing controller APIs and planned DAG workflow manager.
6. Expose status/conditions/events suitable for Studio and CLI.
7. Provide an incremental migration path from Terraform/manual ownership to operator-managed ownership without destructive takeovers.

## 4. Non-Goals

1. Replacing Vela controller business logic in v1.
2. Replacing Terraform for underlying non-Kubernetes infra provisioning in v1.
3. Supporting non-Kubernetes platforms.

## 5. Operator Scope

## 5.1 In scope

1. Platform installation/bootstrap on existing cluster.
2. Addon lifecycle (storage/gateway/dns/observability bundles).
3. Secret bootstrap and rotation orchestration hooks.
4. Upgrade orchestration with preflight gates and checkpoints.
5. Branch lifecycle orchestration: deploy, update, restart, restore, and deprovision flows.
6. Policy/drift validation for deployment profile compatibility.

## 5.2 Out of scope (initial)

1. Cloud VPC/VM creation.
2. Multi-cluster federation.
3. Full rewrite of branch business logic internals inside the existing controller in v1.
4. Branch autoscaling policy/optimization beyond explicit operator-triggered lifecycle actions.

## 6. Architecture

## 6.1 Components

1. `vela-operator-manager`
   - controller-runtime manager
   - leader election
   - metrics endpoint
   - webhook server
2. Reconcilers
   - `VelaInstallationReconciler`
   - `VelaAddonReconciler`
   - `VelaUpgradePlanReconciler`
   - `VelaBranchOperationReconciler`
   - `VelaBackupPolicyReconciler`
   - `VelaConformanceRunReconciler`
3. Shared services
   - capability resolver (from capability manifest)
   - workflow executor adapter (DAG manager integration)
   - artifact resolver (online/offline)
   - health/reporting service
4. Ownership/Adoption service
   - detects existing resources and applies explicit ownership policy (`adopt|observe|ignore`) per component
   - prevents accidental takeover of resources not declared operator-managed

## 6.2 Reconciliation model

Each CRD follows:

1. Validate spec (admission + runtime validation).
2. Resolve dependencies/capability gates.
3. Reconcile desired state to cluster resources.
4. Update `status.conditions`, `observedGeneration`, and progression fields.
5. Requeue with backoff on transient failures.

Reconciliation MUST also:

1. Use server-side apply with stable field managers for managed resources.
2. Use finalizers for safe teardown and external cleanup sequencing.
3. Honor explicit ownership mode to avoid overriding Terraform-managed resources unexpectedly.

## 7. CRD Design

## 7.1 `VelaInstallation` (cluster-scoped)

Purpose:

- declares desired platform installation state.

Spec (key fields):

- `profile`: `single-node-dev|single-node-prod-lite|basic-ha-cluster|full-ha-cluster`
- `enforcement`: `strict|warn`
- `airgap.enabled`: bool
- `artifactRef`: reference to bundle/manifests
- `infra.provider`: `existing-cluster|...`
- `storage.backend`: `simplyblock|zfs|lvm|generic-csi`
- `gateway.provider`: `kong|gateway_api|ingress|external`
- `dns.manager`: `disabled|cloudflare|python|external`
- `endpointExposure.mode`: `internal_only|public_enabled`
- `secrets.mode`: `bootstrap|external_refs_only`
- `controller.replicas`, `studio.replicas`
- `paused`: bool
- `ownershipPolicy`: `adopt|observe|strict-manage`

Status:

- `phase`: `Pending|Reconciling|Ready|Degraded|Failed`
- `conditions[]`: standard condition set
- `capabilityResolution`
- `appliedComponents[]`
- `lastSuccessfulReconcileTime`
- `observedGeneration`
- `ownershipSummary`
- `dependencyReadiness`

## 7.2 `VelaAddon` (namespaced)

Purpose:

- optional/additional addon lifecycle with explicit ownership and policy.

Spec:

- `type`: `observability|gateway|dns|storage-extension|custom`
- `source`: chart/manifest reference
- `version`
- `valuesRef`
- `dependsOn[]`
- `policy`: `strict|best_effort`

Status:

- `state`: `Enabled|Disabled|Degraded|Failed`
- `conditions[]`
- `appliedVersion`

## 7.3 `VelaUpgradePlan` (cluster-scoped)

Purpose:

- declarative upgrade orchestration request.

Spec:

- `sourceVersion` (optional autodetect)
- `targetVersion`
- `policy`: `strict|best_effort`
- `preflight`: config
- `rollbackGuard`: checkpoint requirements
- `ackPointOfNoReturn`: token (optional)

Status:

- `phase`: `Pending|PreflightFailed|Approved|Running|Succeeded|Failed`
- `checks[]` (machine-readable results)
- `rollbackReady`
- `pointOfNoReturnState`
- `currentStep`
- `startedAt`
- `completedAt`
- `preflightRunRef`

## 7.4 `VelaBackupPolicy` (cluster-scoped)

Purpose:

- declarative platform-level backup defaults and guardrails.

Spec:

- `required`: bool
- `scheduleBaseline`
- `retentionPolicy`
- `checkpointOnUpgrade`: bool

Status:

- `complianceState`
- `violations[]`

## 7.5 `VelaConformanceRun` (namespaced or cluster-scoped)

Purpose:

- execute post-install/upgrade conformance suites.

Spec:

- `suiteId`
- `profile`
- `providerCombo`
- `timeout`

Status:

- `phase`
- `resultsSummary`
- `artifactRefs`

## 7.6 `VelaBranchOperation` (namespaced)

Purpose:

- declarative branch lifecycle operation requests.

Spec:

- `branchRef` (identifier/name)
- `operation`: `deploy|update|restart|restore|deprovision`
- `sourceRevision` (for deploy/update)
- `restoreRef` (backup/snapshot reference for restore)
- `policy`: `strict|best_effort`
- `timeout`

Status:

- `phase`: `Pending|Running|Succeeded|Failed`
- `conditions[]`
- `currentStep`
- `lastSuccessfulOperationTime`
- `operationResultSummary`

## 8. CRD Validation Requirements

## 8.1 Admission webhooks

Required validating webhook checks:

1. Invalid combination rejection (for example `public_enabled` + `dns=disabled` in strict policy).
2. Required field presence by mode/profile.
3. Version compatibility checks for referenced API schema versions.
4. Single active `VelaUpgradePlan` per `VelaInstallation` (unless explicitly marked concurrent-safe in future versions).
5. `ownershipPolicy=strict-manage` blocked when conflicting managed-by labels/annotations indicate another owner.

Mutating webhook (optional):

- defaulting values based on profile and capability manifest.

## 8.2 OpenAPI schema constraints

Each CRD must include:

- enum constraints
- structural schema
- nullable/required semantics
- max lengths and pattern validation where applicable

## 9. Condition and Event Model

Standard conditions across CRDs:

1. `Ready`
2. `Progressing`
3. `Degraded`
4. `ValidationFailed`
5. `DependencyNotReady`
6. `ReconcileError`
7. `OwnershipConflict`
8. `PreflightBlocked`

Condition fields:

- `type`, `status`, `reason`, `message`, `lastTransitionTime`, `observedGeneration`

Events:

- emitted for major transitions and remediation hints.

## 10. Reconciliation Semantics

## 10.1 Idempotency

Every reconcile step must be idempotent and converge from partially applied states.

Reconcile checkpoints should be persisted in CR `status` for resumability across leader failover.

## 10.2 Drift correction

Operator continuously detects drift from managed resources:

- patch/reapply desired state
- respect `paused=true` and maintenance windows where configured
- respect `ownershipPolicy=observe` by reporting drift without mutating resources

## 10.3 Dependency graph

Install and upgrade reconciliation uses explicit graph ordering:

1. CRDs/controllers dependencies
2. secrets and config dependencies
3. core services
4. optional addons

Complex flows can be delegated to workflow manager while keeping CRD status source of truth.

Initial dependency graph MUST account for currently required components:

1. cert-manager readiness before certificate-dependent gateway resources
2. gateway provider CRDs/controllers before HTTPRoute/Gateway reconciliation
3. storage backend readiness (for example CSI + StorageClass) before stateful workloads
4. StackGres operator/CRDs before database custom resources

## 11. Security and RBAC

## 11.1 Service accounts

Use least privilege split:

1. Manager SA: read/write for owned API groups/resources.
2. Optional separated SA per high-risk reconciler (upgrades/secrets).

Required API groups to scope explicitly (least privilege):

- `apiextensions.k8s.io`
- `apps`, `batch`, `core`
- `gateway.networking.k8s.io`
- `cert-manager.io`
- `stackgres.io`
- `snapshot.storage.k8s.io`
- `vm.neon.tech` (where NeonVM integration is enabled)

## 11.2 Secrets handling

1. no secret values in CRD spec/status/events.
2. secret references only (`SecretRef`, external secret refs).
3. rotation operations logged with metadata only.

## 11.3 Multi-tenancy boundaries

v1 assumes cluster-admin/operator-managed installation scope.
Namespace tenancy controls can be added later.

## 12. HA and Reliability

## 12.1 Operator HA

1. deployment replicas >=2 for production profiles.
2. leader election enabled for reconcilers with side effects.
3. non-leader replicas serve readiness/metrics but no write-side reconciliation.

Leader election config (lease duration/renew deadline/retry period) must be explicit and profile-tuned.

## 12.2 Work queue behavior

1. rate-limited retries with exponential backoff.
2. reconcile timeout guards.
3. dead-letter-like status markers for repeated hard failures.

## 12.3 Failure domains

1. transient dependency failures -> `Degraded` with retry.
2. hard validation failures -> `ValidationFailed`, no repeated churn.

## 13. Upgrade and Rollback Model

## 13.1 Upgrade flow

`VelaUpgradePlan` reconciliation:

1. run preflight checks
2. enforce rollback checkpoints
3. apply ordered component updates
4. execute post-upgrade verification
5. update status and emit summary

Upgrade execution must integrate the upgrade preflight contract and block execution on failed blocking checks.

## 13.2 Point-of-no-return handling

Operator marks irreversible transitions and requires acknowledgement where policy demands.

## 13.3 Rollback

v1: guardrails and readiness checks only; no full automatic rollback orchestration.

## 14. Deployment Model

## 14.1 Packaging

Ship operator via:

1. Helm chart (`vela-operator`)
2. optional OLM bundle metadata

Chart includes:

- CRDs
- manager deployment/serviceaccount/rbac
- webhook service/cert config
- metrics/service monitor (optional)

## 14.2 Installation paths

1. `helm install vela-operator ...`
2. create `VelaInstallation` resource
3. observe status until `Ready=True`

Path 1 (bootstrap coexistence):

1. install operator in `observe` mode first
2. produce ownership/conflict report
3. switch selected components to `strict-manage` after approval

## 14.3 Air-gapped compatibility

Operator image/chart must support offline artifact refs and avoid external fetches in air-gap mode.

Operator must not embed runtime remote fetches for CRDs/manifests/charts in air-gap mode; all artifact resolution must use internal/bundled sources.

## 15. Observability

## 15.1 Metrics

Required metrics:

- reconcile totals by CRD/result
- reconcile duration histogram
- queue depth
- condition transition counters
- dependency readiness gauges

## 15.2 Logging

Structured logs with:

- resource kind/name/namespace
- reconcile request id
- step name and decision reason

## 15.3 Tracing (optional v1)

Add OpenTelemetry hooks for long-running reconcile workflows.

## 16. API and UX Integration

Expose operator-derived states to:

1. CLI (`vela install status`, `vela upgrade status`)
2. CLI (`vela branch deploy|update|restart|restore status`)
3. Studio system pages for profile/capability/drift/upgrade/branch-operation progress

Controller or aggregator API should surface CRD status snapshots without requiring direct kube access from Studio.

Proposed API path alignment with current controller routing:

- `GET /system/operator/installations`
- `GET /system/operator/installations/{name}`
- `GET /system/operator/upgrade-plans/{name}`
- `GET /system/operator/branch-operations`
- `GET /system/operator/branch-operations/{name}`

## 17. Implementation Plan

Phase A:

1. scaffold operator project and CRD APIs (`VelaInstallation`, `VelaUpgradePlan`)
2. implement profile/capability validation and basic install reconciliation
3. implement conditions/events baseline
4. deliver `observe` ownership mode and conflict reporting only (no destructive adoption)

Phase B:

1. addon reconciliation (`VelaAddon`)
2. preflight and upgrade gating integration
3. branch lifecycle reconciliation (`VelaBranchOperation`) for deploy/update/restart
4. HA hardening and leader election validation
5. controlled adoption to `strict-manage` for selected components

Phase C:

1. backup policy and conformance CRDs
2. branch restore/deprovision flows and failure recovery hardening
3. air-gap artifact integration
4. Studio/CLI integration for status and diagnostics
5. evaluate handoff/deprecation path for overlapping Terraform-managed components

## 18. Testing Strategy

1. Unit tests:
   - defaulting/validation
   - condition transitions
   - reconcile step logic and retries
2. Envtest/integration tests:
   - CRD lifecycle and reconciliation
   - dependency failure and recovery scenarios
   - webhook validation behavior
3. E2E:
   - install for each supported profile baseline
   - upgrade with preflight pass/fail paths
   - branch deploy/update/restart/restore flows
   - HA failover of operator leader
   - air-gap install flow
   - ownership conflict/adoption transition flow (`observe -> strict-manage`)

## 19. Risks and Mitigations

1. Risk: duplicated orchestration with existing controller workflows.
   - Mitigation: clear ownership boundaries and workflow adapter contract.
2. Risk: overly broad RBAC permissions.
   - Mitigation: staged least-privilege review and per-reconciler scopes.
3. Risk: reconcile thrash in degraded environments.
   - Mitigation: bounded retries, pause semantics, and explicit failure states.
4. Risk: complex CRD surface increases operator burden.
   - Mitigation: profile defaults, schema validation, and concise status diagnostics.
5. Risk: ownership conflicts with existing Terraform/manual resources.
   - Mitigation: explicit ownership policy, observe-first rollout, and conflict conditions before mutation.

## 20. Open Questions

1. What is the final split between `VelaBranchOperation` and existing controller APIs during transition phases?
2. Should OLM packaging be GA requirement or optional?
3. Do we require separate control-plane namespace isolation by default?
4. Which CRDs should be cluster-scoped vs namespaced in final tenancy model?
5. Should operator implementation live in this repository or a dedicated `vela-operator` repository with independent release cadence?

## 21. Decision

Adopt a Kubernetes Operator-based installation and operations model with declarative CRDs, reconciliation-driven lifecycle management for platform and branch operations, capability/profile enforcement, and upgrade guardrails as the long-term control-plane operations path for self-hosted Vela.
