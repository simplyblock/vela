# RFC: Install Preflight Validation for Self-Hosted Vela

- Status: Draft
- Target release: Phased

## 1. Summary

Add a pre-deployment validation command that checks host and cluster prerequisites before installing or upgrading Vela.

Proposed command:

- `vela install preflight`

The command validates required capabilities for selected profile/backends (kernel, filesystem tooling, CSI, Snapshot CRDs/controllers, cgroup/runtime settings, and Kubernetes prerequisites) and produces actionable failures before deployment starts.

## 2. Motivation

Self-hosted installs fail late when prerequisites are missing or misconfigured. Typical failures appear only after Terraform apply or first branch operations.

We need a deterministic preflight gate that:

- catches hard blockers early
- warns on risky but non-blocking conditions
- maps failures directly to remediation steps

## 2.1 Current implementation verification (source-code aligned)

Observed in current codebase:

1. No install preflight command exists yet; startup path in `src/api/__init__.py` runs DB migrations and background
   monitors directly.
2. Kubernetes connectivity validation exists only as a low-level failure path in `src/deployment/kubernetes/_util.py`
   (`Kubernetes client not configured`) and is not surfaced as an explicit install gate.
3. DNS/Gateway/Cloudflare assumptions are validated late during deployment/branch operations in
   `src/deployment/__init__.py`, including hard failures like missing DNS suffix.
4. Keycloak availability is validated late in branch create flow (`Failed to connect to keycloak`) rather than during
   install gating.
5. simplyblock runtime credentials are loaded from cluster resources (`simplyblock-csi-cm`, `simplyblock-csi-secret`,
   storage class params) only when operations need them; missing/malformed data fails late.
6. Snapshot requirements are implicit in runtime/backup flows (`snapshot.storage.k8s.io/v1`,
   `VOLUME_SNAPSHOT_CLASS`/`simplyblock-csi-snapshotclass`) without dedicated pre-install validation.
7. Current Terraform flow downloads critical artifacts at apply-time (Gateway API manifest from GitHub; remote chart
   repositories; remote kustomization source), so network/artifact failures occur late unless preflight checks them.
8. Current Terraform wiring is still provider-coupled (GCP, Kong, simplyblock), so preflight must be intent-aware and
   compatible with migration RFCs (provider/profile/storage abstractions).

## 3. Goals

1. Fail fast on missing hard prerequisites.
2. Validate requirements against selected deployment profile and storage/gateway provider choices.
3. Produce machine-readable output for CI/Terraform automation.
4. Keep checks extensible as Vela capabilities evolve.
5. Support both local execution and in-cluster validation paths.
6. Reuse capability/profile/provider contracts defined by related RFCs to avoid drift.

## 4. Non-Goals

1. Auto-remediating system configuration.
2. Full benchmark/performance certification.
3. Replacing runtime health checks.

## 5. Command UX

## 5.1 CLI surface

- `vela install preflight`
- `vela install preflight --profile <name>`
- `vela install preflight --storage-backend <name>`
- `vela install preflight --gateway-provider <name>`
- `vela install preflight --format <text|json|junit>`
- `vela install preflight --policy <strict|best_effort>`
- `vela install preflight --kube-context <context>`
- `vela install preflight --terraform-vars-file <path>`

## 5.2 Exit codes

- `0`: all required checks pass (warnings allowed in `best_effort`)
- `1`: one or more required checks fail
- `2`: command/configuration/runtime error (invalid args, unreachable cluster, parser errors)

## 5.3 Output model

Each check result contains:

- `id`
- `category`
- `severity` (`error|warning|info`)
- `status` (`pass|fail|skip`)
- `scope` (`host|cluster|profile|provider`)
- `message`
- `evidence` (key facts collected)
- `remediation`
- `docs_ref`

## 6. Check Model and Architecture

## 6.1 Check categories

- `host.kernel`
- `host.filesystem`
- `host.runtime`
- `cluster.kubernetes`
- `cluster.csi`
- `cluster.snapshot`
- `provider.storage`
- `provider.gateway`
- `profile.constraints`

## 6.2 Check contract

Each check implements:

- metadata (`id`, supported contexts, required inputs)
- evaluator (`run(ctx) -> CheckResult`)
- applicability guard (skip when not relevant)

Checks are pure evaluators where possible, with no mutation side effects.

## 6.3 Execution engine

- Resolve effective install intent from args + profile + Terraform vars.
- Build check plan by applicability rules.
- Execute checks in deterministic order, with bounded parallelism for independent checks.
- Aggregate results by policy (`strict|best_effort`).

## 7. Validation Matrix (Initial)

## 7.1 Host checks

- Kernel features/modules required by selected storage backend (`zfs`, `lvm`, etc.).
- Required binaries/tools available (`zfs`, `zpool`, `lvm`, `lvcreate`, `mount`, `blkid`, etc. as applicable).
- cgroup mode/settings compatibility with Kubernetes runtime and NeonVM/autoscaling assumptions.
- File system/device prerequisites for local-path components when relevant.

## 7.2 Cluster checks

- Kubernetes version and API compatibility.
- Required CRDs installed (including snapshot CRDs).
- CSI components present and healthy for selected storage mode.
- VolumeSnapshotClass availability and default/selected class alignment.
- Required RBAC/service-account permissions for controller operations.

Concrete mandatory checks from current implementation:

1. Kubernetes client configuration resolvable (in-cluster config or kubeconfig).
2. Namespace creation/update permissions for controller-managed namespaces.
3. Gateway API CRDs available when current kong/gateway mode is selected:
   - `gatewayclasses.gateway.networking.k8s.io`
   - `gateways.gateway.networking.k8s.io`
   - `httproutes.gateway.networking.k8s.io`
4. Kong CRDs available for current controller behavior:
   - `kongplugins.configuration.konghq.com`
5. Snapshot CRDs available for clone/backup/restore paths:
   - `volumesnapshots.snapshot.storage.k8s.io`
   - `volumesnapshotcontents.snapshot.storage.k8s.io`
   - `volumesnapshotclasses.snapshot.storage.k8s.io`
6. Selected/default `VolumeSnapshotClass` exists and is usable.
7. Selected/default `StorageClass` exists and supports dynamic provisioning for target backend.
8. cert-manager CRDs/pods available if TLS/certificate automation is selected.

## 7.3 Provider/profile checks

- Storage backend capability fit for selected profile features.
- Gateway provider prerequisites (for example class/controller presence for `gateway_api`/`ingress`, Kong dependencies for `kong`).
- Profile resource floors (node count, memory/CPU minima, required labels/taints when applicable).

Concrete provider checks derived from current code paths:

1. `keycloak` endpoint/auth checks when branch/auth workflows are enabled.
2. `grafana` API reachability and credentials validity when monitoring integration is enabled.
3. DNS manager/provider prerequisites (including Cloudflare token/zone checks in current deployments).
4. simplyblock prerequisites (configmap/secret/storageclass/cluster connectivity) when backend is selected.
5. Endpoint exposure compatibility checks (`public_enabled` must have gateway + DNS prerequisites satisfied in strict
   mode).

## 8. Policy and Gating

## 8.1 Strict mode

- Any required check failure blocks install/upgrade.
- Warnings are reported but non-blocking.

## 8.2 Best-effort mode

- Required checks can be downgraded to warnings only for explicitly marked soft requirements.
- Hard safety checks remain blocking.

Default mode for installation path should be `strict`.

Hard-blocking checks (never downgraded in `best_effort`):

1. Kubernetes API unreachable or unauthenticated.
2. Missing required CRDs for selected install intent.
3. Missing required storage/snapshot classes for selected backend/profile.
4. Invalid capability/profile combination marked unsupported by capability manifest.
5. Missing critical credentials/config for selected mandatory integrations.

## 9. Terraform and CI Integration

## 9.1 Terraform integration

- `vela-terraform` executes preflight before apply when enabled.
- Preflight consumes Terraform vars/profile input to evaluate intended target state.
- Apply is blocked on preflight error in strict mode.

Current Terraform-specific preflight checks should include:

1. Remote artifact reachability and digest/availability checks for referenced Helm repos/charts/manifests.
2. Validation of required terraform inputs for selected path (for example Cloudflare vars, simplyblock vars).
3. Detection of configuration coupling hazards in current layout (Kong/simplyblock assumptions) with explicit
   remediation.

## 9.2 CI integration

- JSON/JUnit outputs support pipeline gating and artifact retention.
- A baseline preflight job can run on every infrastructure change.

## 10. Implementation Plan

## 10.1 Proposed code structure

```text
vela-controller/src/preflight/
  __init__.py
  cli.py
  engine.py
  models.py
  context.py
  policy.py
  capabilities.py
  evidence/
    kubernetes.py
    providers.py
    host.py
  reporters/
    text.py
    json.py
    junit.py
  checks/
    __init__.py
    host_kernel.py
    host_filesystem.py
    host_runtime.py
    cluster_k8s.py
    cluster_csi.py
    cluster_snapshot.py
    provider_storage.py
    provider_gateway.py
    provider_dns.py
    provider_keycloak.py
    provider_grafana.py
    profile_constraints.py
    terraform_artifacts.py
```

## 10.2 Key interfaces (Python)

```python
from dataclasses import dataclass
from typing import Literal, Protocol

CheckSeverity = Literal["error", "warning", "info"]
CheckStatus = Literal["pass", "fail", "skip"]

@dataclass(frozen=True)
class CheckResult:
    id: str
    category: str
    severity: CheckSeverity
    status: CheckStatus
    message: str
    remediation: str | None = None

class PreflightCheck(Protocol):
    id: str
    category: str

    def applicable(self, ctx: "PreflightContext") -> bool:
        ...

    def run(self, ctx: "PreflightContext") -> CheckResult:
        ...
```

## 10.3 Data sources

- Local host inspection commands (read-only).
- Kubernetes API queries (CRDs, controller health, storage classes, snapshot classes).
- Effective configuration from profile + Terraform vars + env overrides.
- Capability manifest (`capabilities.yaml`) as policy source; runtime evidence as verification source.

## 10.4 Required integration points (current repo)

1. `src/deployment/kubernetes/_util.py`
   - reuse kubeconfig resolution and API client setup for cluster checks.
2. `src/deployment/settings.py` and `src/api/settings.py`
   - validate required/optional settings per install intent, not globally hard-required legacy assumptions.
3. `src/deployment/__init__.py` and `src/deployment/simplyblock_api.py`
   - reuse provider connectivity probes (DNS/gateway/simplyblock/grafana) in read-only mode.
4. `vela-terraform/`
   - add pre-apply wrapper hook (or explicit stage) invoking preflight with vars/profile context.
5. `src/api/system.py`
   - optional endpoint to expose latest preflight summary for Studio/operations.

## 11. Security and Safety

- Preflight is read-only by default.
- No privileged mutation operations.
- Sensitive material (tokens/secrets) must not be printed in results.

## 12. Observability

- Emit summary counters per run (`pass/fail/skip` by category).
- Optionally publish structured preflight events for install diagnostics.

## 13. Testing Plan

1. Unit:
   - check evaluator logic and applicability
   - policy aggregation and exit-code behavior
   - reporter output schema stability
2. Integration:
   - simulated clusters with missing CSI/snapshot prerequisites
   - profile/provider-specific check gating
   - strict vs best-effort behavior
   - legacy/current Terraform layout validation (Kong + simplyblock + Cloudflare assumptions)
3. E2E:
   - Terraform wrapper blocks apply on hard failures
   - successful run in known-good environments
   - failure cases that currently fail late (missing snapshot CRDs, invalid simplyblock config, unreachable Keycloak)

## 14. Risks and Mitigations

1. Risk: false positives due to environment diversity.
   - Mitigation: profile-aware checks and clear applicability rules.
2. Risk: false negatives from shallow checks.
   - Mitigation: conformance suite and periodic expansion of check depth.
3. Risk: drift between preflight and runtime requirements.
   - Mitigation: derive check requirements from shared capability contracts used by runtime code.

## 15. Rollout

Phase A:

- CLI scaffold, result model, strict policy
- core cluster checks (K8s version, CRDs, CSI, snapshots)
- current-stack parity checks for Kong/Cloudflare/simplyblock assumptions

Phase B:

- host checks (kernel/filesystem/runtime)
- provider/profile-aware checks
- capability-manifest driven rule resolution

Phase C:

- Terraform/CI integration
- JUnit output and documentation hardening
- optional API/Studio surfacing of preflight summaries and historical reports

## 16. Open Questions

1. Should preflight run locally only, in-cluster only, or both by default?
2. Which checks are globally hard-blocking regardless of policy?
3. Should `vela install` always invoke preflight implicitly unless `--no-preflight` is set?
4. How should version skew checks be modeled for upgrade paths?

## 17. Decision

Adopt a first-class install preflight framework with strict default gating, extensible Python check contracts, and automation-friendly output so self-hosted Vela deployments fail early with clear remediation.
