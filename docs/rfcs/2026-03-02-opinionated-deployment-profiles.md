# RFC: Opinionated Deployment Profiles for Self-Hosted Vela

- Status: Draft
- Target release: Phased (see rollout plan)

## 1. Summary

Define and ship opinionated deployment profiles for self-hosted Vela:

1. `single-node-dev`
2. `single-node-prod-lite` (homelab)
3. `basic-ha-cluster` 
4. `full-ha-cluster` (using simplyblock)

Each profile ships with:

- tested defaults
- resource sizing guidance
- feature toggles aligned with operational intent
- preflight validation and compatibility checks

This reduces setup complexity, improves successful self-hosted installs, and makes support/debugging reproducible.

## 2. Motivation

Today, self-hosted deployments are highly configurable but require many choices across storage, sizing, observability, and traffic exposure. This causes:

- over/under-provisioning
- fragile deployments due to incompatible defaults
- inconsistent user outcomes and support burden

Profiles provide a safe baseline and constrain choices intentionally.

Current context:

- `vela-terraform` exists in-repo and already encodes a practical deployment flow (Talos cluster + addons).
- Current addon composition is biased toward simplyblock-centric storage defaults.
- Profiles should become the canonical input that drives Terraform composition, not a parallel abstraction.

## 3. Goals

1. Provide turnkey profile-based installs for common self-hosting scenarios.
2. Encode known-good defaults and guardrails in controller/deployment workflows.
3. Keep advanced override support, but with explicit drift warnings.
4. Ensure each profile has automated conformance coverage.

## 4. Non-Goals

1. Removing custom deployments.
2. Supporting non-Kubernetes environments.
3. Solving all cost/performance tuning in v1.

## 5. Proposed Profiles

## 5.1 `single-node-dev`

Primary use:

- local/dev/test environments
- low durability expectations

Defaults:

- minimal resource reservations
- simplified ingress/exposure
- relaxed backup defaults
- reduced observability footprint

Constraints:

- no HA
- degraded mode options allowed (with clear warnings)

## 5.2 `single-node-prod-lite` / `homelab`

Primary use:

- small production environments on one node
- stronger operational posture than dev

Defaults:

- conservative resource floors
- mandatory backup schedule baseline
- stricter preflight checks
- standard observability bundle enabled

Constraints:

- still no multi-node HA
- profile disallows explicitly unsafe toggles
- requires block-storage volume capability
- 

## 5.3 `basic-ha-cluster`

Primary use:

- small production environments on multiple nodes
- basic failover/recovery posture

Defaults:

- conservative resource floors
- mandatory backup schedule baseline
- stricter preflight checks
- standard observability bundle enabled

Constraints:

- basic multi-node HA
- profile disallows explicitly unsafe toggles
- requires storage capabilities:
  - `supports_block_volume_mode`
  - `supports_volume_relocation` or `supports_vm_live_migration`
  - `supports_volume_expansion`
  - `supports_snapshots`

## 5.4 `full-ha-cluster` (simplyblock)

Primary use:

- multi-node production with HA objectives

Defaults:

- strict validation for topology/spread
- stronger backup/restore requirements
- full observability and alerting defaults

Constraints:

- requires cluster capabilities needed for HA posture
- stricter failure if prerequisites are missing
- requires storage capabilities:
  - `supports_block_volume_mode`
  - `supports_vm_live_migration`
  - `supports_volume_expansion`
  - `supports_snapshots`
  - `supports_fast_clone`
  - `supports_clone_without_snapshot`
  - `supports_topology_awareness`
  - `supports_consistency_group_snapshots`

## 6. Profile Contract

Each profile defines:

1. `profile_id` and version
2. required cluster capabilities
3. default resource envelope:
   - controller/system resources
   - branch baseline limits
   - storage baseline
4. feature policy:
   - allowed/forbidden toggles
   - warnings vs hard failures
5. operational policy:
   - backup minimums
   - observability minimums
   - exposure/ingress policy
6. conformance suite id

## 7. API and Config Changes

## 7.1 Deployment settings

Add:

- `vela_deployment_profile` (`single-node-dev` | `single-node-prod-lite` | `basic-ha-cluster` | `full-ha-cluster`)
- `vela_deployment_profile_enforcement` (`strict` | `warn`)

Behavior:

- `strict`: incompatible config fails preflight/startup.
- `warn`: incompatible config allowed with explicit warning/event.

## 7.2 Profile resolution endpoint

Add:

- `GET /platform/system/deployment-profile`

Response:

- active profile id/version
- effective defaults after resolution
- drift status (custom overrides from profile baseline)
- profile validation warnings/errors

## 7.3 Preflight endpoint/command integration

Profile checks should run in:

- installation preflight
- upgrade preflight
- startup validation

Output should be structured and actionable.

## 7.4 Terraform profile input

Expose profile as first-class Terraform input:

- `vela_deployment_profile`
- `vela_deployment_profile_enforcement`

`vela-terraform` should resolve this into:

- module enablement/disablement
- default variable values
- validation of required variables per profile

## 8. Override Model

Profiles define defaults, not hard lock-in by default.

Rules:

1. settings can be overridden unless profile marks field as immutable.
2. immutable violations:
   - fail in `strict`
   - warn in `warn` only if explicitly allowed by profile policy
3. all overrides recorded in drift report.

## 9. Implementation Approach

## 9.1 Profile registry

Implement a profile registry in controller/deployment code:

- declarative profile specs (YAML or typed Python models)
- versioned profile metadata
- merge/resolution logic for defaults + user overrides

## 9.2 Enforcement points

Apply profile policy at:

- settings load/validation
- deployment plan generation
- branch provisioning constraints (where relevant)

## 9.3 Studio integration

Expose profile status in Studio:

- show active profile
- show drift/warnings
- contextual helper text in resource and settings UIs

## 9.4 Terraform module mapping

Map profiles to concrete `vela-terraform` composition:

1. `single-node-dev`
   - minimal addon set
   - least strict validation
   - smallest default sizing envelope
2. `single-node-prod-lite`
   - production-lite addon baseline (monitoring/backup-critical components)
   - stricter validations and safer defaults
3. `basic-ha-cluster` | `full-ha-cluster`
   - HA-oriented addon and topology requirements
   - strict prerequisite validation before apply

Implementation requirement:

- keep profile resolution centralized (controller/shared profile spec) and consume it from Terraform, rather than duplicating profile rules in multiple places.

## 10. Backward Compatibility

Default behavior when unset:

- preserve current behavior initially
- optionally map existing installs to a compatibility profile in a later phase

No forced migration in phase 1.

## 11. Rollout Plan

Phase A:

- profile schema + registry
- existing installation into `full-ha-cluster` profile
- `single-node-dev` profile
- preflight + API read endpoint
- terraform input wiring for active profile

Phase B:

- `single-node-prod-lite` and `basic-ha-cluster` profiles
- enforcement mode (`strict`/`warn`)
- drift reporting
- terraform module/variable mapping for all profiles

Phase C:

- Studio profile visibility and drift UX
- docs + operational runbooks per profile

## 12. Testing Plan

1. Unit tests:
   - profile resolution logic
   - strict/warn enforcement behavior
   - immutable field handling
2. Integration tests:
   - install/startup with each profile
   - expected failures for missing prerequisites
   - override + drift behavior
3. Terraform integration tests:
   - plan/apply validation per profile in `vela-terraform`
   - ensure profile defaults produce deterministic plans
   - ensure strict mode fails on incompatible profile overrides
4. Conformance suites:
   - one automated suite per profile
   - release gate requires passing suites

## 13. Risks and Mitigations

1. Risk: profile defaults become stale.
   - Mitigation: versioned profile specs + conformance gates.
2. Risk: users bypass profile intent with overrides.
   - Mitigation: enforcement modes + drift surfacing.
3. Risk: support burden from profile ambiguity.
   - Mitigation: explicit profile contract and deterministic validation output.

## 14. Open Questions

1. Should existing installations auto-detect and map to a profile in UI?
2. Which fields must be immutable per profile vs soft defaults?
3. Should `ha-cluster` require specific minimum node count and topology labels at preflight?
4. Do we need profile-specific upgrade blockers for unsafe transitions (for example dev -> ha-cluster)?
5. Should Terraform accept only profile IDs, or also a generated resolved profile artifact from controller tooling?

## 15. Decision

Adopt profile-based deployment as the default recommended self-hosting experience, starting with `single-node-dev`, then expanding to `single-node-prod-lite` and `ha-cluster` with enforcement and conformance coverage.

## Appendix 1. Proposed Profile YAML Definition

This format is installation-time oriented and Terraform-consumed.  
It is not a Kubernetes resource; it is a plain profile artifact resolved before `terraform plan/apply`.

```yaml
profile:
  id: "<profile-id>"
  version: "<semver>"
  enforcement_default: "<strict|warn>"
installation:
  topology:
    class: "<single-node|multi-node>"
    min_control_plane_nodes: <int>
    min_worker_nodes: <int>
  kubernetes:
    min_version: "<k8s-semver>"
    required_cluster_capabilities:
      - "<cluster-capability>"
  storage:
    qos_policy: "<strict|best_effort>"
    required_capabilities:
      - "<storage-capability>"   # required by Vela storage behavior
    fallback_policy:
      when_block_mode_unavailable: "<qcow2-on-filesystem|forbidden>"
defaults:
  branch_limits:
    milli_vcpu: <int>
    ram_bytes: <int>
    database_size_bytes: <int>
    storage_size_bytes: <int>
    iops: <int|null>
  pitr_enabled: <bool>
terraform:
  required_addons: ["<addon>", "..."]
  optional_addons: ["<addon>", "..."]
  conformance_suite: "<suite-id>"
```
