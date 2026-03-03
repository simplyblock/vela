# RFC: Storage Backend Abstraction for Self-Hosted Vela (Single-Host ZFS/LVM and Beyond)

- Status: Draft
- Target release: Phased (see rollout plan)
- Last updated: 2026-03-03

## 1. Summary

`vela-controller` currently assumes a simplyblock-backed deployment for key storage behaviors (per-branch StorageClass creation with QoS parameters, volume usage/performance metering via simplyblock API, and default snapshot class naming). This creates friction for smaller self-hosted setups where operators want a single host with ZFS, LVM, or other snapshot-capable storage.

This RFC proposes:

1. A storage backend abstraction layer in `vela-controller` with explicit capabilities.
2. A phased implementation with first-class `zfs` and `lvm` backends, plus an optional `generic-csi` fallback for minimal compatibility (including btrfs-based deployments via qcow2 fallback mode).
3. Capability-aware APIs so `vela-studio` can adapt UX (especially around QoS/performance and storage controls) per backend.

The design is Kubernetes-only and keeps branch clone/restore semantics based on Kubernetes `VolumeSnapshot`, while removing hard coupling to simplyblock APIs and names.

## 2. Motivation

Self-hosting adoption is blocked by current assumptions:

- Controller hard-codes simplyblock resources and defaults:
  - `SIMPLYBLOCK_CSI_STORAGE_CLASS = "simplyblock-csi-sc"` in `vela-controller/src/deployment/__init__.py`
  - `_VOLUME_SNAPSHOT_CLASS = "simplyblock-csi-snapshotclass"` in `vela-controller/src/api/organization/project/branch/__init__.py`
  - backup defaults also use `"simplyblock-csi-snapshotclass"` in `vela-controller/src/api/backup.py` and `vela-controller/src/api/backupmonitor.py`
- QoS lifecycle is simplyblock-specific:
  - `update_branch_volume_iops()` updates volumes via simplyblock API.
  - resource monitor queries usage via simplyblock volume iostats (`api/resources.py`).
- Helm defaults still reference simplyblock storage classes in `vela-controller/src/deployment/charts/vela/values.yaml`.
- Current Terraform automation (`vela-terraform/addons/simplyblock.tf`, related addon defaults) is also simplyblock-centric, which reinforces a single backend path in real deployments.
- Studio currently assumes `iops` exists and is meaningful in branch create/resize flows (`apps/studio/components/interfaces/Branch/NewBranchForm.tsx`, `ResizeBranchModal.tsx`) and slider limit construction (`apps/studio/data/resource-limits/branch-slider-resource-limits.ts`).

At the same time, an important part is already generic:

- Clone/restore operations are implemented using Kubernetes snapshot APIs (`deployment/kubernetes/snapshot.py`, `volume_clone.py`) and are not inherently tied to simplyblock, provided the underlying CSI backend supports required features.

## 2.1 Current implementation verification (as of 2026-03-03)

Storage abstraction is not yet implemented; current branch storage lifecycle is still simplyblock-oriented in runtime behavior.

Verified facts:

1. Branch provisioning uses per-branch StorageClass generation cloned from `simplyblock-csi-sc` and injects simplyblock-specific QoS parameters.
2. Runtime resize path for IOPS calls simplyblock API (`update_branch_volume_iops`) directly.
3. Resource usage collection derives IOPS from simplyblock stats API fields and falls back to schema-required numeric values.
4. Snapshot class selection for clone/restore and backup defaults is still hardcoded to simplyblock snapshot class names in multiple modules.
5. Data model and deployment parameters currently treat `iops` as required in key create/clone/resize paths.

Implication: rollout must start with an internal abstraction layer that preserves current behavior via a simplyblock adapter before introducing new backends.

## 3. Goals

1. Support self-hosted single-node storage backends (starting with ZFS/LVM via CSI) without requiring simplyblock.
2. Preserve branch create/clone/restore/backup UX parity where backend capabilities allow.
3. Make backend limitations explicit and visible in API and Studio.
4. Keep simplyblock as first-class backend with no regression.

## 4. Non-Goals

1. Replacing NeonVM autoscaling compute orchestration in this RFC.
2. Supporting non-Kubernetes deployments.
3. Guaranteeing identical QoS semantics across all backends.
4. Solving all metering parity gaps in first release (graceful degradation is acceptable).

## 5. Current-State Analysis

## 5.1 Strong coupling points in controller

- Backend-specific constants and credential loading in `deployment/__init__.py`:
  - simplyblock namespace/configmap/secret/storageclass names.
  - per-branch StorageClass cloning with simplyblock QoS parameters (`qos_rw_iops`, etc.).
- simplyblock API client in `deployment/simplyblock_api.py`, used for:
  - volume iostats collection.
  - runtime QoS updates (currently IOPS).
- Resource monitor (`api/resources.py`) depends on simplyblock volume UUID extraction and simplyblock iostats payload keys.
- Deployment and model contracts currently require `iops` (current QoS representation):
  - `DeploymentParameters.iops` is mandatory in `deployment/deployment.py`.
  - clone-from-source validation requires `iops` in branch API.
  - branch model and public schemas expose `iops` as required.

## 5.2 Existing generic strengths

- Snapshot workflows use K8s CRDs (`VolumeSnapshot`, `VolumeSnapshotContent`) and should work with any CSI driver that supports:
  - snapshots.
  - restore from snapshot.
  - PVC expand (already used for resize).

## 5.3 Studio assumptions

- Create/resize forms always include and submit IOPS.
- Slider limit hooks always build `iops` config from system/project limits.
- No capability endpoint exists to dynamically hide/disable unsupported controls.

## 6. High-Level Design

Introduce a pluggable storage backend interface in `vela-controller`.

```text
Branch lifecycle
  -> Branch API
     -> StorageBackend (selected by config)
        - classes/provisioning policy
        - snapshot class resolution
        - QoS update (optional)
        - usage collection (optional granular metrics)
```

### 6.1 Backend types (Kubernetes)

1. `simplyblock` (existing behavior, compatibility baseline).
2. `zfs` (first-class backend with capability mapping tuned for ZFS-based storage stacks).
3. `lvm` (first-class backend with capability mapping tuned for Linux LVM logical volume workflows).
4. `generic-csi` (optional fallback adapter with minimal guaranteed feature set, including btrfs filesystem-backed qcow2 fallback).

### 6.2 Capabilities model

Every backend reports capabilities:

- `supports_snapshots`: Can create point-in-time snapshots for managed volumes.
- `supports_snapshot_restore`: Can restore/provision a volume from a snapshot.
- `supports_volume_clone_cross_namespace`: Can clone/restore across Kubernetes namespaces.
- `supports_volume_expansion`: Can increase PVC capacity.
- `supports_iops_provisioning`: Can set IOPS limits at volume provisioning time.
- `supports_iops_runtime_update`: Can change IOPS limits after volume creation.
- `supports_usage_iops_metrics`: Can report observed IOPS usage metrics.
- `supports_usage_storage_metrics`: Can report observed used-bytes/storage usage metrics.
- `supports_file_storage_volume`: Can provision/manage the optional Storage API volume.
- `supports_dynamic_provisioning`: Can create volumes through StorageClass-driven dynamic provisioning.
- `supports_block_volume_mode`: Supports `volumeMode: Block` for NeonVM disks.
- `supports_rw_many`: Supports `ReadWriteMany` where required by current charts/flows.
- `supports_snapshot_content_rebind`: Can rebind/import snapshot content metadata for restore flows.
- `supports_pitr_wal_volume`: Supports a dedicated WAL volume path for PITR flows.
- `supports_delete_volume`: Supports safe backend-driven volume deletion.
- `supports_resize_online`: Supports resizing while workload is active (no power-off required).
- `supports_qos_profiles`: Supports structured QoS/performance profiles.
- `supports_qos_read_write_split`: Supports separate read vs write QoS limits.
- `supports_throughput_provisioning`: Can set throughput limits at provision time.
- `supports_throughput_runtime_update`: Can change throughput limits after creation.
- `supports_per_volume_capabilities`: Can report capabilities at per-volume granularity.
- `supports_per_volume_usage`: Can report usage metrics at per-volume granularity.
- `supports_storage_class_per_branch`: Supports per-branch StorageClass strategy.
- `supports_storage_class_shared`: Supports one shared StorageClass across branches.
- `supports_topology_awareness`: Can express topology/placement constraints (node/zone affinity).
- `supports_encrypted_volumes`: Supports backend volume encryption capabilities.
- `supports_consistency_group_snapshots`: Supports crash-consistent group snapshots across volumes.
- `supports_clone_without_snapshot`: Supports direct volume cloning without an explicit snapshot object.
- `supports_fast_clone`: Supports backend-native fast clone semantics (typically COW/metadata clone).
- `supports_backup_snapshot_labels`: Supports custom labels/metadata on backup snapshots.
- `supports_restore_size_discovery`: Can discover/validate restore size requirements from snapshot metadata.
- `supports_vm_live_migration`: Supports storage characteristics required for NeonVM live migration without storage relocation interruption.
- `supports_volume_relocation`: Supports backend-driven volume relocation/mobility workflows between nodes.

These capabilities drive:

- Controller behavior (enforce, no-op, or reject).
- Studio UX (show, hide, disable, or relabel controls).

## 7. Proposed Controller Changes

## 7.1 New storage backend interface

Add a backend module (example path: `src/deployment/storage_backends/`) with:

- `StorageBackend` protocol/base class.
- `SimplyblockBackend`.
- `ZfsBackend`.
- `LvmBackend`.
- `GenericCsiBackend` (minimal fallback).
- factory from settings.

Core methods (grouped by functionality):

Provisioning and lifecycle:

- `resolve_storage_class(branch_id, requested_qos: VolumeQosProfile | None) -> str`
- `provision_volume(branch_id, volume_kind, size_bytes, qos: VolumeQosProfile | None, use_existing=False) -> ProvisionedVolume`
- `resize_volume(branch_id, volume_kind, new_size_bytes) -> None`
- `delete_volume(branch_id, volume_kind) -> None`
- `relocate_volume(branch_id, volume_kind, target_node: str | None = None) -> None`

Snapshot and data movement:

- `resolve_snapshot_class() -> str`
- `snapshot_volume(namespace, pvc_name, label, backup_id) -> SnapshotDetails`
- `clone_volume_from_snapshot(source_branch_id, target_branch_id, database_size, pitr_enabled) -> None`
- `restore_volume_from_snapshot(source_branch_id, target_branch_id, snapshot_namespace, snapshot_name, snapshot_content_name, database_size) -> None`

Performance and QoS:

- `update_volume_performance(branch_id, volume_kind, qos: VolumeQosProfile) -> None` (optional; capability-gated)
- `validate_qos_profile(qos: VolumeQosProfile) -> None`

Capabilities and telemetry:

- `get_volume_capabilities(volume_kind) -> VolumeCapabilities`
- `get_volume_usage(branch_id, volume_kind) -> VolumeUsage | None`
- `collect_usage(branch, namespace) -> ResourceUsageDefinitionPartial`

Validation and operation gating:

- `validate_capabilities_for_operation(operation, params) -> None`

`ensure_branch_storage_class()` and runtime volume performance updates in `deployment/__init__.py` become backend-dispatched wrappers.

Snapshot/clone/restore should be invoked through backend operations rather than composing low-level snapshot calls in API handlers, so backend-specific behavior (class resolution, metadata handling, feature fallbacks) remains encapsulated.

`VolumeQosProfile` should be forward-compatible and allow:

- `max_read_iops`
- `max_write_iops`
- `max_read_write_iops`
- `max_read_mibps`
- `max_write_mibps`
- `max_read_write_mibps`

Backends that only support a subset (for example only combined IOPS and not throughput) can reject unsupported fields via `validate_qos_profile` and report capability flags accordingly.

Live migration note:

- If `supports_vm_live_migration=true`, NeonVM live migration can proceed without a storage relocation checkpoint flow.
- If `supports_vm_live_migration=false`, migration workflow must fallback to: checkpoint VM -> relocate volume -> resume VM.

## 7.2 Settings/config changes

Add deployment settings:

- `vela_storage_backend` (`simplyblock` | `zfs` | `lvm` | `generic-csi`): Selects the storage backend adapter implementation.
- `vela_storage_default_class`: Default Kubernetes `StorageClass` used for volume provisioning when no branch-specific override is required.
- `vela_storage_snapshot_class`: Default Kubernetes `VolumeSnapshotClass` used for backup/clone/restore snapshot operations.
- `vela_storage_qos_policy` (`strict` | `best_effort`): Defines whether unsupported QoS requests should fail fast (`strict`) or degrade according to backend support (`best_effort`).

Keep current simplyblock defaults when unset for backward compatibility.

## 7.3 Snapshot class de-hardcoding

Replace:

- `_VOLUME_SNAPSHOT_CLASS = "simplyblock-csi-snapshotclass"` in branch API.
- backup monitor/manual backup defaults.

With centralized backend-based resolution (single source of truth).

## 7.4 QoS contract changes

Phase 1 (minimal schema break):

- Keep DB/model `iops` field required as the current QoS baseline.
- For backends without runtime QoS support:
  - accept supported QoS fields in API as logical allocation where needed.
  - skip unsupported backend runtime updates (`no-op` with explicit capability status) unless `vela_storage_qos_policy=strict`.
  - avoid hard failure on unsupported update in `best_effort` mode.

Phase 2 (clean model):

- introduce explicit QoS schema fields (IOPS + throughput profile support).
- make `iops` optional at API/model level where backends do not support IOPS controls.
- migrate schema to nullable/structured QoS payloads where safe.

## 7.5 Metering changes

Current metering uses simplyblock iostats. For `zfs`/`lvm`/`generic-csi`:

- `nvme_bytes` and `storage_bytes`: attempt backend metric provider or fallback provider.
- performance usage (`iops`, throughput):
  - if unavailable, set value to `0` only when required by legacy schema and mark metric as unavailable in capability/status endpoint.

Add explicit metadata so clients can distinguish zero usage from unavailable usage.

## 7.6 API additions

Add endpoint:

- `GET /system/storage-capabilities` (or `${root_path}/system/storage-capabilities`)

Response includes:

- backend identity (`simplyblock`, `zfs`, `lvm`, `generic-csi`)
- capability booleans
- effective storage/snapshot class names
- optional warnings (for degraded metric support)

Also include capabilities in branch/public metadata responses for easy UI consumption.

Compatibility note:

- endpoint is additive; existing API consumers must continue functioning when capability metadata is absent during transition.

## 7.7 Helm/deployment changes

Replace hard defaults in chart values with configurable values from backend settings:

- `autoscalerVm.persistence.storageClassName`
- `pg_wal.persistence.storageClassName`
- `storage.persistence.storageClassName`

For `zfs`/`lvm` backends, backend adapters may enforce backend-specific class and QoS constraints.

For `generic-csi`, use one operator-provided class by default and do not synthesize per-branch StorageClass manifests unless explicitly enabled.

## 8. Proposed Studio Changes

## 8.1 Capability-aware UX

In Studio, fetch storage capabilities early (project/branch scope).

Use capabilities to:

- hide/disable QoS controls (IOPS/throughput) in create/resize when unsupported.
- stop treating IOPS as universally required in form validation.
- annotate storage behavior (for example: "QoS controls are unmanaged on this backend").

Hotspots:

- `apps/studio/components/interfaces/Branch/NewBranchForm.tsx`
- `apps/studio/components/interfaces/Branch/ResizeBranchModal.tsx`
- `apps/studio/data/resource-limits/branch-slider-resource-limits.ts`

Migration note:

- keep legacy UI behavior until capability endpoint is available; then progressively gate controls by reported capabilities.

## 8.2 Payload shape behavior

When QoS capabilities are partial/unsupported:

- do not require unsupported QoS fields in UI payloads.
- allow API to omit unsupported fields or send backend defaults according to policy.

When storage metrics unavailable:

- replace charts/labels dependent on backend QoS/performance usage with "Not available on this backend" states.

## 9. Single-Host Backend Strategy

## 9.1 Recommended phase-1 path: `zfs` and `lvm` first-class adapters

For single-host deployments, first-class adapters should target ZFS and Linux LVM environments directly (still Kubernetes + CSI based), with explicit capability mapping and validation per backend.

Minimum requirements:

1. dynamic provisioning
2. volume snapshots
3. snapshot restore
4. volume expansion
5. block volume mode compatible with NeonVM PVC usage

Rationale:

- Reuses existing clone/restore architecture.
- Avoids redesigning the current Kubernetes storage lifecycle.
- Lowest risk, fastest time to value.

`generic-csi` remains available as a fallback adapter for environments that are CSI-compatible but do not have dedicated backend adapters yet (including btrfs filesystem-backed deployments through qcow2 fallback mode).
`lvm` is expected to provide native block volumes and snapshots, while typically exposing a reduced QoS feature set versus simplyblock.

## 9.2 Filesystem-only backend fallback (degraded mode)

If a backend cannot provide native block PVCs (`supports_block_volume_mode=false`), a degraded fallback can be used:

1. provision a filesystem PVC.
2. create a `qcow2` virtual disk image file inside that filesystem.
3. attach the qcow2 image directly via QEMU in NeonVM (no loopback layer).

`qcow2` is the only supported image format for this fallback, because it is natively supported by QEMU and provides sparse/snapshot-friendly semantics expected for degraded operation.

This requirement applies only to fallback mode:

- first-class `zfs`/`lvm` backends should prefer native block mode.
- fallback adapters using qcow2-backed block fallback must use `qcow2`.

When fallback mode is active (`supports_block_volume_mode=false`), API responses should mark deployment mode as degraded so Studio and operators can surface performance/operational caveats.

## 10. Compatibility and Migration

## 10.1 Backward compatibility

- Default backend remains `simplyblock` if no new settings are provided.
- Existing clusters remain unchanged.
- Existing branch/backup snapshot metadata remains valid.

## 10.2 Forward migration

1. Ship abstraction with simplyblock adapter first (behavior parity).
2. Add `zfs` and `lvm` adapters with feature flags.
3. Keep/add `generic-csi` as minimal fallback adapter.
4. Enable capability endpoint and Studio conditional UX.
5. Gradually relax IOPS-only assumptions in API/schema toward structured QoS.
6. Introduce a `legacy-iops-compat` behavior mode during transition so unsupported backends can avoid hard failures while schema evolves.

## 11. Rollout Plan

Phase A:

- Introduce backend abstraction and simplyblock adapter.
- Move snapshot/storage class values to settings.
- No functional change.
- Add compatibility tests that assert full parity with current simplyblock behavior.

Phase B:

- Implement `zfs` and `lvm` backends.
- Keep `generic-csi` as minimal fallback backend.
- Support branch create/clone/restore/backup on non-simplyblock backends.
- Add capability endpoint.

Phase C:

- Studio capability-driven UX (hide/disable unsupported controls).
- Add clearer messaging for unavailable usage metrics.

Phase D:

- Optional schema evolution for structured QoS fields and nullable/non-required `iops`.

## 12. Testing Plan

1. Unit tests:
- backend interface contract tests.
- simplyblock adapter parity tests.
- zfs adapter behavior across full capability set.
- lvm adapter behavior across full capability set (including reduced/no QoS support paths).
- generic-csi fallback behavior when features are unsupported (including btrfs qcow2 fallback profile).

2. Integration tests on kind/k3s:
- create branch.
- clone with data.
- restore from backup snapshot.
- resize database/storage PVC.
- QoS update behavior (IOPS/throughput) for supported/unsupported backends.
- execute suite per backend profile (`simplyblock`, `zfs`, `lvm`, `generic-csi`) plus btrfs-on-generic-csi fallback profile.
- negative tests: unsupported capability operations must fail with explicit, actionable error payloads in `strict` policy.

3. Studio E2E:
- forms render correctly by capability matrix.
- payload generation excludes unsupported fields.
- resize behavior and user messaging.

4. Regression:
- existing simplyblock path must pass current branch lifecycle tests unchanged.

## 13. Risks and Mitigations

1. Risk: CSI implementations differ in snapshot semantics.
- Mitigation: strict capability checks + backend compatibility matrix + fail fast with actionable errors.

2. Risk: IOPS-only assumptions deeply embedded in API/schema and analytics.
- Mitigation: phased approach with temporary logical IOPS handling before structured QoS schema changes.

3. Risk: Metric parity gaps on non-simplyblock backends.
- Mitigation: explicit capability flags and "metric unavailable" surfaces instead of silent zeros.

4. Risk: Block device requirement from NeonVM may limit candidate drivers.
- Mitigation: document minimum storage backend requirements clearly for self-hosting guide.

## 14. Operational Requirements for Supported Backends

A backend is considered "Vela-compatible (phase 1)" if it provides:

1. Kubernetes StorageClass usable for PVC `volumeMode: Block`.
2. CSI snapshot support with `VolumeSnapshotClass`.
3. restore from snapshots into PVC.
4. PVC expansion.
5. predictable namespace-scoped object lifecycle under controller operations.

For first-class backend status (`zfs`, `lvm`), native block mode support is required (`supports_block_volume_mode=true`).
`qcow2`-backed block fallback is acceptable only for fallback adapters (for example `generic-csi`) and must be labeled as degraded mode.

Optional but preferred:

1. runtime QoS controls (IOPS/throughput).
2. per-volume usage and performance telemetry.
3. VM live migration support without storage checkpoint fallback.

## 15. Open Questions

1. Should `iops` become fully optional in API v1 once structured QoS fields exist, or remain required with backend defaults for compatibility?
2. For unsupported QoS backends, should branch resize return success with no-op semantics or reject only unsupported changed fields?
3. Do we want to gate branch cloning on `supports_volume_clone_cross_namespace`, or provide a slower fallback clone path?
4. What minimum backend telemetry is required for billing-grade metering in self-hosted mode?
5. Which Kubernetes CSI distributions/driver variants for ZFS and LVM will be listed as "tested/supported" in docs?
6. Which qcow2 fallback implementation constraints (size expansion, crash recovery, snapshot restore semantics) are acceptable for degraded fallback mode?
7. Which backends/drivers can satisfy NeonVM live migration requirements directly vs requiring checkpoint/relocate/resume fallback?

## 16. Concrete Code Change Map (Initial)

Controller:

- `vela-controller/src/deployment/__init__.py`
  - extract simplyblock-specific logic to backend adapter
  - remove hard-coded storage/snapshot assumptions from generic paths
- `vela-controller/src/deployment/simplyblock_api.py`
  - keep as simplyblock adapter dependency
- `vela-controller/src/api/organization/project/branch/__init__.py`
  - replace `_VOLUME_SNAPSHOT_CLASS` constant usage with backend-resolved value
  - make clone/restore flows capability-gated
- `vela-controller/src/api/backup.py`
- `vela-controller/src/api/backupmonitor.py`
  - use backend snapshot class resolver
- `vela-controller/src/api/resources.py`
  - route usage collection through backend metrics provider
- `vela-controller/src/deployment/settings.py`
  - add backend configuration fields
- `vela-controller/src/api/system.py`
  - expose storage capabilities endpoint

Studio:

- `apps/studio/components/interfaces/Branch/NewBranchForm.tsx`
- `apps/studio/components/interfaces/Branch/ResizeBranchModal.tsx`
- `apps/studio/data/resource-limits/branch-slider-resource-limits.ts`
  - consume capabilities and render conditional controls
- add new client query for storage capabilities endpoint

Terraform/Infra:

- `vela-terraform/addons/`
  - split storage backend addon wiring from simplyblock-only assumptions
  - add backend-selectable module path (`simplyblock`, `zfs`, `lvm`, `generic-csi` fallback profile)
- `vela-terraform/README.md`
  - document backend-specific prerequisites and tested combinations
- `vela-terraform/*tfvars*.example`
  - expose backend selection and required variables by backend profile

Additional required touchpoints:

- `vela-controller/src/deployment/deployment.py`
  - evolve mandatory `iops` contract to capability-aware handling (phased compatibility)
- `vela-controller/src/models/branch.py` and migrations
  - plan phased schema changes for structured/optional QoS fields

## 17. Decision

Adopt storage backend abstraction with first-class `zfs` and `lvm` backends (plus `generic-csi` fallback), and evolve Studio/Controller contracts to be capability-driven. This minimizes architecture churn while unlocking practical single-host deployments on Kubernetes CSI-backed storage stacks.

## Appendix 1. Proposed Storage Backend API (Python)

This appendix provides a typed API sketch aligned with section 7.1 and the capability model in section 6.2.

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

Identifier = str
VolumeKind = Literal["database", "storage", "wal"]
QosPolicy = Literal["strict", "best_effort"]


@dataclass(frozen=True)
class VolumeQosProfile:
    # IOPS
    max_read_iops: int | None = None
    max_write_iops: int | None = None
    max_read_write_iops: int | None = None
    # Throughput (MiB/s)
    max_read_mibps: int | None = None
    max_write_mibps: int | None = None
    max_read_write_mibps: int | None = None


@dataclass(frozen=True)
class SnapshotDetails:
    name: str
    namespace: str
    content_name: str | None
    size_bytes: int | None


@dataclass(frozen=True)
class ProvisionedVolume:
    namespace: str
    pvc_name: str
    storage_class: str
    size_bytes: int
    volume_kind: VolumeKind
    used_existing: bool = False


@dataclass(frozen=True)
class VolumeUsage:
    used_bytes: int | None = None
    read_iops: int | None = None
    write_iops: int | None = None
    read_mibps: float | None = None
    write_mibps: float | None = None


@dataclass(frozen=True)
class ResourceUsageDefinitionPartial:
    nvme_bytes: int | None = None
    storage_bytes: int | None = None
    iops: int | None = None
    throughput_mibps: float | None = None


@dataclass(frozen=True)
class VolumeCapabilities:
    # Core provisioning/snapshot
    supports_dynamic_provisioning: bool
    supports_block_volume_mode: bool
    supports_snapshots: bool
    supports_snapshot_restore: bool
    supports_volume_clone_cross_namespace: bool
    supports_volume_expansion: bool
    supports_resize_online: bool
    supports_snapshot_content_rebind: bool
    supports_pitr_wal_volume: bool
    supports_delete_volume: bool
    supports_file_storage_volume: bool
    supports_rw_many: bool
    supports_storage_class_per_branch: bool
    supports_storage_class_shared: bool
    supports_topology_awareness: bool
    supports_encrypted_volumes: bool
    supports_consistency_group_snapshots: bool
    supports_clone_without_snapshot: bool
    supports_fast_clone: bool
    supports_backup_snapshot_labels: bool
    supports_restore_size_discovery: bool
    supports_vm_live_migration: bool
    supports_volume_relocation: bool
    # QoS/perf
    supports_qos_profiles: bool
    supports_qos_read_write_split: bool
    supports_iops_provisioning: bool
    supports_iops_runtime_update: bool
    supports_throughput_provisioning: bool
    supports_throughput_runtime_update: bool
    # Telemetry
    supports_per_volume_capabilities: bool
    supports_per_volume_usage: bool
    supports_usage_iops_metrics: bool
    supports_usage_storage_metrics: bool


class StorageBackend(Protocol):
    name: str

    async def resolve_storage_class(
        self,
        branch_id: Identifier,
        requested_qos: VolumeQosProfile | None,
    ) -> str: ...

    async def resolve_snapshot_class(self) -> str: ...

    async def provision_volume(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
        size_bytes: int,
        qos: VolumeQosProfile | None,
        *,
        use_existing: bool = False,
    ) -> ProvisionedVolume: ...

    async def resize_volume(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
        new_size_bytes: int,
    ) -> None: ...

    async def delete_volume(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
    ) -> None: ...

    async def relocate_volume(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
        target_node: str | None = None,
    ) -> None: ...

    async def snapshot_volume(
        self,
        namespace: str,
        pvc_name: str,
        label: str,
        backup_id: Identifier,
    ) -> SnapshotDetails: ...

    async def clone_volume_from_snapshot(
        self,
        source_branch_id: Identifier,
        target_branch_id: Identifier,
        database_size: int,
        pitr_enabled: bool,
    ) -> None: ...

    async def restore_volume_from_snapshot(
        self,
        source_branch_id: Identifier,
        target_branch_id: Identifier,
        snapshot_namespace: str,
        snapshot_name: str,
        snapshot_content_name: str | None,
        database_size: int,
    ) -> None: ...

    async def update_volume_performance(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
        qos: VolumeQosProfile,
        *,
        policy: QosPolicy = "strict",
    ) -> None: ...

    def validate_qos_profile(self, qos: VolumeQosProfile) -> None: ...

    def get_volume_capabilities(self, volume_kind: VolumeKind) -> VolumeCapabilities: ...

    async def get_volume_usage(
        self,
        branch_id: Identifier,
        volume_kind: VolumeKind,
    ) -> VolumeUsage | None: ...

    async def collect_usage(
        self,
        branch: Any,
        namespace: str,
    ) -> ResourceUsageDefinitionPartial: ...

    def validate_capabilities_for_operation(
        self,
        operation: str,
        params: dict[str, Any],
    ) -> None: ...
```
