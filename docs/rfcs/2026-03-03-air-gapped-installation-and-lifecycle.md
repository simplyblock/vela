# RFC: Air-Gapped Installation and Lifecycle for Self-Hosted Vela

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-03
- Related RFCs:
  - `2026-03-02-install-preflight-validation.md`
  - `2026-03-02-upgrade-preflight-and-compatibility-gates.md`
  - `2026-03-02-opinionated-deployment-profiles.md`
  - `2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.md`
  - `2026-03-03-capability-manifest-contract-for-terraform-and-preflight.md`

## 1. Summary

Define a first-class air-gapped installation and upgrade model for Vela that works without outbound internet access at runtime.

The model introduces:

1. A signed offline artifact bundle containing all required images, charts, manifests, binaries metadata, and compatibility descriptors.
2. Deterministic import tooling to populate on-prem registries/chart repos/object stores.
3. Air-gap aware install and preflight workflows for Terraform and controller.
4. A repeatable upgrade path with compatibility gating and rollback checkpoints in disconnected environments.

## 2. Motivation

Many self-hosted environments (regulated, defense, enterprise private cloud) require:

- no outbound internet from clusters/control planes
- controlled artifact ingress through security approval processes
- deterministic, auditable software supply chain

Current implementation includes internet-coupled behavior (for example remote HTTP manifests and public image/chart pulls), which blocks these environments from adoption.

## 3. Goals

1. Support day-0 install, day-2 operations, and upgrades with zero runtime internet dependency.
2. Produce a complete, verifiable artifact set per Vela release and deployment profile.
3. Enable operators to mirror/import artifacts into private infrastructure using documented tools.
4. Integrate offline checks into install and upgrade preflight.
5. Preserve profile/provider/backend compatibility and conformance validation in disconnected mode.

## 4. Non-Goals

1. Bundling arbitrary third-party enterprise integrations not required by selected deployment intent.
2. Replacing operator-owned security review or artifact approval workflows.
3. Full offline source-code build toolchain in v1 (focus is binary/image/chart distribution path).

## 5. Scope and Definitions

## 5.1 Air-gapped mode

Air-gapped mode means:

- no outbound network calls to public internet from installation host, Terraform execution host, controller, or cluster workloads
- all artifacts are resolved from operator-provided internal endpoints or local file sources

## 5.2 Deployment stages

1. Connected staging environment:
   - build/collect/release bundle artifacts
2. Transfer boundary:
   - approved media/process to move bundle into disconnected network
3. Disconnected target environment:
   - import artifacts
   - run preflight/install/upgrade using only internal sources

## 5.3 Current implementation verification (as of 2026-03-03)

The following internet-coupled behaviors are verified in the current repository and must be addressed for true air-gapped operation.

1. Terraform remote fetches and mutable sources:
   - `vela-terraform/addons/kong.tf` fetches Gateway API CRDs from GitHub via `data "http"`.
   - `vela-terraform/addons/neon-autoscaler.tf` uses remote kustomize source `github.com/simplyblock/autoscaling/...?...ref=main` (mutable).
   - `vela-controller/deployment/addons/kong.tf` contains the same remote HTTP Gateway API fetch pattern.
2. Public chart repositories are hardcoded:
   - `vela-terraform/addons/{cert-manager,kong,loki,simplyblock,stackgres}.tf`
   - `vela-controller/deployment/addons/{cert-manager,kong,loki,simplyblock,stackgres}.tf`
3. Public registry image defaults and mutable tags are present:
   - `vela-controller/chart/values.yaml` uses `docker.io/*` defaults with `latest` tags for controller/studio.
   - `vela-controller/chart/templates/auth.yaml` hardcodes `quay.io/keycloak/keycloak:26.4` and `quay.io/keycloak/keycloak:latest`.
   - `vela-controller/src/deployment/compose.yml` hardcodes multiple `docker.io/*` images for branch services.
4. Runtime endpoint provisioning currently assumes external DNS provider integration:
   - `vela-controller/src/deployment/settings.py` requires `cloudflare` settings.
   - `vela-controller/src/deployment/__init__.py` branch endpoint provisioning creates Cloudflare DNS records.
5. No first-class air-gap mode wiring exists yet:
   - no `vela_airgap_enabled` support in Terraform modules,
   - no controller/runtime setting gates for disabling outbound/internet-dependent paths.

## 6. Functional Requirements

1. Bundle must include all artifacts required by selected profile/features:
   - OCI images (controller, studio, addons, dependencies)
   - Helm charts and dependencies
   - raw Kubernetes manifests not represented by charts
   - compatibility/capability metadata
   - preflight rule metadata
2. Bundle must be integrity-protected:
   - cryptographic checksums for every file
   - signed top-level manifest
3. Installation must support internal source configuration:
   - private OCI registry
   - private chart repository or OCI chart registry
   - local filesystem fallback
4. Runtime components must not attempt internet fetches in air-gapped mode.
5. Install and upgrade preflight must fail when unresolved external dependencies remain.
6. Air-gap mode must reject mutable artifact references:
   - mutable container tags (for example `latest`)
   - mutable Git refs (for example, branch refs such as `ref=main`)
   - non-digest image references in effective manifests/values

## 7. Artifact Model

## 7.1 Bundle format

Proposed bundle container:

- `vela-bundle-<release>-<profile>.tar.zst`

Directory layout:

```text
bundle/
  manifest.yaml
  checksums.sha256
  signatures/
    manifest.sig
  metadata/
    release.json
    compatibility-matrix.json
    capabilities.yaml
    sbom.spdx.json
  images/
    oci-layout/...
  charts/
    index.yaml
    *.tgz
  manifests/
    *.yaml
  tools/
    import/
    verify/
```

## 7.2 Bundle manifest contract

`manifest.yaml` includes:

- `bundle_version`
- `release_version`
- `profile_targets`
- `feature_toggles`
- `artifacts` list with digest, size, type, source-reference
- `required_imports` (registry repo names, chart namespaces, object paths)
- `compatibility` references (profile/provider/backend)
- `dependency_lock` entries for all external upstreams resolved at bundle build time (chart versions, CRD manifest digests, kustomize source commit SHAs)

## 7.3 Artifact classes

1. `image`:
   - immutable digest-pinned OCI image references
2. `chart`:
   - chart package + dependency lock
3. `manifest`:
   - static YAML required by addons/install
4. `metadata`:
   - capability and compatibility inputs used by preflight/gating

## 8. Supply Chain and Trust

## 8.1 Integrity controls

Required:

1. sha256 checksums per artifact
2. signed bundle manifest (e.g., Cosign/Minisign/GPG-backed process)
3. digest pinning in deployment values/manifests (no mutable tags in air-gap mode)

## 8.2 Provenance and SBOM

Bundle must contain:

- SBOM for shipped images/charts
- provenance metadata mapping artifact -> source commit/release

## 8.3 Verification workflow

Before import:

1. verify signature
2. verify checksums
3. verify policy constraints (allowed registries, licenses, CVE gates if configured)

## 9. Import and Mirror Workflow

## 9.1 Import targets

1. Internal OCI registry:
   - image repositories and tags mapped to digests
2. Internal chart repository/OCI chart registry:
   - chart packages and index
3. Internal manifest source:
   - Git repo, object store, or local filesystem

## 9.2 Import command surface

Proposed CLI:

- `vela artifacts bundle create --release <version> --profile <id> --output <path>`
- `vela artifacts bundle verify --bundle <path>`
- `vela artifacts bundle import --bundle <path> --registry <url> --charts <url>`
- `vela artifacts bundle report --bundle <path> --format <text|json>`

## 9.3 Deterministic mapping

Import process produces mapping outputs:

- `image-map.yaml` (upstream -> internal digest location)
- `chart-map.yaml`
- `manifest-map.yaml`
- `addon-map.yaml` (addon/chart/module source rewrite map for Terraform paths)

Terraform/controller consume these maps to avoid hardcoded public URLs.

## 10. Terraform Integration

## 10.1 Air-gap mode input

Add root inputs:

- `vela_airgap_enabled` (`true|false`)
- `vela_artifact_manifest_path`
- `vela_internal_registry`
- `vela_internal_chart_repo`
- `vela_artifact_map_path`

## 10.2 Behavior changes

When `vela_airgap_enabled=true`:

1. forbid remote fetch resources (`data.http`, git/remote kustomize URLs, public chart repos)
2. require all module artifacts from internal sources or local paths
3. enforce digest-pinned image references
4. fail plan/apply if unresolved external artifact is referenced

## 10.3 Required refactors

1. Replace internet-fetched manifests with bundled/static local artifacts.
   - `vela-terraform/addons/kong.tf` and `vela-controller/deployment/addons/kong.tf`: remove `data.http` dependency for Gateway API CRDs and load from bundle-provided files.
2. Replace mutable remote kustomize/Git sources with immutable bundled artifacts.
   - `vela-terraform/addons/neon-autoscaler.tf`: replace `ref=main` remote source with local/bundled render or commit-pinned artifact.
3. Parameterize chart repositories and chart sources across addon modules.
   - Add variables for internal chart repo/OCI registry rewrite in:
     - `vela-terraform/addons/*.tf`
     - `vela-controller/deployment/addons/*.tf`
4. Add Terraform `check` blocks asserting no external hostnames are used in air-gap mode.
   - checks should inspect effective chart repositories, manifest URLs, and module inputs.
5. Add image rewrite contract for both control-plane and branch workload images.
   - enforce repository/tag rewrite from bundle maps for:
     - `vela-controller/chart/*`
     - `vela-controller/src/deployment/compose.yml`
     - `vela-controller/src/deployment/deployment.py` image mapping
6. Add optional offline-compatible state backend guidance/contract for Terraform execution.
   - In air-gapped mode, state backends requiring public cloud connectivity are unsupported unless privately reachable from the disconnected environment.

## 11. Controller and Runtime Integration

## 11.1 Settings

Add controller/runtime settings:

- `vela_airgap_enabled`
- `vela_artifact_source_mode` (`registry|filesystem`)
- `vela_dns_external_calls_enabled` (default false in air-gap mode)
- `vela_require_digest_pinned_images` (default true in air-gap mode)

## 11.2 Runtime behavior constraints

In air-gap mode:

1. disable/forbid code paths that call public endpoints.
2. require integration managers to be `disabled` or internally reachable.
3. ensure startup validation fails when internet-dependent providers are enabled without internal equivalents.

Required code-path changes:

1. `vela-controller/src/deployment/settings.py`
   - make Cloudflare configuration conditional on DNS mode/provider selection.
2. `vela-controller/src/deployment/__init__.py`
   - when air-gap/internal endpoint mode is enabled, skip external DNS record creation and rely on internal-only endpoint exposure strategy.
3. `vela-controller/chart/templates/auth.yaml` and related templates
   - remove hardcoded external image references and mutable tags from template literals; all images must be value-driven and overrideable.

## 12. Preflight and Compatibility Gates

## 12.1 Install preflight additions

`vela install preflight --airgap` must validate:

1. artifact manifest/signature/checksum validity
2. all required images/charts exist in internal targets
3. no unresolved external URLs in effective Terraform/rendered manifests
4. provider/profile/backend compatibility from capability manifest
5. no mutable references (`latest`, unpinned Git refs, non-digest image refs) in effective install inputs

## 12.2 Upgrade preflight additions

`vela upgrade preflight --airgap` must validate:

1. target release bundle availability and integrity
2. source->target compatibility matrix entry exists
3. rollback bundle/checkpoints present (previous release artifacts + backups)
4. internal registry/chart repo contains all target digests before rollout begins

## 13. Operational Lifecycle

## 13.1 Day-0 install

1. verify bundle
2. import artifacts
3. run air-gap preflight
4. terraform apply/install using internal sources only
5. run conformance tests

## 13.2 Day-2 scale/change

- all additional modules/features require matching bundle addendum or new release bundle

## 13.3 Upgrade

1. import target bundle
2. run upgrade preflight (air-gap)
3. apply upgrade
4. verify post-upgrade conformance
5. retain previous bundle for rollback window

## 14. Conformance and Testing

## 14.1 CI validation

For every release:

1. build bundle
2. verify bundle integrity
3. simulate disconnected install (network egress blocked)
4. execute profile conformance suite
5. assert no runtime egress attempts from controller/addon pods in air-gap profile tests

## 14.2 Required test scenarios

1. `single-node-dev` internal-only air-gap install
2. `single-node-prod-lite` air-gap install with backups/observability
3. upgrade from N to N+1 in disconnected mode
4. negative tests for missing image/chart/artifact mappings
5. negative tests for mutable references (`latest`, branch refs) when `--airgap` is enabled

## 15. Documentation Deliverables

1. Air-gap quickstart (operator workflow)
2. Security/trust model and key management
3. Artifact import runbook (registry/chart/object store examples)
4. Troubleshooting guide for common preflight failures
5. Supported matrix for `profile x provider x backend` in air-gap mode

## 16. Risks and Mitigations

1. Risk: incomplete bundle contents cause late failures.
   - Mitigation: manifest completeness checks + disconnected install CI.
2. Risk: artifact drift between bundle and deployment config.
   - Mitigation: digest pinning + strict preflight manifest reconciliation.
3. Risk: operational overhead for bundle transfer/import.
   - Mitigation: deterministic import tooling and machine-readable reports.
4. Risk: hidden outbound dependencies in code paths.
   - Mitigation: air-gap egress tests and startup assertions in air-gap mode.

## 17. Rollout Plan

Phase A:

1. define bundle format and manifest/signature/checksum contracts
2. ship bundle verify/import tooling
3. refactor obvious remote-fetch Terraform paths (`data.http`, remote kustomize refs)

Phase B:

1. add `vela_airgap_enabled` across Terraform/controller
2. implement install preflight air-gap checks
3. deliver initial supported profile (internal-only baseline) with Cloudflare/DNS external calls disabled

Phase C:

1. integrate upgrade preflight for disconnected lifecycle
2. add conformance gates in release CI
3. expand supported provider/backend matrix

## 18. Open Questions

1. Which signing technology is preferred for bundle signatures in v1?
2. Should bundle creation be centralized in release pipeline only, or supported as a local operator command?
3. Do we require per-profile bundles only, or one superset bundle with profile filtering metadata?
4. What is the minimum offline vulnerability data requirement (if any) for regulated deployments?
5. Should `ref=main` or any mutable upstream reference be hard-blocked even outside `--airgap` mode?

## 19. Decision

Adopt a signed offline artifact bundle architecture with air-gap aware install/upgrade preflight and strict internal-source enforcement across Terraform and runtime, enabling fully disconnected self-hosted Vela deployments.
