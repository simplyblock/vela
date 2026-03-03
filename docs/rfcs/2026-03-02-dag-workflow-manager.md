# RFC: Generic DAG Workflow Manager for Dynamic Controller Operations

- Status: Draft
- Target release: Phased

## 1. Summary

Introduce a generic directed acyclic graph (DAG) workflow manager in `vela-controller` to orchestrate complex operations
as composable task graphs.

Reference use case: branch creation workflows with dynamic paths:

- new branch from scratch
- clone from existing branch
- create and rewind/restore from snapshot

Each path should add/remove tasks dynamically while preserving deterministic execution, retries, compensation, and
observability.

Branch creation is only one example workflow and not the full scope of this RFC.

## 2. Motivation

Current orchestration logic for multiple controller operations is hard to evolve because flows are encoded as imperative
sequences. As variants grow (storage backend differences, snapshot modes, DNS/gateway modes, preflight gates, upgrade
gates), code becomes brittle and hard to reason about.

A DAG manager provides:

- reusable task primitives
- declarative dependency graphs
- dynamic composition per request/context
- better error handling and partial rollback behavior

Code-aligned gap observed in current branch lifecycle implementation:

- `branch.create` commits DB/Keycloak state and then launches one of several `asyncio.create_task(...)` background
  paths.
- the HTTP API returns `201` immediately while deployment/clone/restore proceeds out-of-band.
- workflow progress, retry policy, and compensation are currently distributed across multiple modules rather than
  modeled
  as one persisted execution graph.

## 3. Goals

1. Provide a generic DAG execution engine for controller operations.
2. Support dynamic graph composition based on request input and runtime capabilities.
3. Ensure idempotent, resumable execution with persistent workflow state.
4. Enable concurrency for independent tasks.
5. Standardize retries, backoff, and compensation semantics.
6. Expose workflow progress/events for API and Studio.

## 4. Non-Goals

1. Replacing Kubernetes-native controllers/operators.
2. Building a distributed multi-cluster workflow platform in v1.
3. Arbitrary cyclic or long-running human-approval BPMN flows.

## 5. Core Concepts

## 5.1 Workflow

A workflow is a named, versioned DAG template instantiated with input context.

## 5.2 Task node

A task node defines:

- `task_id`
- `task_type`
- inputs (resolved from workflow context)
- dependencies (`depends_on`)
- retry policy
- optional compensation task reference

## 5.3 Execution states

- workflow: `pending|running|succeeded|failed|cancelling|cancelled`
- task: `pending|ready|running|succeeded|failed|skipped|compensated`

## 5.4 Dynamic composition

A workflow builder can conditionally include nodes/edges based on:

- API payload (new vs clone vs snapshot rewind)
- capabilities (storage, gateway, DNS)
- policy flags (`strict|best_effort`)

## 5.5 Workflow context and dataflow contract

Tasks communicate through a persisted `workflow_context`.

Context structure (conceptual):

- `payload`: immutable request input
- `runtime`: immutable runtime/capability snapshot
- `tasks.<task_id>.output`: structured output produced by each task
- `system`: engine metadata (attempt counters, timestamps, trace IDs)

Rules:

1. Tasks can read `payload`, `runtime`, and declared upstream task outputs.
2. Tasks can only write under their own namespace: `tasks.<current_task_id>.output`.
3. Tasks must not mutate other task outputs.
4. Output collisions are impossible by namespace design; task retries overwrite only the same task output.
5. Sensitive values in context are stored redacted/encrypted or as references.

Input declaration:

- each task declares required input references (for example `tasks.provision_storage.output.pvc_name`)
- engine resolves references before execution and fails task as configuration error if missing

This contract enables deterministic replay/resume and explicit task dependency/dataflow validation.

## 6. Branch Create Reference Design

This section is intentionally illustrative, not exhaustive.

## 6.0 Current code-path inventory (branch lifecycle)

The current codebase already exposes multiple branch-related workflows that should be DAG candidates:

1. Branch create (new deployment, clone, restore-from-backup) in `src/api/organization/project/branch/__init__.py`.
2. Branch delete in `src/api/organization/project/branch/__init__.py` and `src/deployment/__init__.py`.
3. Branch resize (compute/storage/iops + resource limit checks) in `src/api/organization/project/branch/__init__.py`.
4. Branch control actions (`pause`, `resume`, `start`, `stop`) in `src/api/organization/project/branch/__init__.py`.
5. Branch data-plane clone/restore primitives in `src/deployment/kubernetes/volume_clone.py`.
6. Branch status/health convergence loops in `src/api/resources.py` and branch status refresh helpers.
7. Backup schedule execution/retention workflows in `src/api/backupmonitor.py`.

These existing operations provide concrete task boundaries, retries/timeouts, and compensation behavior that the DAG
engine should formalize.

## 6.1 Base task set

Common example tasks:

1. `validate_request`
2. `resolve_source`
3. `create_branch_record`
4. `allocate_resources`
5. `provision_storage`
6. `deploy_runtime`
7. `configure_endpoints`
8. `finalize_branch_status`

Code-aligned create task decomposition (current behavior mapped to DAG nodes):

1. `validate_create_request`
2. `resolve_source_or_backup`
3. `derive_clone_parameters`
4. `check_resource_limits`
5. `build_branch_entity_and_secrets`
6. `create_keycloak_realm`
7. `create_keycloak_client`
8. `commit_branch_record`
9. `copy_backup_schedules` (conditional: clone/restore with `copy_config`)
10. `clone_role_assignments` (conditional: clone/restore with `copy_config`)
11. `create_or_update_branch_provisioning`
12. `schedule_environment_workflow` (transitional adapter; replaced by direct DAG submission in later phase)

## 6.2 Path variants

### A) New branch

Include:

- `initialize_data_plane`
- `seed_baseline`

Exclude:

- clone/snapshot restore tasks

### B) Clone from existing branch

Include:

- `prepare_clone_source`
- `clone_storage_from_source`
- `copy_branch_config` (optional)
- `deploy_runtime_using_existing_pvc`

### C) Rewind/restore from snapshot

Include:

- `validate_snapshot`
- `restore_storage_from_snapshot`
- `reconcile_post_restore_config`
- `deploy_runtime_using_restored_pvc`

Implementation-specific notes:

1. Clone path is itself conditional on `copy_data`; when `false`, storage clone nodes are skipped but source-derived
   parameter/config copy nodes may still run.
2. Restore path consumes persisted backup metadata (`snapshot_namespace`, `snapshot_name`, optional
   `snapshot_content_name`) and should treat missing snapshot metadata as deterministic preflight failure.
3. Both clone and restore eventually converge into the same deployment endpoint/grafana provisioning stages.

## 6.3 Conditional tasks

Examples:

- DNS task only when DNS manager is not `disabled`
- gateway public route task only when endpoint exposure is public
- QoS update task only if storage backend capability supports runtime QoS

Observed conditionality in current code that should be explicit in the graph:

- `ensure_branch_storage_class` and IOPS/storage-class operations only when storage backend requires explicit class
  management.
- volume-clone and snapshot-restore nodes only when `copy_data`/`restore` path requires PVC reuse.
- backup schedule and role-assignment cloning only when config copy is enabled.
- DNS tasks only when DNS manager is enabled; deployment endpoint tasks are always present.

## 6.4 Other workflow families (non-exhaustive)

Potential workflows to model with the same DAG engine:

- branch delete/deprovision
- branch resize (compute/storage/QoS)
- backup create/restore/pitr-prepare
- endpoint exposure transitions (internal-only -> public)
- install preflight orchestration
- upgrade preflight and compatibility gating
- secrets bootstrap and rotation orchestrations

Branch lifecycle workflows to prioritize next (code-driven order):

1. `branch.delete`: set deleting status, delete deployment, delete Keycloak realm, delete provisioning rows, prune
   backups, delete branch row.
2. `branch.resize`: validate no storage shrink, compute effective delta, enforce org/project limits, apply per-resource
   operations, update resize status map, transition branch status.
3. `branch.control`: set transitional status, set autoscaler VM power state, converge to final status or error.
4. `branch.pgbouncer.update`: config-map update, runtime command apply, DB persistence.
5. `branch.reset_password`: rotate DB password and persist.

## 6.5 Dynamic graph construction proposal

The workflow is assembled at request time by a `WorkflowBuilder` that evaluates:

- request payload (`new`, `clone`, `restore`)
- runtime capability context (storage, dns, gateway, qos)
- policy flags (`strict|best_effort`)

### 6.5.1 Builder algorithm (conceptual)

1. Start with a minimal base graph (validate, create branch record, finalize).
2. Add one mutually exclusive data-path subgraph:

- `new` -> initialize + seed
- `clone` -> prepare source + clone + optional config copy
- `restore` -> validate snapshot + restore + reconcile

3. Add orthogonal feature subgraphs conditionally:

- endpoint tasks (always internal; public if exposure enabled)
- DNS tasks (if dns manager is not `disabled`)
- QoS tuning task (if backend capability supports runtime QoS)

4. Add edges to preserve ordering and maximize parallelism for independent nodes.
5. Validate DAG (`acyclic`, all dependencies resolvable, required capabilities satisfied).
6. Persist resolved graph snapshot before execution.

### 6.5.2 Python-style composition example

```python
def build_branch_create(payload: dict, runtime: RuntimeCtx) -> WorkflowGraph:
    g = GraphBuilder("branch.create", version="v1")

    # Base skeleton
    g.add("validate_request")
    g.add("create_branch_record", after=["validate_request"])
    g.add("allocate_resources", after=["create_branch_record"])

    # Mutually exclusive data path
    mode = payload.get("source_mode", "new")  # new | clone | restore
    if mode == "new":
        g.add("initialize_data_plane", after=["allocate_resources"])
        g.add("seed_baseline", after=["initialize_data_plane"])
        data_tail = "seed_baseline"
    elif mode == "clone":
        g.add("prepare_clone_source", after=["allocate_resources"])
        g.add("clone_storage_from_source", after=["prepare_clone_source"])
        if payload.get("copy_config", False):
            g.add("copy_branch_config", after=["clone_storage_from_source"])
            data_tail = "copy_branch_config"
        else:
            data_tail = "clone_storage_from_source"
    elif mode == "restore":
        g.add("validate_snapshot", after=["allocate_resources"])
        g.add("restore_storage_from_snapshot", after=["validate_snapshot"])
        g.add("reconcile_post_restore_config", after=["restore_storage_from_snapshot"])
        data_tail = "reconcile_post_restore_config"
    else:
        raise ValueError(f"unsupported source_mode: {mode}")

    # Core runtime deployment
    g.add("deploy_runtime", after=[data_tail])
    g.add("configure_internal_endpoints", after=["deploy_runtime"])

    # Conditional feature tasks
    if runtime.endpoint_exposure_mode == "public_enabled":
        g.add("configure_public_routes", after=["deploy_runtime"])
        if runtime.dns_manager != "disabled":
            g.add("create_branch_dns_records", after=["configure_public_routes"])

    if runtime.storage_caps.supports_iops_runtime_update and payload.get("qos") is not None:
        g.add("apply_qos_profile", after=["deploy_runtime"])

    # Join and finalize
    finalize_deps = ["configure_internal_endpoints"]
    if g.has("create_branch_dns_records"):
        finalize_deps.append("create_branch_dns_records")
    if g.has("apply_qos_profile"):
        finalize_deps.append("apply_qos_profile")

    g.add("finalize_branch_status", after=finalize_deps)
    return g.validate_and_build()
```

### 6.5.3 Example resolved graph snapshot (restore + public + DNS)

```text
validate_request
  -> create_branch_record
  -> allocate_resources
  -> validate_snapshot
  -> restore_storage_from_snapshot
  -> reconcile_post_restore_config
  -> deploy_runtime
  -> configure_internal_endpoints
  -> configure_public_routes
  -> create_branch_dns_records
  -> finalize_branch_status
```

In the same system, a `new` branch with internal-only exposure would produce a smaller graph without snapshot, public
route, or DNS nodes.

## 6.6 Code-aligned task catalogs for additional branch workflows

### 6.6.1 `branch.create` runtime deployment subgraph

Current `deploy_branch_environment(...)` behavior should be represented as:

1. `ensure_branch_namespace`
2. parallel fan-out:
    - `create_vela_config`
    - `provision_branch_endpoints`
    - `create_grafana_object` (non-critical by default policy)
3. `finalize_create_status`

Failure rules to preserve:

- failure in config or endpoint provisioning fails the workflow.
- grafana creation failure is logged and surfaced as warning unless policy is `strict`.

### 6.6.2 `branch.clone` and `branch.restore` storage subgraphs

`volume_clone.py` provides concrete internal steps for clone/restore and existing compensation behavior:

1. `clear_previous_snapshot_artifacts`
2. clone path:
    - `capture_source_snapshot`
    - `extract_snapshot_material`
3. restore path:
    - `load_existing_snapshot_material`
4. shared:
    - `materialize_target_snapshot_content`
    - `materialize_target_snapshot`
    - `recreate_target_pvc_from_snapshot`
5. `cleanup_temporary_snapshots_on_success_or_failure`

These nodes should carry explicit timeout/poll parameters now hardcoded in the branch module.

### 6.6.3 `branch.delete` canonical graph

Current deletion flow maps to:

1. `set_branch_status_deleting`
2. `delete_branch_deployment`
3. `delete_keycloak_realm` (404 tolerated)
4. `delete_branch_provisioning_rows`
5. `delete_branch_backups_and_snapshot_metadata`
6. `delete_branch_record`
7. `commit_delete`

### 6.6.4 `branch.resize` canonical graph

Current resize flow should be normalized into deterministic tasks:

1. `validate_resize_request` (including no-shrink guard for storage)
2. `compute_effective_resize_delta`
3. `check_resize_resource_limits`
4. conditional infra tasks:
    - `resize_database_pvc`
    - `resize_storage_pvc`
    - `update_volume_iops`
    - `resize_autoscaler_vm_cpu_memory`
5. `update_provisioning_snapshots`
6. `update_resize_status_map`
7. `set_branch_status_resizing`

### 6.6.5 `branch.control` canonical graph

`pause|resume|start|stop` currently perform:

1. `set_transition_status`
2. `set_autoscaler_power_state`
3. `set_final_status` (or `set_error_status` on failure)

This should become a single parameterized workflow type `branch.control(action)`.

### 6.6.6 Background reconciliation workflows

The following recurring processes should be modeled as scheduled DAG runs or idempotent workflow jobs:

1. `branch.status.refresh`: derive lifecycle state from service health with stuck-state grace handling.
2. `branch.backup.monitor`: ensure next backups, execute due snapshots, enforce retention/global max backups.
3. `resource.monitor`: periodic capacity/status refresh interactions that currently call branch status refresh.

## 7. Architecture

## 7.1 Components

- `WorkflowRegistry`: registers workflow templates/builders by name+version.
- `WorkflowBuilder`: constructs DAG from request and runtime context.
- `WorkflowEngine`: schedules and executes runnable tasks.
- `TaskExecutorRegistry`: maps task types to executor implementations.
- `WorkflowStore`: persists workflow/task state and outputs.
- `EventPublisher`: emits workflow/task lifecycle events.
- `OperationAdapter`: transitional wrapper that maps existing imperative entry points to DAG submissions and status
  updates.

## 7.2 Persistence

Persist at minimum:

- workflow metadata (id, type, version, input hash)
- DAG structure snapshot (nodes + edges)
- task attempts/results/errors
- output context and final status

Persistence is required for recovery/resume after controller restart.

## 7.3 Scheduling model

- topological readiness evaluation
- bounded parallel execution for independent nodes
- per-task concurrency controls where needed

## 8. Execution Semantics

## 8.1 Idempotency

All task executors must be idempotent. Retries must not create duplicate side effects.

## 8.2 Retries

Per-task retry policy:

- max attempts
- exponential backoff + jitter
- retryable error classification

## 8.3 Compensation

For tasks with side effects, optional compensation actions should be defined.

Compensation is best-effort and policy-driven:

- `strict`: fail workflow if compensation-critical action cannot be completed
- `best_effort`: mark compensation warning and continue cleanup

## 8.4 Resume and replay

Engine should resume unfinished workflows from persisted state without rerunning successful idempotent tasks
unnecessarily.

## 8.5 Commit boundaries and compensation classes

For `branch.create`, the current implementation has a hard commit boundary (branch row + Keycloak objects) before
environment provisioning. DAG execution should preserve this boundary explicitly:

1. `pre_commit` segment: validation, source/backup resolution, limits.
2. `commit` segment: branch persistence and identity/bootstrap side effects.
3. `post_commit` segment: infra provisioning and endpoint publication.

Compensation classes:

1. `reversible_infra`: namespace/snapshot/PVC/DNS/gateway/grafana resources, compensated with best-effort cleanup.
2. `identity_plane`: Keycloak realm/client operations, compensated by delete-on-failure semantics when possible.
3. `persistent_metadata`: branch/provisioning/backups rows, compensated by transactional rollback pre-commit and
   explicit delete tasks post-commit.

Failure policy should encode current tolerant behavior:

- missing/not-found cleanup targets during compensation are non-fatal and recorded as warnings.
- failures in non-critical side effects (for example grafana object creation) are recorded but do not necessarily fail
  the full workflow unless policy is `strict`.

## 9. API Changes

## 9.1 Workflow introspection

Add endpoints:

- `POST /workflows/{workflow_type}` (optional direct trigger for internal/admin use)
- `GET /workflows/{workflow_id}`
- `GET /workflows/{workflow_id}/tasks`
- `POST /workflows/{workflow_id}/cancel`

Branch APIs can return `workflow_id` for async operations.

## 9.2 Branch create API behavior

`POST /organizations/{org}/projects/{project}/branches` may:

- compatibility mode returning `201` + `Location` while async workflow continues (current behavior parity)
- async-first mode returning `202` + `workflow_id`

The response should include `workflow_id` in both modes once DAG execution is enabled, allowing clients to transition
without breaking existing assumptions.

## 10. Data Model (Proposed)

PostgreSQL is the only workflow store for v1. The schema is normalized for scheduler efficiency and JSONB-backed
payload/context flexibility.

## 10.1 PostgreSQL schema (v1)

```sql
CREATE TYPE workflow_state AS ENUM (
  'pending', 'running', 'succeeded', 'failed', 'cancelling', 'cancelled'
);

CREATE TYPE task_state AS ENUM (
  'pending', 'ready', 'running', 'succeeded', 'failed', 'skipped', 'compensated'
);

CREATE TABLE workflow_runs
(
    id               CHAR(26) PRIMARY KEY,                          -- ULID
    workflow_type    TEXT           NOT NULL,                       -- e.g. "branch.create"
    workflow_version TEXT           NOT NULL,                       -- e.g. "v1"
    operation_kind   TEXT           NOT NULL,                       -- e.g. "branch.delete"
    state            workflow_state NOT NULL DEFAULT 'pending',
    organization_id  CHAR(26)       NOT NULL,
    project_id       CHAR(26)       NOT NULL,
    branch_id        CHAR(26),                                      -- nullable for pre-create or cross-branch flows
    policy_mode      TEXT           NOT NULL DEFAULT 'best_effort', -- strict|best_effort
    input            JSONB          NOT NULL,                       -- immutable request payload snapshot
    runtime          JSONB          NOT NULL,                       -- immutable capability/runtime snapshot
    context          JSONB          NOT NULL DEFAULT '{}'::jsonb,   -- mutable task output tree
    dag              JSONB          NOT NULL,                       -- resolved DAG snapshot (nodes/edges)
    input_hash       BYTEA          NOT NULL,                       -- dedupe/idempotency key material
    trace_id         TEXT,
    error            JSONB,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT workflow_runs_state_timestamps_ck CHECK (
        (state IN ('pending', 'running') AND finished_at IS NULL)
            OR (state IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL)
            OR state = 'cancelling'
        )
);

CREATE TABLE workflow_tasks
(
    id              BIGSERIAL PRIMARY KEY,
    workflow_id     CHAR(26)    NOT NULL REFERENCES workflow_runs (id) ON DELETE CASCADE,
    task_id         TEXT        NOT NULL,                     -- stable node id inside DAG
    task_type       TEXT        NOT NULL,                     -- executor registry key
    state           task_state  NOT NULL DEFAULT 'pending',
    attempt         INT         NOT NULL DEFAULT 0,
    max_attempts    INT         NOT NULL DEFAULT 3,
    depends_on      JSONB       NOT NULL DEFAULT '[]'::jsonb, -- array of task_ids
    input_refs      JSONB       NOT NULL DEFAULT '[]'::jsonb, -- array of context refs
    last_error      JSONB,
    output          JSONB,
    queued_at       TIMESTAMPTZ,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT workflow_tasks_unique_task UNIQUE (workflow_id, task_id),
    CONSTRAINT workflow_tasks_attempt_bounds_ck CHECK (attempt >= 0 AND max_attempts > 0),
    CONSTRAINT workflow_tasks_retry_window_ck CHECK (
        (state = 'failed' AND next_attempt_at IS NOT NULL AND attempt < max_attempts)
            OR (state <> 'failed')
            OR (state = 'failed' AND attempt >= max_attempts)
        )
);
```

## 10.2 Required indexes and scheduling pattern

```sql
CREATE INDEX workflow_runs_state_idx
    ON workflow_runs (state, updated_at DESC);

CREATE INDEX workflow_runs_scope_idx
    ON workflow_runs (organization_id, project_id, branch_id, created_at DESC);

CREATE UNIQUE INDEX workflow_runs_idempotency_idx
    ON workflow_runs (workflow_type, workflow_version, input_hash) WHERE state IN ('pending', 'running');

CREATE INDEX workflow_tasks_scheduler_idx
    ON workflow_tasks (state, next_attempt_at, queued_at) WHERE state IN ('ready', 'failed');

CREATE INDEX workflow_tasks_workflow_state_idx
    ON workflow_tasks (workflow_id, state, task_id);

CREATE INDEX workflow_runs_context_gin_idx
    ON workflow_runs USING GIN (context jsonb_path_ops);
```

Scheduler workers should dequeue with `FOR UPDATE SKIP LOCKED` against `workflow_tasks` to allow safe concurrent
pollers without double execution.

## 10.3 Context snapshot contract (JSONB in `workflow_runs.context`)

Persisted context fields:

- `payload` (immutable)
- `runtime` (immutable)
- `tasks` (per-task outputs + status metadata)
- `system` (engine metadata)

Example:

```json
{
  "payload": {
    "source_mode": "clone",
    "copy_config": true
  },
  "runtime": {
    "dns_manager": "cloudflare"
  },
  "tasks": {
    "resolve_source": {
      "output": {
        "source_branch_id": "01..."
      }
    },
    "clone_storage_from_source": {
      "output": {
        "volume_id": "vol-123"
      }
    }
  },
  "system": {
    "trace_id": "wf-abc",
    "attempt": 1
  }
}
```

## 11. Python Contract (Proposed)

```python
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class TaskSpec:
    task_id: str
    task_type: str
    depends_on: list[str]
    input_refs: list[str]
    retry_max_attempts: int = 3


@dataclass(frozen=True)
class WorkflowGraph:
    nodes: list[TaskSpec]


@dataclass(frozen=True)
class WorkflowContext:
    payload: dict[str, Any]
    runtime: dict[str, Any]
    tasks: dict[str, dict[str, Any]]
    system: dict[str, Any]


class WorkflowBuilder(Protocol):
    workflow_type: str
    workflow_version: str

    def build(self, payload: dict[str, Any], runtime: dict[str, Any]) -> WorkflowGraph:
        ...


class TaskExecutor(Protocol):
    task_type: str

    async def execute(self, workflow_id: str, task_id: str, context: WorkflowContext) -> dict[str, Any]:
        ...

    async def compensate(self, workflow_id: str, task_id: str, context: WorkflowContext) -> None:
        ...
```

## 12. Observability

Metrics:

- `vela_workflow_runs_total{workflow_type,state}`
- `vela_workflow_task_total{workflow_type,task_type,state}`
- `vela_workflow_task_duration_seconds{workflow_type,task_type}`
- `vela_workflow_retries_total{workflow_type,task_type}`

Events/logging:

- workflow started/completed/failed
- task started/succeeded/failed/retried/compensated
- DAG snapshot hash for traceability

## 13. Security and Governance

1. Only authorized principals can trigger/cancel workflows.
2. Task payload/context must redact secrets in logs/events.
3. Sensitive outputs should be stored encrypted or as references.
4. Workflow execution should enforce tenant/organization boundaries.

## 14. Rollout Plan

Phase A:

- core DAG engine + persistence + task executor registry
- implement branch-create workflow with current behavior parity (reference pilot)
- preserve `201` behavior via operation adapter while storing `workflow_id`

Phase B:

- dynamic branch variants (new/clone/rewind)
- workflow introspection APIs and progress events
- onboard `branch.delete` and `branch.resize`

Phase C:

- migrate additional operations (control actions, backup monitor orchestration, pgbouncer/password ops, upgrade
  preflight orchestration, secrets workflows)
- add cancellation and compensation hardening

## 15. Testing Plan

1. Unit:
    - DAG validation (acyclic, dependency resolution)
    - scheduling/topological execution
    - retry and compensation policy behavior
2. Integration:
    - branch create variants: new/clone/rewind
    - dynamic task inclusion by capabilities/settings
    - resume after process restart
3. E2E:
    - API-visible workflow progress
    - failure injection and recovery behavior

## 16. Risks and Mitigations

1. Risk: over-engineering for simple operations.
    - Mitigation: start with branch-create only and keep minimal engine surface.
2. Risk: task idempotency gaps cause duplicate side effects.
    - Mitigation: enforce idempotency checklist and conformance tests per executor.
3. Risk: debugging complexity in dynamic DAGs.
    - Mitigation: persist DAG snapshots and expose task-level telemetry/events.

## 17. Open Questions

1. Should workflow definitions be purely code-based or partly declarative YAML/JSON?
2. Do we need priority queues for workflow classes (user actions vs background ops)?
3. What is the default cancellation policy for running tasks?
4. Should workflow API be internal-only initially?
5. Should `branch.create` remain `201` by default for one release and switch to `202` later, or support both
   permanently?
6. How should branch status transitions (`CREATING`, `STARTING`, `RESIZING`, `ERROR`) map to workflow/task states in a
   strictly reversible way?

## 18. Decision

Adopt a generic DAG workflow manager in `vela-controller`, using branch-create dynamic orchestration as an initial pilot
and expanding to additional lifecycle workflows after parity and reliability are proven.
