# RFC: Secrets Bootstrap and UX Hardening

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03

## 1. Summary

This RFC hardens self-hosted installation and operations by introducing a canonical secrets model, automated bootstrap generation for platform-owned secrets, and controlled rotation workflows.

Key outcomes:

1. Remove insecure/static defaults from charts and templates.
2. Move sensitive configuration out of ConfigMaps into Kubernetes Secrets.
3. Add idempotent bootstrap and rotation workflows integrated with current branch-level secret generation.
4. Keep external/provider credentials operator-managed, but validated with explicit diagnostics.

## 2. Scope and Motivation

Current installation and runtime paths contain secret-management friction and security debt that affect local development, homelab installs, and production HA on-prem/private cloud deployments.

Primary verified issues:

1. Sensitive values are currently passed via ConfigMaps in controller/studio chart paths.
2. Several secret defaults/placeholders are static and insecure.
3. Secret ownership is not consistently separated between platform-owned and operator-owned values.
4. Rotation exists in selected branch workflows, but there is no unified control-plane rotation surface.

## 3. Goals

1. Secure-by-default day-0 bootstrap with minimal required manual inputs.
2. Canonical secret catalog with ownership, source, and rotation policy.
3. Single operator UX for bootstrap/status/verify/rotation.
4. Backward-compatible migration from legacy env/config patterns.
5. No secret plaintext in logs, ConfigMaps, or static values files.

## 4. Non-Goals

1. Replacing external secret managers already used by operators.
2. Automatic lifecycle/rotation for third-party provider credentials (Cloudflare, simplyblock, VPN, etc.).
3. KMS/HSM deep integration in this phase (reference mode only).

## 5. Current Implementation Verification

This section reflects verified behavior in the current repository.

## 5.1 Verified weak/default secret handling

1. `vela-controller/chart/values.yaml`
   - `VELA_PGMETA_CRYPTO_KEY: 'secret'`
   - `VELA_CLOUDFLARE_API_TOKEN: 'your_cloudflare_api_token'`
   - `AUTH_JWT_SECRET: 'secret'`
   - `NEXTAUTH_SECRET: 'super-long-random-nextauth-secret'`
   - `VELA_PLATFORM_KEYCLOAK_CLIENT_SECRET: 'client-secret'`
   - Grafana password default `password`
2. `vela-controller/src/deployment/charts/vela/values.yaml`
   - `secret.pgbouncer.admin_password` default placeholder (`pgadmin_pwd`) with TODO note.

## 5.2 Verified ConfigMap secret leakage paths

1. `vela-controller/chart/templates/controller.yaml`
   - Sensitive env vars sourced from `vela-controller-config` ConfigMap, including:
     - `VELA_PGMETA_CRYPTO_KEY`
     - `VELA_KEYCLOAK_ADMIN_SECRET`
     - `VELA_CLOUDFLARE__API_TOKEN`
2. `vela-controller/chart/templates/studio.yaml`
   - Sensitive env vars sourced from `vela-studio-config` ConfigMap, including:
     - `AUTH_JWT_SECRET`
     - `NEXTAUTH_SECRET`
     - `SUPABASE_SERVICE_KEY`
     - `VELA_PLATFORM_KEYCLOAK_CLIENT_SECRET`

## 5.3 Verified strict secret requirements in settings

1. `vela-controller/src/deployment/settings.py`
   - Startup requires secrets including cloudflare values (for current deployment settings path), `pgmeta_crypto_key`, Grafana credentials.
2. `vela-controller/src/api/settings.py`
   - Startup requires `jwt_secret`, `pgmeta_crypto_key`, `keycloak_admin_secret`, and related auth values.

These requirements define runtime expectations; bootstrap must satisfy them before service start.

## 5.4 Verified generated secret behavior already present

`vela-controller/src/api/organization/project/branch/__init__.py`
- Branch JWT secret generation.
- Branch anon/service key derivation.
- Branch PgBouncer password generation.

This RFC extends and unifies these flows; it does not replace them.

## 5.5 Verified Terraform/operator-managed secret boundaries

1. `vela-terraform/addons/variables.tf`
   - Cloudflare and simplyblock credentials are explicit operator inputs.
2. `vela-terraform/addons/cert-manager.tf`
   - Cloudflare token is propagated into Kubernetes Secret for cert-manager.
3. `vela-terraform/addons/simplyblock.tf`
   - simplyblock secret is passed as sensitive variable.
4. `vela-terraform/secrets/*.sops.yaml`, `vela-terraform/README.md`, `vela-terraform/addons/vpn_client.tf`
   - Multiple bootstrap/network secrets are SOPS/manual-operator managed.

Conclusion: provider/external secrets should remain manual/external in this phase, with explicit validation and UX guidance.

## 6. Secret Ownership Model

Every secret is classified with:

- `secret_id`
- `component`
- `owner` (`platform` | `operator`)
- `source` (`generated` | `external_ref` | `manual` | `legacy_env`)
- `k8s_secret_name`
- `keys[]`
- `required_when[]` (feature gates/profile predicates)
- `rotation_mode` (`manual` | `assisted` | `unsupported`)
- `restart_policy`
- `migration_strategy`

Initial ownership rules:

1. Platform-owned (auto-generate by default):
   - Studio `NEXTAUTH_SECRET`
   - Studio `AUTH_JWT_SECRET`
   - `VELA_PGMETA_CRYPTO_KEY`
   - Keycloak client secret(s)
   - Keycloak bootstrap admin password
   - Grafana admin password
2. Operator-owned (manual/external reference):
   - Cloudflare API token and zone/domain values
   - simplyblock credentials
   - VPN bootstrap credentials
   - Talos bootstrap secrets and kubeconfig artifacts (Terraform/SOPS workflows)

## 7. Bootstrap Architecture

Introduce a `SecretBootstrapManager` with two idempotent operations:

1. `generate`:
   - Creates missing platform-owned secrets only.
   - Never overwrites existing keys unless explicit force flag is provided.
2. `reconcile`:
   - Validates inventory, backfills missing keys, reports unresolved operator-owned requirements.

Bootstrap ordering:

1. Resolve install intent (profile + enabled providers/features).
2. Build required-secret set from catalog predicates.
3. Ensure operator-owned prerequisites are present or referenced.
4. Generate platform-owned missing secrets.
5. Apply Secrets and patch consumers (envFrom/secretKeyRef).
6. Emit redacted bootstrap report and recommended follow-ups.

## 8. Helm and Kubernetes Changes (Required)

## 8.1 Legacy chart path hardening

Required updates:

1. `vela-controller/chart/templates/controller.yaml`
   - Replace ConfigMap refs for sensitive fields with `secretKeyRef`.
   - Keep non-sensitive settings in ConfigMap.
2. `vela-controller/chart/templates/studio.yaml`
   - Move auth/client/service sensitive keys to Secret refs.
   - Preserve ConfigMap only for non-sensitive UI/runtime flags.
3. `vela-controller/chart/values.yaml`
   - Remove insecure default literals.
   - Replace with empty/null values and secret reference options.
   - Add validation fail-fast if placeholder-like values are provided.

## 8.2 Deployment chart alignment

1. `vela-controller/src/deployment/charts/vela/values.yaml`
   - Remove placeholder default for `secret.pgbouncer.admin_password`.
   - Use generated or explicit secretRef-only behavior.
2. Ensure all charts follow the same secret-source contract:
   - no plaintext defaults for secret fields
   - no secret values in ConfigMaps
   - optional external-secret reference integration

## 9. Controller Runtime Contract Changes

Settings loading must support canonical secret sourcing while preserving compatibility.

Required behavior:

1. Prefer Kubernetes Secret/env-injected values.
2. Accept legacy env vars during migration window.
3. Reject known insecure placeholder values with explicit startup error in hardened mode.
4. Emit actionable diagnostics naming missing secret IDs and expected locations.

Affected modules:

- `vela-controller/src/deployment/settings.py`
- `vela-controller/src/api/settings.py`

## 10. Rotation Architecture

Introduce `SecretRotationManager` with metadata-driven workflows.

CLI surface:

- `vela secrets bootstrap`
- `vela secrets status`
- `vela secrets verify`
- `vela secrets rotate --secret-id <id>`
- `vela secrets rotate --component <component>`
- `vela secrets rotate --all-supported`
- `vela secrets rotate --dry-run`

Rotation steps:

1. Preflight dependency checks.
2. Generate candidate replacement value.
3. Apply update atomically (K8s Secret patch/create).
4. Execute dependency sync hooks.
5. Trigger rollout/restart per policy.
6. Health verification and audit record.

Special cases:

1. Keycloak client secret rotation:
   - Rotate in Keycloak and dependent consumers in coordinated workflow.
   - Roll back/abort if downstream propagation fails.
2. Studio auth secret rotation:
   - Require explicit acknowledgement of session invalidation impact.
3. Branch secrets:
   - Reuse existing branch-level generation/rotation code paths; expose in unified CLI.

## 11. Terraform Integration

Terraform remains intent/orchestration for infra and operator-owned secrets; platform-owned secrets are bootstrap-managed.

Required changes:

1. Add explicit preflight/bootstrap hook in install workflows:
   - `vela install bootstrap-secrets` (or equivalent wrapper) before controller workloads become Ready.
2. Terraform inputs:
   - keep provider/operator credentials as-is (Cloudflare, simplyblock, VPN, Talos).
   - avoid introducing additional required platform secret variables.
3. Preflight diagnostics:
   - fail with precise missing-secret messages for required operator-owned credentials when feature-enabled.
4. Optional export mode:
   - allow generated platform secrets to be exported in encrypted form (for GitOps continuity), opt-in only.

## 12. Data Model for Secret Metadata

PostgreSQL is the only supported persistence backend for this metadata in platform runtime.

Suggested schema:

- `platform_secret_inventory`
  - `secret_id` (PK)
  - `component`
  - `owner`
  - `source`
  - `rotation_mode`
  - `last_rotated_at`
  - `version`
  - `updated_at`

- `platform_secret_events`
  - `id` (PK)
  - `secret_id` (FK)
  - `event_type` (`generated|rotated|verified|migration`)
  - `actor`
  - `status`
  - `details_json`
  - `created_at`

Notes:

1. No secret plaintext is stored in PostgreSQL.
2. Only metadata and audit events are persisted.

## 13. Backward Compatibility and Migration

Migration stages:

1. Detect legacy secret sources (values/configmaps/env placeholders).
2. Import/normalize into canonical Secret objects.
3. Switch workload references to Secret refs.
4. Keep legacy read compatibility for one deprecation window.
5. Enforce hardened mode by default in a later release.

Compatibility requirements:

1. Existing clusters continue to boot after upgrade.
2. Automatic migration must be idempotent and safe on repeated runs.
3. Explicit warning events for any insecure placeholder values detected.

## 14. Security Requirements

1. Cryptographically secure generation (`secrets` module) with minimum entropy policy.
2. Zero plaintext secret logging.
3. Least-privilege RBAC for read/write secret operations.
4. Audit trail for bootstrap/verify/rotation actions.
5. ConfigMap scanners/preflight checks that block secret-like keys in non-secret resources.

## 15. Testing Requirements

1. Unit tests:
   - catalog predicate resolution
   - idempotent generation/reconcile behavior
   - placeholder detection and hardened-mode validation
   - rotation dependency graph and hook ordering
2. Integration tests:
   - first install without pre-created platform secrets
   - mixed legacy + canonical secret sources
   - coordinated rotation (Keycloak + studio + rollout hooks)
3. E2E tests:
   - local/homelab profile with minimal inputs
   - HA profile with external provider credentials and failure diagnostics
   - upgrade migration from legacy chart/configmap secret sources

## 16. Rollout Plan

Phase A:

1. Secret catalog and bootstrap manager implementation.
2. Legacy chart hardening for highest-risk secrets (studio/controller auth + pgmeta + keycloak client/admin).

Phase B:

1. Unified rotation manager and CLI surface.
2. Integration of existing branch secret rotation workflows.

Phase C:

1. Terraform flow integration and optional encrypted export.
2. Hardened defaults enabled, placeholders rejected by default.

## 17. Open Questions

1. Should Keycloak DB credentials be fully projected from dedicated DB/operator secrets in all deployment modes?
2. What is the exact deprecation timeline for legacy env/configmap secret sources?
3. Which rotation workflows should support rollback semantics versus fail-stop only?

## 18. Decision

Adopt a unified secret bootstrap/verification/rotation framework with strict secret-source hygiene, preserving operator control for external provider credentials and integrating existing branch-level secret workflows under a common operational interface.
