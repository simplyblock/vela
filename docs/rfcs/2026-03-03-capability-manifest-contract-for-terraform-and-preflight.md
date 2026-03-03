# RFC: Shared Capability Manifest Contract for Terraform and Controller Preflight

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03
- Related RFCs:
  - `2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.md`
  - `2026-03-02-self-hosted-storage-backend-abstraction.md`
  - `2026-03-02-opinionated-deployment-profiles.md`
  - `2026-03-02-install-preflight-validation.md`
  - `2026-03-02-upgrade-preflight-and-compatibility-gates.md`

## 1. Summary

Introduce a versioned, machine-readable capability manifest (`capabilities.yaml`) as the single source of truth for infrastructure, provider, gateway, DNS, and storage capabilities.

Both Terraform composition/validation and controller preflight checks consume this manifest to make profile compatibility decisions data-driven instead of hardcoded.

## 2. Motivation

Current and planned profile/provider/backend validation is split across:

- Terraform variable logic and module-specific assumptions
- controller preflight logic
- RFC-level documentation

This creates drift risk, duplicated compatibility rules, and inconsistent install behavior.

A shared manifest contract allows:

1. One compatibility vocabulary across Terraform and runtime preflight.
2. Faster onboarding of new providers/backends by editing data instead of code paths.
3. Deterministic support matrix generation and conformance targeting.
4. Reduced regression risk from hidden hardcoded assumptions.

## 2.1 Current implementation verification (as of 2026-03-03)

The following capability assumptions are currently encoded in code/Terraform rather than a shared catalog:

1. DNS/provider coupling in runtime:
   - `vela-controller/src/deployment/settings.py` requires Cloudflare settings at startup.
   - `vela-controller/src/deployment/__init__.py` branch endpoint provisioning creates Cloudflare DNS records.
2. Gateway/API assumptions:
   - `vela-terraform/addons/kong.tf` and `vela-controller/deployment/addons/kong.tf` fetch Gateway API CRDs from remote URLs.
   - Gateway resources are assumed to be Kubernetes Gateway API v1 and Kong operator based.
3. Storage/backend assumptions:
   - `vela-controller/src/deployment/__init__.py` and `vela-controller/src/deployment/charts/vela/values.yaml` assume simplyblock storage class defaults in multiple paths.
   - snapshot capability assumptions are implicit in backup/snapshot modules (VolumeSnapshot v1 usage).
4. Terraform validation gaps:
   - there is currently no shared manifest loader module and no manifest-driven `check`/`validation` enforcement in `vela-terraform/*`.
5. Preflight integration gap:
   - install/upgrade preflight engines described in RFCs are not yet implemented in code; no existing shared capability evaluator package is present.

## 3. Goals

1. Define a stable manifest schema with semantic versioning.
2. Encode capability requirements and support levels per provider/backend/profile combination.
3. Allow Terraform to validate selected deployment intent against manifest.
4. Allow controller install/upgrade preflight to evaluate the same rules.
5. Make compatibility reporting explicit and actionable.

## 4. Non-Goals

1. Replacing all runtime discovery with static data.
2. Dynamic marketplace/provider plugin loading in v1.
3. Storing secrets or mutable runtime state in the manifest.

## 5. High-Level Design

## 5.1 Artifact

Primary artifact:

- `deploy/capabilities/capabilities.yaml`

Companion artifacts:

- JSON schema: `deploy/capabilities/schema/capabilities.schema.json`
- generated lock/output (optional): `deploy/capabilities/build/capabilities.normalized.json`

Note:

- these paths are proposed targets; they do not exist yet in the current repository.

## 5.2 Consumers

1. Terraform
   - reads manifest at plan-time
   - validates requested `infra_provider`, `storage_backend`, `gateway_provider`, `dns_manager`, `deployment_profile`
   - gates incompatible selections with clear error messages
2. Controller preflight
   - loads same manifest
   - combines declared capabilities with runtime observed state
   - emits pass/fail/skip per check using shared capability keys
3. CI/conformance
   - derives test matrix from manifest support entries
   - enforces that supported combinations have conformance coverage

## 6. Manifest Schema

## 6.1 Top-level structure

```yaml
apiVersion: vela.run/capabilities/v1alpha1
kind: CapabilityCatalog
metadata:
  version: 1.0.0
  updated_at: "2026-03-03T00:00:00Z"
capabilities:
  storage:
    supports_snapshots:
      description: "Supports point-in-time volume snapshots"
      type: boolean
  gateway:
    supports_path_routing:
      description: "Supports path-based routing"
      type: boolean
profiles:
  single-node-dev:
    requires:
      storage:
        supports_dynamic_provisioning: true
providers:
  infra:
    existing-cluster:
      support: ga
      provides: {}
  storage:
    generic-csi:
      support: ga
      provides:
        supports_dynamic_provisioning: true
combinations:
  - name: existing-cluster + generic-csi + single-node-dev
    select:
      infra_provider: existing-cluster
      storage_backend: generic-csi
      profile: single-node-dev
    support: ga
    constraints: []
```

## 6.2 Capability namespaces

Initial namespaces:

- `storage.*`
- `gateway.*`
- `dns.*`
- `network.*`
- `platform.*` (cross-cutting ops requirements, e.g. backup checkpoints)
- `ops.*` (install/upgrade safety requirements, rollback prerequisites)
- `artifact.*` (air-gap and source immutability requirements)

Keys should align with existing RFC capability vocabulary where possible.

Baseline capability keys should include currently hardcoded assumptions:

- `dns.supports_external_provider`
- `dns.provider.cloudflare`
- `gateway.supports_gateway_api_v1`
- `gateway.provider.kong_operator`
- `storage.supports_dynamic_provisioning`
- `storage.supports_snapshots_v1`
- `storage.backend.simplyblock`
- `ops.requires_cert_manager`
- `ops.requires_stackgres_operator`
- `artifact.requires_digest_pinned_images`

## 6.3 Support levels

Enum:

- `experimental`
- `beta`
- `ga`
- `deprecated`
- `unsupported`

Used for:

- Terraform warning/fail behavior (based on enforcement mode)
- preflight severity mapping
- docs/support matrix generation

## 7. Evaluation Model

## 7.1 Effective capability resolution

Effective capabilities for a deployment intent are resolved by:

1. Start with selected infra provider declared capabilities.
2. Merge selected storage backend capabilities.
3. Merge selected gateway and DNS manager capabilities.
4. Apply combination-specific overrides/constraints.
5. Evaluate profile `requires` against effective capability set.

## 7.2 Constraint expressions

V1 constraints are simple predicates:

- equality (`==`)
- existence
- logical `and` / `or`
- list membership (`in`)

Example:

```yaml
constraints:
  - id: profile.ha.storage.mobility
    when:
      profile: full-ha-cluster
    require_any:
      - storage.supports_vm_live_migration == true
      - storage.supports_volume_relocation == true
```

## 8. Terraform Integration

## 8.1 Module interface

Add a manifest reader helper module:

- `modules/shared/capability_catalog`

Responsibilities:

1. Load and decode YAML.
2. Validate schema version compatibility.
3. Expose normalized maps for validations/check blocks.

Implementation note (current repo layout):

- `vela-terraform` currently has no `modules/` tree; this RFC requires introducing one (or an equivalent shared locals pattern) to avoid duplicating parsing logic across root/addons/network/storage stacks.

## 8.2 Plan-time validation

Terraform should fail fast for:

1. unsupported combination (`support=unsupported`)
2. profile requirements not met by selected provider/backend set
3. missing required integration capability in strict mode
4. declared capability requiring immutable artifact sources when mutable refs are detected (for example `ref=main`, `latest`)

Warn-only path:

- in `warn` enforcement mode, `experimental`/`beta` can proceed with warnings.

## 8.3 Required `validation` and `check` blocks

In addition to schema-driven compatibility resolution, Terraform modules MUST implement first-class variable `validation`
and top-level `check` blocks for high-signal invalid combinations so failures are immediate and readable at plan time.

Required baseline checks:

1. `vela_endpoint_exposure_mode=public_enabled` with `vela_dns_manager=disabled` must fail.
2. `vela_endpoint_exposure_mode=public_enabled` with incompatible `vela_gateway_provider` capability must fail.
3. profile selections requiring strict capabilities (for example HA storage mobility) must fail when unmet.
4. combinations requiring DNS external provider must fail when DNS manager is `disabled`.
5. combinations requiring public artifact access must fail when `airgap_enabled=true` unless internal mirrors are declared.

The checks MUST be generated/evaluated from manifest constraints (not ad-hoc duplicated logic), but the resulting
Terraform error messages should remain explicit and operator-focused.

Example intent (conceptual):

```hcl
check "public_exposure_requires_dns" {
  assert {
    condition = !(
      var.vela_endpoint_exposure_mode == "public_enabled" &&
      var.vela_dns_manager == "disabled"
    )
    error_message = "Invalid configuration: public_enabled requires dns_manager != disabled."
  }
}
```

## 9. Controller Preflight Integration

## 9.1 Shared keyspace

Preflight checks must reference manifest capability keys directly (no private alias keys), for example:

- `storage.supports_snapshots`
- `gateway.supports_path_routing`

## 9.2 Decision logic

For each requirement:

1. declared support from manifest
2. observed runtime evidence (CRDs, classes, controllers, APIs)
3. final state = pass/fail/skip with remediation

When declared capability is true but runtime evidence fails, report as configuration/runtime mismatch.

Additional required behavior:

1. Runtime evidence probes must map to concrete checks (CRDs, StorageClass presence, controller Deployments, API reachability), not only static config.
2. In `strict` mode, manifest/runtime mismatches are blocking.
3. In `warn` mode, only `experimental`/`beta` support-level mismatches may downgrade severity; hard safety requirements remain blocking.

## 10. Versioning and Compatibility

## 10.1 Manifest versioning

- `metadata.version` follows semver.
- breaking schema changes require `apiVersion` bump.

## 10.2 Consumer behavior

- unknown minor fields: ignore
- unknown required schema version: hard fail with upgrade guidance
- unknown capability keys referenced by constraints: hard fail (schema/authoring error)

## 11. Governance and Change Process

Manifest edits require:

1. schema validation in CI
2. compatibility diff report (added/removed/changed support)
3. required conformance impact annotation
4. reviewer sign-off from infra + controller owners

## 12. Observability and Reporting

Generate artifacts from manifest:

1. support matrix docs (`provider x backend x profile`)
2. preflight reference table
3. conformance matrix

Expose manifest metadata in API:

- `GET /system/capabilities/catalog` (or `${root_path}/system/capabilities/catalog`) returning catalog version + effective resolved set, no secrets.

## 13. Security Considerations

1. Manifest is non-secret configuration metadata only.
2. No secret refs or credentials embedded.
3. Signed/reproducible release artifact recommended for production distribution.

## 14. Testing Plan

1. Schema tests:
   - valid/invalid manifest fixtures
   - backward compatibility parsing tests
2. Terraform tests:
   - supported and unsupported selection matrix
   - strict vs warn enforcement behavior
   - unknown key/reference failures
   - mutable source detection when manifest requires immutable artifacts
3. Preflight tests:
   - requirement evaluation against mocked runtime evidence
   - mismatch detection and remediation message quality
4. E2E:
   - one supported combination per support tier (`ga`, `beta`, `experimental`)

## 15. Rollout Plan

Phase A:

1. introduce schema + manifest artifact
2. wire Terraform loader and basic combination validation
3. add required baseline `validation`/`check` rules for exposure and DNS/gateway prerequisites
4. migrate one existing hardcoded rule set (DNS/gateway exposure) to manifest-backed checks

Phase B:

1. wire controller install preflight to manifest keys
2. add docs/support matrix generation
3. add runtime evidence probes for Gateway API, StorageClass, snapshot API, and required operators

Phase C:

1. wire upgrade preflight and profile drift reporting
2. enforce conformance coverage for `ga` combinations in CI

## 16. Risks and Mitigations

1. Risk: manifest drifts from real runtime capabilities.
   - Mitigation: runtime evidence checks and conformance gates.
2. Risk: over-complex expression model.
   - Mitigation: keep v1 to simple predicates; defer advanced DSL.
3. Risk: parallel hardcoded logic remains.
   - Mitigation: deprecate hardcoded requirement tables and fail CI when duplicate rule sources are detected.

## 17. Open Questions

1. Should manifest live in this repo or a shared release-metadata repo used by controller/terraform/CLI?
2. Should conformance status be written back to manifest (generated) or kept as separate artifact?
3. Do we need signed catalog bundles for offline/air-gapped distributions in v1?
4. Should support-level policy be centralized (`strict|warn`) in manifest metadata or remain a consumer-side setting?

## 18. Decision

Adopt a shared capability manifest contract as the authoritative compatibility source for Terraform validation and controller preflight, enabling data-driven profile/provider/backend support decisions with reduced drift and improved operator predictability.
