# RFC: Snapshot-Based Point-in-Time Recovery (PITR) for PostgreSQL in Vela

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-06
- Related RFCs:
  - `2026-03-02-self-hosted-storage-backend-abstraction.md`
  - `2026-03-03-capability-manifest-contract-for-terraform-and-preflight.md`
  - `2026-03-03-kubernetes-operator-installation-and-operations.md`

## 1. Summary

Introduce Vela PITR for PostgreSQL using storage snapshots plus WAL segment merge, without archive-restore-based recovery.

This model restores a branch to a requested timestamp by:

1. Restoring both `pgdata` and dedicated `wal` volumes from the latest snapshot at or before the target time.
2. Copying required WAL segment files from the current WAL volume (CPIT source) into the restored WAL volume.
3. Setting `snapshot_pitr_target_time` in `postgresql.conf`.
4. Starting PostgreSQL to perform native WAL replay until the requested time and consistency point.

## 2. Motivation

Archive-based PITR adds operational overhead (archive transport, retention coordination, restore command wiring, and object-store dependencies). Vela already has branch snapshots and dedicated WAL volume support, so PITR can be implemented with lower complexity and faster local restore paths by combining:

1. Snapshot restore for base state.
2. WAL segment merge from CPIT WAL volume.
3. PostgreSQL recovery to a precise timestamp.

## 2.1 Current implementation verification (as of 2026-03-06)

Verified repository facts relevant to this RFC:

1. Branch deployments already support PITR flagging and a dedicated WAL PVC (`pg_wal`) when PITR is enabled (`vela-controller/src/deployment/__init__.py`).
2. Branch clone path already clones `pgdata` and, when PITR is enabled, WAL volume in sequence (`vela-controller/src/deployment/kubernetes/volume_clone.py`).
3. Backup scheduling includes PITR-aware defaults (`ensure_branch_pitr_schedule`) (`vela-controller/src/api/_util/backups.py`).
4. A PostgreSQL prototype patch exists for snapshot PITR target-time configuration in:
   - `vela-os/prototype/boards/qemu-common/patches/postgresql/0001-atomic-storage-snapshot-point-in-time-recovery.patch`

Implication: prerequisites exist, but end-to-end snapshot-based PITR orchestration and contracts are not yet formalized in controller APIs/workflows.

## 3. Terminology and Time Model

Timeline model:

```text
----- T0 ----- T1 ----- T2 ------ T3 ------ T4 ----- CPIT
                     ^ PITR Target
                 ^ Restore Target                     ^ Additional WAL Segment Copy Source
                          ^ Additional WAL Segment Copy Source
```

Definitions:

1. `T(n)`: storage snapshot time.
2. `CPIT`: current point in time (current branch WAL volume state).
3. `PITR target`: requested recovery timestamp.
4. `Restore target snapshot`: latest snapshot where `snapshot_time <= PITR target`.
5. `Segment merge`: copying required WAL segment files from CPIT WAL volume into restored WAL volume.

## 4. Goals

1. Provide timestamp-based PITR for branch restore and clone flows using snapshots + WAL merge.
2. Avoid mandatory archive recovery infrastructure for PITR in Vela-managed branches.
3. Preserve deterministic, auditable recovery behavior with explicit validation gates.
4. Integrate PITR status and failure diagnostics into existing branch operation UX/APIs.

## 5. Non-Goals

1. Replacing PostgreSQL WAL semantics or implementing custom replay logic outside PostgreSQL.
2. Supporting PITR when branch storage backend lacks snapshot/restore/WAL-volume capabilities.
3. Implementing cross-region WAL shipping in this RFC.
4. Backporting to non-patched PostgreSQL builds that lack `snapshot_pitr_target_time`.

## 6. Scope

## 6.1 In scope

1. Branch restore/clone to a PITR timestamp using snapshot + WAL merge.
2. PITR preflight validation (snapshot availability, WAL continuity, target-time bounds).
3. Recovery bootstrap contract via `snapshot_pitr_target_time` in `postgresql.conf`.
4. Operational observability for PITR stages and outcomes.

## 6.2 Out of scope (initial)

1. Archive-command / restore-command PITR pipeline as primary path.
2. Automatic fallback to archive recovery when snapshot PITR fails.
3. Continuous WAL integrity attestation service (beyond operation-time checks).

## 7. Functional Design

## 7.1 Branch storage requirements

A PITR-enabled branch MUST have at least:

1. Data volume: mounted at `/var/lib/postgresql/data`.
2. WAL volume: mounted at `/var/lib/postgresql/wal`.

Both volumes participate in snapshot restore for PITR operations.

## 7.2 Snapshot semantics

1. Snapshots are reverse copy-on-write snapshots.
2. PITR target may be any time between:
   - two snapshots (`Tn < target < Tn+1`), or
   - latest snapshot and CPIT (`Tn < target <= CPIT`).

## 7.3 WAL availability assumption

All WAL segments from `T0` through `CPIT` are available on the CPIT WAL volume. PITR preflight MUST fail if this continuity assumption cannot be verified.

## 7.4 PITR restore algorithm

Given `pitr_target_time`:

1. Resolve restore snapshot `Tr` = latest snapshot with `Tr <= pitr_target_time`.
2. Restore data and WAL volumes from `Tr`.
3. Perform WAL segment merge from CPIT WAL volume into restored WAL volume:
   - copy last segment file on restored WAL volume (to handle truncated tail),
   - copy all additional WAL segment files with file creation timestamp `< pitr_target_time`,
   - enforce deterministic segment ordering (timestamp + WAL segment order/timeline order).
4. Validate copied WAL segment files using MD5 checksum comparison (source CPIT WAL file vs copied file).
5. Ensure copied WAL files are durable (`fsync` and directory sync) before DB start.
6. Set `snapshot_pitr_target_time='<pitr_target_time>'` in `postgresql.conf`.
7. Start PostgreSQL.
8. Wait for recovery completion signals:
   - target time reached,
   - consistency reached,
   - end-of-recovery checkpoint complete.
9. Mark operation successful only after PostgreSQL reports readiness.

## 7.5 Recovery modes (GA)

GA includes both PITR execution modes:

1. New-branch recovery:
   - use snapshot-restore + WAL merge flow from section 7.4 for a new target branch.
2. In-place recovery:
   - stop the branch VM,
   - delete current data volume,
   - clone new data volume from snapshot at `T(n) <= target_time`,
   - clone new WAL volume from snapshot at `T(n) <= target_time`,
   - copy required WAL segments from current WAL volume,
   - delete current WAL volume after successful copy+verification,
   - update VM spec to attach restored/merged data and WAL volumes,
   - start VM with snapshot-based PITR enabled.

## 7.6 PostgreSQL behavior contract

When `snapshot_pitr_target_time` is set:

1. PostgreSQL enters point-in-time recovery mode using local WAL files.
2. Recovery stops at/after target according to PostgreSQL recovery semantics and consistency rules.
3. PostgreSQL promotes to a new timeline at end of recovery.

The controller MUST treat PostgreSQL logs and readiness as source-of-truth for PITR completion.

## 8. API and Controller Contract

## 8.1 API additions

Add PITR fields to branch restore/clone operation request contracts:

1. `pitr.target_time` (required for PITR restore path).
2. `pitr.source_branch_id` (optional, default: same branch as restore source).
3. `pitr.mode`: `new_branch|in_place`.
4. `pitr.enabled` (derived from branch capability but exposed in operation status).

## 8.2 Operation phases

Expose explicit PITR phases:

1. `SelectSnapshot`
2. `RestoreVolumes`
3. `MergeWalSegments`
4. `ConfigureRecoveryTarget`
5. `StartPostgresRecovery`
6. `AwaitConsistencyAndPromotion`
7. `Completed|Failed`

## 8.3 Idempotency and retries

1. PITR operation state MUST be persisted so retries resume from the last completed phase.
2. WAL merge phase MUST be safe to retry (copy-if-missing or checksum/size verify then overwrite atomically).
3. If restore has already started PostgreSQL with target time, retries MUST verify live phase before reapplying configs.

## 9. Validation and Failure Modes

## 9.1 Preflight checks

1. `pitr.target_time` is valid RFC3339 timestamp with timezone.
2. `oldest_snapshot_time <= target_time <= now`.
3. Snapshot `Tr` exists for `target_time`.
4. PITR-compatible storage capabilities are enabled:
   - snapshots,
   - snapshot restore/clone,
   - dedicated WAL volume support.
5. WAL continuity from `Tr` to `target_time` is satisfiable from CPIT WAL volume.
6. In `in_place` mode: VM can be cleanly stopped and volume detach/replace operations are permitted.

## 9.2 Hard failures

1. No snapshot before target time.
2. Required WAL segment missing/corrupt during merge or MD5 mismatch after copy.
3. PostgreSQL fails to enter or complete PITR.
4. Recovery overshoots target unexpectedly without reaching consistency.

Failures MUST surface actionable diagnostics with failing phase and last observed PostgreSQL recovery log line.

## 10. Observability

## 10.1 Metrics

1. `vela_pitr_operations_total{result}`
2. `vela_pitr_duration_seconds`
3. `vela_pitr_wal_segments_copied_total`
4. `vela_pitr_wal_bytes_copied_total`
5. `vela_pitr_preflight_failures_total{reason}`

## 10.2 Logs and events

Record:

1. selected restore snapshot timestamp and identifiers.
2. WAL merge source range and copied segment count.
3. configured `snapshot_pitr_target_time`.
4. PostgreSQL recovery milestones (target reached, consistency reached, recovery complete).

## 11. Security and Safety

1. PITR operations MUST run with least privilege for volume snapshot/restore and PVC access.
2. WAL merge process MUST not expose WAL contents in logs.
3. Recovery target timestamp and operation metadata MUST be audit logged.
4. Operation MUST avoid mutating source CPIT WAL volume.

## 12. Testing Strategy

1. Unit tests:
   - snapshot selection for target timestamp,
   - WAL segment filter logic (timestamp + segment order),
   - MD5 checksum verification behavior,
   - phase transition/idempotency behavior.
2. Integration tests:
   - dual-volume restore and WAL merge with synthetic WAL files,
   - in-place mode volume swap workflow,
   - preflight failure scenarios (missing snapshot, missing WAL segment).
3. E2E tests:
   - recover to timestamp between snapshots,
   - recover to timestamp between latest snapshot and CPIT,
   - verify recovered row-set matches target cut and excludes later writes.

## 13. Rollout Plan

Phase A:

1. Add API contract and internal operation phases.
2. Implement preflight and snapshot selection.
3. Implement WAL merge and recovery config injection.

Phase B:

1. Add metrics/events and richer diagnostics.
2. Add E2E coverage for snapshot-based PITR scenarios.
3. Enable for supported storage backends behind feature flag.

Phase C:

1. Default-on for eligible PITR-enabled branches.
2. GA with both `new_branch` and `in_place` recovery modes.
3. Deprecate archive-first assumptions in branch PITR workflows.

## 14. WAL Retention Strategy Options (CPIT -> T0)

PITR requires preserving WAL segments on CPIT WAL volume long enough to satisfy requested targets. Candidate approaches:

1. PostgreSQL parameter-only retention (`wal_keep_size` and checkpoint/WAL sizing).
   - Pros: minimal changes.
   - Cons: size-based, not strictly time-window deterministic; risk of segment recycling under write spikes.
2. Archive-command for retention only (not archive restore).
   - Use `archive_command` to copy completed WAL files to a durable local/cluster volume managed by Vela, while keeping snapshot-based recovery path.
   - Pros: robust WAL preservation with existing PostgreSQL hooks; no custom WAL parser required.
   - Cons: introduces archive pipeline management even if restore does not use it.
3. Archive-command failure pinning (`exit 1`) to keep WAL files in `pg_wal`.
   - Configure `archive_command` to intentionally fail so PostgreSQL retains WAL segments locally and retries archiving.
   - Pros: very simple mechanism; no additional copy pipeline required initially.
   - Cons: operationally risky; can cause unbounded WAL growth and eventual WAL-volume exhaustion, impacting writes/availability.
   - Recommendation: allowed only as short-lived emergency/debug mode with strict guardrails and alerting, not as default production strategy.
4. Vela WAL retention sidecar/service.
   - Continuously copies WAL segment files from active WAL volume into managed retention storage with metadata index.
   - Pros: Vela-controlled lifecycle and observability.
   - Cons: more moving parts; must avoid races with PostgreSQL segment rotation.
5. PostgreSQL extension/patch-level deeper integration (for example custom resource manager paths).
   - Pros: tight control and potentially better selection semantics.
   - Cons: highest complexity and maintenance risk; not recommended for v1.
6. Future optimization: `pg_waldump`-assisted target introspection.
   - Use `pg_waldump` in later phases to inspect commit boundaries and provide cleaner target/segment selection UX.
   - Timestamp + segment-order selection remains the faster default path for v1.

## 15. Example Recovery Signals

Expected PostgreSQL logs include:

1. `snapshot point-in-time target time requested: ...`
2. `starting point-in-time recovery to ...`
3. `consistent recovery state reached ...`
4. `reached point-in-time target time: ...`
5. `... recovery complete`

Example target config:

```conf
snapshot_pitr_target_time='2026-01-09 14:18:00.367636+00'
```

## 16. Open Questions

1. Which WAL retention strategy from section 14 should be the v1 default for guaranteeing CPIT->T0 continuity?
2. What minimum guaranteed PITR window must Vela enforce per service tier/profile?
3. API/Studio should eventually provide available recovery timestamps for selection; should this be powered by `pg_waldump`-based introspection, WAL metadata indexing, or a hybrid approach?

## 17. Decision

Adopt snapshot-based PostgreSQL PITR for Vela branches using dual-volume restore (`pgdata` + `wal`), WAL segment merge from CPIT WAL volume, and PostgreSQL recovery driven by `snapshot_pitr_target_time`, as the default PITR architecture for supported storage backends.
