# RFC: Upgrade Preflight and Compatibility Gates for Self-Hosted Vela

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03

## 1. Summary

Introduce a mandatory, machine-readable upgrade preflight framework that validates compatibility and rollback readiness before any self-hosted Vela upgrade step is executed.

This RFC adds:

1. explicit source->target version policy gates,
2. deployment/addon/CRD/provider compatibility gates,
3. rollback readiness gates based on existing snapshot/backup primitives,
4. enforced upgrade flow integration for automation (Terraform/CI) and operator workflows.

## 2. Motivation

Current implementation contains important safety primitives but lacks a unified preflight gate that blocks unsafe upgrades.

Verified risks:

1. migrations are auto-applied at controller startup without preflight gating,
2. no canonical compatibility manifest exists for release edges or addon contracts,
3. install paths include version drift between docs and Terraform-managed dependencies,
4. some dependency sources are mutable (for example `ref=main`), reducing upgrade reproducibility.

## 3. Goals

1. Fail upgrades early when compatibility, policy, or rollback prerequisites are not met.
2. Make upgrade decisions deterministic and auditable.
3. Support local, homelab, and HA production environments with profile-aware policies.
4. Integrate with existing backup/snapshot capability instead of re-implementing rollback systems.
5. Provide strict defaults while allowing explicit, auditable acknowledgements for irreversible steps.

## 4. Non-Goals

1. Fully automatic rollback orchestration in v1.
2. Support for arbitrary multi-major jumps without explicit policy entries.
3. Replacing existing backup/snapshot implementations.

## 5. Current Implementation Verification

## 5.1 Migration behavior today

1. `vela-controller/src/api/__init__.py`
   - Startup path runs Alembic `upgrade head` unconditionally via `_populate_db()`.
   - There is no upgrade preflight decision point before schema mutation.
2. `vela-controller/scripts/alembic.py`
   - Provides migration command helper for dev/test, not an operational upgrade gate.

Implication: current runtime can perform irreversible DB changes before compatibility checks.

## 5.2 Version metadata and API gaps

1. `vela-controller/src/api/system.py`
   - `/system/version` returns commit hash + build timestamp only.
   - No canonical semantic release identifier or compatibility contract is exposed.
2. `vela-controller/src/deployment/charts/vela/Chart.yaml`
   - Chart version exists (`0.1.3`), but no compatibility mapping to controller/API schema revision is defined.

## 5.3 Compatibility constraints already encoded in code

1. `vela-controller/src/deployment/deployment.py`
   - `DeploymentParameters.database_image_tag` is constrained to `Literal["15.1.0.147", "18.1-velaos"]`.
   - Mapping of database image tags is hardcoded in `_SUPPORTED_DATABASE_IMAGE_TAG`.
2. `vela-controller/src/api/system.py`
   - `/system/available-postgresql-versions` currently returns a static list.

Implication: runtime contains implicit compatibility rules that are not formalized into an upgrade policy gate.

## 5.4 Addon/provider version reality in Terraform

1. `vela-terraform/addons/*.tf`
   - Multiple pinned component versions (cert-manager, Loki, provider versions, Kong operator images).
2. `vela-terraform/addons/neon-autoscaler.tf`
   - Kustomization source uses `github.com/simplyblock/autoscaling/...?...ref=main` (mutable reference).
3. `vela-terraform/addons/kong.tf`
   - Gateway API CRDs fetched from a remote URL at apply time.

Implication: reproducibility and upgrade safety require explicit preflight checks on resolved dependency versions and source immutability.

## 5.5 Rollback-related primitives already present

1. `vela-controller/src/api/backup.py`, `vela-controller/src/api/backupmonitor.py`, `vela-controller/src/api/backup_snapshots.py`
   - Existing backup schedules, manual backup creation, and snapshot operations exist.

Implication: upgrade preflight can gate on backup/snapshot readiness using existing data and APIs.

## 5.6 Drift between installation paths

1. `vela-controller/docs/manual-deployment.md`
   - Example cert-manager version differs from Terraform addon version.

Implication: preflight must validate actual cluster state and installed versions, not trust declarative intent alone.

## 6. Design Overview

Add `UpgradePreflightEngine` as the mandatory decision layer before upgrade execution.

Flow:

1. discover current state (versions, CRDs, providers, schema revision, backup readiness),
2. resolve target release contract,
3. execute ordered checks,
4. evaluate policy (`strict` default),
5. emit structured report and decision token.

No upgrade action may proceed when blocking checks fail.

## 7. Gate Set (Required)

## 7.1 Version Path Gate

Validates source->target edge against a compatibility graph.

Checks:

1. allowed patch/minor/major transitions,
2. blocked edges,
3. required intermediate hops.

## 7.2 Database Migration Gate

Validates DB schema transition risk before applying migrations.

Checks:

1. current Alembic revision vs target expected revision,
2. migration chain integrity (single head, no ambiguity),
3. irreversible migration markers acknowledged when applicable.

## 7.3 Addon and Module Compatibility Gate

Validates addon/operator version contracts.

Checks:

1. cert-manager, kong operator, stackgres operator, loki, metrics-server ranges,
2. Kubernetes provider/tooling minimum versions used by the upgrade workflow,
3. mutable dependency source detection (for example branch refs like `ref=main`) in strict mode.

## 7.4 CRD/API Compatibility Gate

Validates required CRDs and API versions.

Checks:

1. required CRDs exist with supported versions (Gateway API, cert-manager, StackGres, NeonVM where enabled),
2. incompatible/deprecated API usage detection for target release.

## 7.5 Provider Capability Gate

Validates storage/gateway/DNS mode compatibility for target release capabilities.

Checks:

1. selected provider mode supported by target release,
2. required feature flags/capabilities present,
3. unsupported combinations blocked with remediation.

## 7.6 Rollback Readiness Gate

Validates checkpoint readiness before point-of-no-return steps.

Checks:

1. recent successful DB backup/snapshot evidence,
2. required snapshot class/resources available when storage rollback is required,
3. explicit operator acknowledgement token for irreversible transitions.

## 8. Upgrade Enforcement Model

## 8.1 Runtime contract changes

Current unconditional migration behavior must be changed.

Required behavior:

1. Production/HA profiles:
   - controller startup must not auto-apply migrations unless preflight decision is `pass` or explicitly acknowledged per policy.
2. Local development profile:
   - retain optional auto-migration path for developer velocity.
3. Managed upgrade command:
   - performs preflight first, then applies migrations and rollout actions only on approval.

## 8.2 Suggested implementation points

1. `vela-controller/src/api/__init__.py`
   - refactor `_populate_db()` to support preflight-aware mode selection.

   2. New package:
    ```text
    vela-controller/src/upgrade_preflight/
      __init__.py
      engine.py
      models.py
      policy.py
      context.py
      manifest.py
      reporters/{text.py,json.py,junit.py}
      checks/
        version_path.py
        db_migrations.py
        addon_versions.py
        crd_api.py
        provider_capabilities.py
        rollback_readiness.py
    ```
3. `vela-controller/src/api/system.py` (or dedicated upgrade API)
   - add admin endpoints for preflight execution/report retrieval.

## 9. Compatibility Manifest Contract

Define a versioned compatibility manifest shipped with each release.

Manifest includes:

1. release identifier and supported source versions,
2. required addon/operator/version ranges,
3. required CRD/API version ranges,
4. provider capability requirements,
5. migration risk metadata and acknowledgement requirements.

Manifest must be immutable per release artifact.

## 10. CLI and API UX

CLI:

- `vela upgrade preflight --target-version <v>`
- `vela upgrade preflight --format <text|json|junit>`
- `vela upgrade preflight --policy <strict|best_effort>`
- `vela upgrade preflight --ack-token <token>`

Exit codes:

- `0` pass,
- `1` blocking failures,
- `2` execution/config error.

API (admin only):

- `POST /system/upgrade/preflight`
- `GET /system/upgrade/preflight/{id}`

API must return metadata only, never secrets.

## 11. Result Model

Each check emits:

- `id`
- `category`
- `status` (`pass|fail|skip`)
- `severity` (`error|warning|info`)
- `blocking`
- `message`
- `evidence`
- `remediation`
- `docs_ref`

Preflight summary emits:

- `source_version`
- `target_version`
- `decision` (`pass|fail`)
- `rollback_ready` (`true|false`)
- `point_of_no_return` (`none|pending|acknowledged`)
- `ack_token_required` (`true|false`)

## 12. PostgreSQL Data Model (Only Supported Backend)

Preflight metadata persistence uses PostgreSQL only.

Tables:

- `upgrade_preflight_run`
  - `id` (PK)
  - `source_version`
  - `target_version`
  - `policy`
  - `decision`
  - `rollback_ready`
  - `point_of_no_return`
  - `created_by`
  - `created_at`

- `upgrade_preflight_result`
  - `id` (PK)
  - `run_id` (FK)
  - `check_id`
  - `category`
  - `status`
  - `severity`
  - `blocking`
  - `message`
  - `evidence_json`
  - `remediation`

- `upgrade_acknowledgement`
  - `id` (PK)
  - `run_id` (FK)
  - `token_hash`
  - `acknowledged_by`
  - `acknowledged_at`
  - `scope`

Notes:

1. No secret plaintext in preflight tables.
2. Reports are reproducible/auditable for CI and change management.

## 13. Terraform and CI Integration

1. Terraform/automation must execute preflight before upgrade apply.
2. Apply is blocked on preflight failure in `strict` mode.
3. JSON/JUnit outputs are archived as deployment artifacts.
4. Upgrade jobs must fail if mutable dependency refs are detected unless explicitly allowed by policy.

## 14. Security and Safety

1. Preflight is read-only by default.
2. Secrets/tokens are redacted from evidence fields.
3. Irreversible steps require explicit, scoped acknowledgement token.
4. All preflight and acknowledgement actions are audit logged.

## 15. Testing Requirements

1. Unit:
- manifest parsing and version edge evaluation,
- migration gate logic,
- policy evaluator (strict vs best_effort),
- mutable source detection.

2. Integration:
- unsupported version jump block,
- CRD/addon mismatch block,
- rollback-readiness failure,
- successful preflight pass with full report.

3. E2E:
- production profile blocks startup/upgrade on failed preflight,
- local dev profile allows auto-migration mode,
- acknowledgement workflow for point-of-no-return transitions.

## 16. Rollout Plan

Phase 1:

1. Preflight engine skeleton + manifest contract.
2. Version path + DB migration gates.
3. Report model and API/CLI output.

Phase 2:

1. Addon/CRD/provider gates.
2. Rollback readiness checks based on existing backup/snapshot data.
3. Strict policy default for production profile.

Phase 3:

1. Startup enforcement integration (preflight-aware migration behavior).
2. Terraform/CI mandatory gating.
3. Documentation and operational runbooks.

## 17. Backward Compatibility

1. Existing clusters can continue using current startup behavior during transition with explicit compatibility mode.
2. A deprecation window is provided before unconditional startup auto-migrations are disabled in production profiles.
3. Legacy/manual deployment paths remain supported but preflight still validates actual cluster/runtime state.

## 18. Open Questions

1. Should mutable dependency sources (`ref=main`) be hard-blocked in all profiles or only production/HA?
2. What recency threshold defines “rollback-ready” snapshot/backup evidence per profile?
3. Should acknowledgement tokens be single-use and short-lived only?

## 19. Decision

Adopt mandatory upgrade preflight and compatibility gates with strict default policy, PostgreSQL-backed auditability, and explicit enforcement before migration and rollout steps in self-hosted environments.
