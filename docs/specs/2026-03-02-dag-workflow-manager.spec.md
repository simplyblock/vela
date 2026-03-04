# Spec: Generic DAG Workflow Manager

- RFC: `docs/rfcs/2026-03-02-dag-workflow-manager.md`
- Depends on: storage abstraction, auth updates, preflight baselines
- Persistence backend: PostgreSQL only

## Implementation Context

1. Branch lifecycle logic currently runs in imperative flows in:
   - `vela-controller/src/api/organization/project/branch/__init__.py`
   - `vela-controller/src/deployment/__init__.py`
2. There is no persistent workflow execution engine today.

## Invariants

1. Workflow run and task state MUST persist in PostgreSQL.
2. Execution MUST survive controller restarts.
3. Task retries and compensation MUST be explicit and bounded.
4. Existing branch API contracts MUST remain backward compatible during migration.

## Files and Packages

1. Add engine package: `vela-controller/src/workflow_manager/`.
2. Add persistence models and migrations in `vela-controller/src/models/` and migrations folder.
3. Add workflow introspection endpoints in `vela-controller/src/api/system.py` or dedicated router.
4. Refactor branch APIs to submit and observe workflow runs.

## Ordered Commit Plan

1. Commit 1: schema + data access layer.
2. Commit 2: DAG builder/scheduler/executor core.
3. Commit 3: branch create path integration.
4. Commit 4: clone/restore/resize/delete workflow families.
5. Commit 5: introspection API, observability, and compensation hardening.

## PostgreSQL Schema Contract (minimum)

1. `workflow_runs`: identity, workflow_type, state, context JSONB, created/updated timestamps.
2. `workflow_tasks`: run_id, task_id, state, attempts, payload JSONB, result JSONB, error fields.
3. `workflow_events`: run_id, task_id nullable, event_type, payload JSONB, timestamp.
4. Required indexes for scheduler polling and run/task lookup by state/time.

## Compatibility Matrix

1. Feature flag `workflow_engine_enabled=false`: legacy imperative flow.
2. `true`: create path first, then additional branch workflows by phase.
3. API response fields should include workflow reference IDs in both modes where available.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/workflow_manager`
2. Crash-recovery tests (restart during running workflow).
3. Concurrency tests (multiple workers on same run set).
4. End-to-end branch lifecycle tests comparing legacy vs DAG outputs.

## Definition of Done

1. Branch create and at least one additional branch workflow run through DAG engine.
2. Restart-safe and idempotent execution is proven by tests.
3. Operators can inspect runs/tasks/events via API.
