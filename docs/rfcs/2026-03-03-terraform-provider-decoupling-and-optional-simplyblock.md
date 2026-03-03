# RFC: Terraform Provider Decoupling and Optional simplyblock Storage

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03
- Related RFCs:
  - `2026-03-02-self-hosted-storage-backend-abstraction.md`
  - `2026-03-02-opinionated-deployment-profiles.md`
  - `2026-03-02-install-preflight-validation.md`
  - `2026-03-02-internal-first-endpoint-exposure.md`

## 1. Summary

Refactor `vela-terraform` into a provider-agnostic deployment framework where cloud and network implementation details are abstracted behind modules, and simplyblock is an optional storage backend instead of a mandatory default path.

The new model introduces:

1. A provider-neutral root contract (`provider`, `deployment_profile`, `storage_backend`, `exposure_mode`).
2. A split between core Kubernetes/bootstrap logic and provider-specific infrastructure modules.
3. Storage backend module selection aligned with controller storage backend abstraction (`simplyblock`, `zfs`, `lvm`, `generic-csi`).
4. Explicit feature toggles for gateway, DNS, observability, and storage addons.
5. Migration compatibility for existing GCP + simplyblock deployments.

## 2. Motivation

Current `vela-terraform` implementation is tightly coupled to GCP and simplyblock-specific assumptions:

- Hard-coded GCS state backend and GCP provider usage in root modules.
- GCP-only load balancer and instance group patterns embedded in compute flow.
- Addon composition assumes `simplyblock-csi` presence and often depends on it.
- Public ingress and certificate workflows assume Cloudflare + Kong default path.
- Limited portability to homelab (bare-metal/k3s), private cloud, or alternative Kubernetes environments.

This coupling conflicts with self-hosting adoption goals and with storage backend abstraction in controller runtime.

## 2.1 Current implementation verification (as of 2026-03-03)

The following repository facts were verified and should drive the migration design:

1. Terraform roots are GCP-coupled:
   - `vela-terraform/main.tf`, `vela-terraform/network/main.tf`, `vela-terraform/storage/main.tf` hardcode `backend "gcs"` and Google providers/resources.
   - `vela-terraform/provider.tf` and root variables are Google-specific (`project_id`, `region`, `zone`).
2. Addons stack is currently simplyblock-oriented:
   - `vela-terraform/addons/variables.tf` requires simplyblock credentials as baseline variables.
   - `vela-terraform/addons/loki.tf` and `vela-terraform/addons/prometheus.tf` depend on `helm_release.simplyblock_csi`.
   - Storage class values in addon config default to `simplyblock-csi-sc`.
3. Public exposure defaults are coupled:
   - `vela-terraform/addons/cert-manager.tf` includes Cloudflare/ACME resources and token requirements.
   - `vela-terraform/addons/kong.tf` assumes Kong + Gateway API resources and fetches Gateway API CRDs from remote HTTP.
4. Controller deployment paths still assume simplyblock/cloudflare in key areas:
   - `vela-controller/src/deployment/__init__.py` uses `SIMPLYBLOCK_CSI_STORAGE_CLASS = "simplyblock-csi-sc"` and Cloudflare DNS provisioning paths.
   - `vela-controller/src/deployment/settings.py` requires Cloudflare settings.
   - `vela-controller/src/deployment/charts/vela/values.yaml` includes multiple `simplyblock-csi-sc` defaults.
5. There is currently no provider-neutral Terraform module tree in `vela-terraform`.

## 3. Goals

1. Remove hard dependency on GCP-specific implementation from the Terraform root contract.
2. Make simplyblock optional and selectable by profile/intent.
3. Provide a stable module interface usable by multiple infrastructure providers.
4. Keep existing GCP deployment path functional during migration.
5. Enable internal-only deployments without DNS/public cert requirements by default.
6. Align Terraform inputs and outputs with controller storage/gateway/dns abstraction contracts.

## 4. Non-Goals

1. Implement every cloud provider in this RFC.
2. Replace Terraform with another IaC tool.
3. Design non-Kubernetes deployment modes.
4. Guarantee fully identical behavior across all providers in v1.

## 5. Current-State Problems

## 5.1 Provider coupling

- Root modules encode GCP resources (compute, forwarding rules, health checks, addresses).
- Backend state is fixed to GCS in committed config.
- Variable model is GCP-first (`project_id`, `region`, `zone`) and not provider-neutral.
- Multiple root stacks (`network`, `compute`, `storage`, `addons`) each independently encode GCP backend/provider assumptions.

## 5.2 Storage coupling

- Addon composition treats simplyblock as baseline.
- Other backend paths (`zfs`, `lvm`, `generic-csi`) are not first-class in Terraform composition.
- Downstream observability/config templates reference simplyblock storage class by default.
- Addon dependency graph currently requires simplyblock for Loki/Prometheus paths.

## 5.3 Exposure and integration coupling

- Public gateway and cert-manager assumptions are default-shaped rather than optional via exposure mode.
- DNS/certificate flow relies on Cloudflare token path in addon config.

## 6. Proposed Design

## 6.1 Top-level contract

Introduce provider- and backend-neutral inputs:

- `vela_infra_provider` (`gcp|aws|azure|talos-baremetal|existing-cluster`)
- `vela_deployment_profile` (`single-node-dev|single-node-prod-lite|basic-ha-cluster|full-ha-cluster`)
- `vela_storage_backend` (`simplyblock|zfs|lvm|generic-csi`)
- `vela_endpoint_exposure_mode` (`internal_only|public_enabled`)
- `vela_gateway_provider` (`kong|gateway_api|ingress|external`)
- `vela_dns_manager` (`disabled|cloudflare|external`)
- `vela_observability_profile` (`minimal|standard|full`)
- `vela_state_backend_profile` (`local|s3|gcs|remote`) for documented backend templates (not hardcoded in module code)

All profile/provider specific fields move into nested provider or backend configs.

## 6.2 Terraform architecture

Refactor into layered modules:

1. `modules/core`
   - kubeconfig ingestion/validation
   - namespace/bootstrap resources
   - provider-independent addon wiring contract
2. `modules/infra/<provider>`
   - compute/network/load balancer specifics
   - provider primitives and outputs normalized to core contract
3. `modules/storage/<backend>`
   - storage class/snapshot class provisioning
   - backend-specific secrets/references
   - capability metadata output for preflight integration
4. `modules/gateway/<provider>`
   - Kong/Gateway API/Ingress/external adapters
5. `modules/dns/<manager>`
   - disabled/cloudflare/external adapters
6. `modules/observability/<profile>`
   - minimal/standard/full bundles

Migration note:

- existing split roots (`network`, `storage`, root compute, `addons`) should be wrapped by the new module contracts first, then gradually decomposed to avoid a flag day rewrite.

## 6.3 Module interface contracts

Each infra module must output normalized values:

- `kube_api_endpoint`
- `cluster_identity`
- `internal_endpoint_addresses`
- `public_endpoint_addresses` (nullable)
- `supports_internal_lb`
- `supports_public_lb`

Each storage backend module must output:

- `storage_class_name`
- `snapshot_class_name`
- `capabilities` (aligned with controller storage capability schema)
- `required_secrets`

This allows profile/preflight gates to validate compatibility independent of provider implementation.

## 6.4 State backend strategy

Remove fixed backend from committed root module.

Support:

- CLI-supplied backend config (`-backend-config=...`)
- environment-driven backend templates
- documented examples for local, s3-compatible, gcs, and remote backends

No cloud-specific backend is hardcoded in reusable root modules.

Additional requirement:

- repository-shipped root modules must not contain a fixed backend stanza for a single provider; backend selection is an operator-supplied concern.

## 6.5 simplyblock optionality model

`vela_storage_backend` controls storage module inclusion:

- `simplyblock`: deploy simplyblock CSI + secret inputs required.
- `zfs`: deploy/validate ZFS CSI path; no simplyblock credentials.
- `lvm`: deploy/validate LVM CSI path; no simplyblock credentials.
- `generic-csi`: reuse existing CSI class/snapshot class references with minimal assumptions.

Profile rules:

- `full-ha-cluster` may require simplyblock or another backend satisfying required HA capabilities.
- lower profiles do not force simplyblock unless explicitly selected.

Additional rule:

- observability and addon modules must not declare hard `depends_on` links to simplyblock resources unless `vela_storage_backend=simplyblock`.

## 6.6 Internal-first defaults

For `vela_endpoint_exposure_mode=internal_only`:

- skip public load balancer resources
- skip cert-manager ACME + DNS automation
- keep internal gateway routing enabled

Public resources become conditional on explicit mode and prerequisites.

Additional requirement:

- when `internal_only`, DNS manager defaults to `disabled` and public cert-manager ACME/Cloudflare resources are not planned.

## 7. Configuration Model

## 7.1 Root variables (example)

```hcl
variable "vela_infra_provider" {
  type    = string
  default = "existing-cluster"
}

variable "vela_storage_backend" {
  type    = string
  default = "generic-csi"
}

variable "vela_endpoint_exposure_mode" {
  type    = string
  default = "internal_only"
}
```

## 7.2 Provider-specific nested objects

Examples:

- `infra_gcp = { project_id, region, zone, network, ... }`
- `infra_aws = { region, vpc_id, subnets, ... }`
- `infra_existing_cluster = { kubeconfig_path, context }`

Only the selected provider object is required; others are ignored.

## 7.3 Storage backend objects

- `storage_simplyblock = { endpoint, cluster_id, cluster_secret, pool_name }`
- `storage_zfs = { storage_class, snapshot_class, options }`
- `storage_lvm = { storage_class, snapshot_class, options }`
- `storage_generic_csi = { storage_class, snapshot_class }`

## 8. Migration Plan

## 8.1 Phase A: Compatibility wrapper

1. Introduce new root contract with default mapping to current GCP behavior.
2. Keep existing GCP modules but move behind `modules/infra/gcp`.
3. Keep simplyblock addon path unchanged when `vela_storage_backend=simplyblock`.

## 8.2 Phase B: Storage backend modularization

1. Extract simplyblock logic into `modules/storage/simplyblock`.
2. Add `generic-csi` module and class/snapshot reference validation.
3. Update addon dependencies to avoid implicit simplyblock coupling.
4. Parameterize monitoring/storage class settings so non-simplyblock backends do not inherit `simplyblock-csi-sc`.

## 8.3 Phase C: Exposure and provider decoupling

1. Make gateway/dns/cert addons mode-driven.
2. Ensure `internal_only` path works without public DNS/cert dependencies.
3. Add `existing-cluster` provider path as baseline non-cloud deployment target.
4. Remove remote HTTP/Git fetch requirements from default provider paths where possible, or gate them by explicit feature toggles.

## 8.4 Phase D: New provider implementations

Add additional infra providers iteratively (AWS/Azure/baremetal) using normalized contracts.

## 9. Backward Compatibility

1. Existing GCP variable names remain accepted for at least one deprecation window.
2. Existing simplyblock variables remain valid if backend is `simplyblock`.
3. Existing outputs are preserved where feasible, with aliases to normalized output names.
4. Emit explicit deprecation warnings for legacy variable paths.
5. Support transitional mapping from legacy root stacks (`network`, `storage`, root compute, `addons`) to new contract variables.

## 10. Validation and Preflight Integration

Terraform plan-time and preflight checks must validate:

1. selected profile vs storage capability fit
2. exposure mode vs gateway/dns prerequisites
3. required secret refs for selected provider/backend
4. incompatible variable combinations fail early with remediation
5. `internal_only` + public DNS/cert-manager settings fail or warn per enforcement mode
6. storage backend selection and addon dependency graph are consistent (no hidden simplyblock hard requirements)

## 11. Testing Plan

1. Unit/module:
   - variable validation and conditional module wiring
   - backend selection logic
   - normalized output shape assertions
2. Integration:
   - `existing-cluster + generic-csi + internal_only`
   - `gcp + simplyblock + public_enabled`
   - `gcp + generic-csi + internal_only`
   - `existing-cluster + simplyblock + internal_only`
   - negative case: `generic-csi` with addon graph still requiring simplyblock should fail preflight
3. Conformance:
   - shared post-install suite validates branch create/clone/restore/resize/backup for each backend profile

## 12. Risks and Mitigations

1. Risk: migration breakage for existing GCP installs.
   - Mitigation: compatibility wrapper + staged deprecation + migration guide.
2. Risk: module explosion and interface drift.
   - Mitigation: strict module contracts and capability schema tests.
3. Risk: hidden simplyblock assumptions remain in addons.
   - Mitigation: add CI checks forbidding unconditional simplyblock dependencies outside `storage/simplyblock`.
4. Risk: state-backend migration causes operational confusion.
   - Mitigation: publish backend migration runbook and explicit backend template examples.
5. Risk: provider behavior differences cause support burden.
   - Mitigation: profile-based support matrix and conformance certification per provider/backend combo.

## 13. Deliverables

1. New modular Terraform layout (`core`, `infra`, `storage`, `gateway`, `dns`, `observability`).
2. Root variable and output contract v2.
3. Compatibility mapping for legacy GCP/simplyblock inputs.
4. Internal-only install path without public DNS/cert requirements.
5. Documentation:
- migration guide
- provider/backend support matrix
- example tfvars for homelab and HA deployments

## 14. Open Questions

1. Should `existing-cluster` become the default provider for all profiles except explicit cloud profiles?
2. Is `generic-csi` sufficient as default backend for `single-node-dev`, or should `zfs` be preferred where available?
3. Which provider/backend combinations are officially supported in first GA profile matrix?
4. Should profile enforcement be hard-fail by default in Terraform (`strict`) or warning mode initially?
5. Should transitional compatibility wrappers be maintained across one or two minor releases?

## 15. Decision

Adopt a provider-agnostic, module-contract-driven Terraform architecture with optional simplyblock storage backend selection, aligned to controller storage capability abstraction and internal-first deployment principles.
