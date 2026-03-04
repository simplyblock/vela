# RFC Impact Assessment (2026-03-03)

## Scope

This assessment covers all RFCs currently in `docs/rfcs` and evaluates each one on:

- Complexity
- Sizing (estimated implementation effort)
- Potential (strategic/platform leverage)
- Importance for local development
- Importance for self-hostability
- Open-source adoption potential

Scale: `1` (low) to `5` (high).

## Scoring Heuristics

- Higher `Complexity` and `Sizing` indicate higher delivery risk/cost.
- Higher `Potential`, `Local Dev`, `Self-Host`, and `OSS Adoption` indicate stronger impact.
- `Priority Score` is used only for ordering:
    - `Priority Score = Potential + Local Dev + Self-Host + OSS Adoption - 0.5 * (Complexity + Sizing)`

## Key Findings

- The strongest ecosystem unlocks are the decoupling/abstraction RFCs: Terraform provider decoupling, storage backend
  abstraction, gateway/DNS abstraction, and capability manifest.
- The fastest adoption wins are preflight and profile-driven UX: install preflight, upgrade gates, and opinionated
  profiles.
- Internal-first exposure is a high-leverage default change with relatively low implementation burden.
- Operator and DAG manager are strategically strong, but both are large investments and should follow foundational
  contract work.
- Air-gapped support is critical for regulated environments, but it is not the highest priority for most local-dev and
  OSS-first adoption paths.

## Ordered Table (Highest Priority First)

| Rank | RFC                                                                 | Complexity | Sizing | Potential | Local Dev | Self-Host | OSS Adoption | Priority Score |
|------|---------------------------------------------------------------------|-----------:|-------:|----------:|----------:|----------:|-------------:|---------------:|
| 1    | 2026-03-02-install-preflight-validation                             |          3 |      3 |         5 |         5 |         5 |            5 |           14.0 |
| 2    | 2026-03-02-internal-first-endpoint-exposure                         |          3 |      3 |         5 |         5 |         5 |            5 |           14.0 |
| 3    | 2026-03-02-opinionated-deployment-profiles                          |          3 |      4 |         5 |         5 |         5 |            5 |           13.5 |
| 4    | 2026-03-03-capability-manifest-contract-for-terraform-and-preflight |          3 |      3 |         5 |         4 |         5 |            5 |           13.0 |
| 5    | 2026-03-02-gateway-provider-modes                                   |          4 |      4 |         5 |         4 |         5 |            5 |           12.0 |
| 6    | 2026-03-03-terraform-provider-decoupling-and-optional-simplyblock   |          5 |      5 |         5 |         5 |         5 |            5 |           12.0 |
| 7    | 2026-03-02-self-hosted-storage-backend-abstraction                  |          5 |      5 |         5 |         5 |         5 |            5 |           12.0 |
| 8    | 2026-03-02-upgrade-preflight-and-compatibility-gates                |          4 |      4 |         4 |         4 |         5 |            4 |           11.0 |
| 9    | 2026-03-02-dns-management-provider-abstraction                      |          4 |      4 |         4 |         3 |         5 |            5 |           10.0 |
| 10   | 2026-03-02-secrets-bootstrap-ux-hardening                           |          4 |      4 |         4 |         4 |         4 |            4 |           10.0 |
| 11   | 2026-03-02-controller-auth-apikey-vs-keycloak-device                |          4 |      3 |         4 |         3 |         4 |            4 |            9.5 |
| 12   | 2026-03-03-kubernetes-operator-installation-and-operations          |          5 |      5 |         4 |         3 |         4 |            4 |            7.0 |
| 13   | 2026-03-03-air-gapped-installation-and-lifecycle                    |          5 |      5 |         4 |         2 |         4 |            3 |            5.5 |
| 14   | 2026-03-02-dag-workflow-manager                                     |          5 |      5 |         4 |         3 |         3 |            3 |            5.0 |

## Constraint-Adjusted Order (Single Machine Local, No Cloudflare, No Simplyblock)

This ordering treats your constraint as primary policy:

- Day-0 must work on one machine.
- Public DNS dependency is optional/off by default.
- Storage must not require simplyblock.

| Rank | RFC                                                                 | Why it moves here under this constraint                                                                             |
|------|---------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------|
| 1    | 2026-03-02-self-hosted-storage-backend-abstraction                  | Directly removes simplyblock lock-in and enables `zfs`/`lvm`/generic CSI paths needed for single-machine operation. |
| 2    | 2026-03-03-terraform-provider-decoupling-and-optional-simplyblock   | Makes simplyblock optional and removes provider coupling that blocks minimal local installs.                        |
| 3    | 2026-03-02-internal-first-endpoint-exposure                         | Removes Cloudflare/public ingress as day-0 requirement by defaulting to internal-only mode.                         |
| 4    | 2026-03-02-dns-management-provider-abstraction                      | Decouples DNS automation from Cloudflare and enables `disabled` DNS mode cleanly.                                   |
| 5    | 2026-03-02-opinionated-deployment-profiles                          | Enables a first-class `single-node-dev` baseline and constrains defaults around local reality.                      |
| 6    | 2026-03-02-install-preflight-validation                             | Prevents late failure by validating single-node prerequisites before install/apply.                                 |
| 7    | 2026-03-03-capability-manifest-contract-for-terraform-and-preflight | Keeps Terraform and preflight aligned on supported non-Cloudflare/non-simplyblock combinations.                     |
| 8    | 2026-03-02-gateway-provider-modes                                   | Reduces Kong-specific assumptions and allows simpler gateway paths for local deployments.                           |
| 9    | 2026-03-02-secrets-bootstrap-ux-hardening                           | Improves secure local bootstrap and reduces operator friction, but does not unblock core coupling.                  |
| 10   | 2026-03-02-upgrade-preflight-and-compatibility-gates                | Important for lifecycle safety after initial local-install path is stable.                                          |
| 11   | 2026-03-02-controller-auth-apikey-vs-keycloak-device                | Useful for automation, but not a primary blocker for single-machine bring-up.                                       |
| 12   | 2026-03-03-kubernetes-operator-installation-and-operations          | Strategic long-term operations model; not needed to unlock initial local single-machine adoption.                   |
| 13   | 2026-03-02-dag-workflow-manager                                     | Architecture quality improvement with weaker direct impact on local bootstrap constraints.                          |
| 14   | 2026-03-03-air-gapped-installation-and-lifecycle                    | High-value for regulated/offline deployments, but less relevant to first local single-machine priority.             |

## Notes on Ordering

- Ties or near-ties were ordered by near-term adoption impact and prerequisite value for other RFCs.
- Terraform decoupling and storage abstraction score very high on impact, but are placed lower in execution priority
  than preflight/profile/foundation work because of their large delivery footprint and migration risk.
- Operator and DAG manager are better sequenced after capability contracts and validation gates are in place.

## Per-RFC Assessment

### 2026-03-02-install-preflight-validation

- Strongest short-term reliability improvement for self-hosted installations.
- High local-dev value because it moves failures from runtime/apply to deterministic upfront checks.

### 2026-03-02-internal-first-endpoint-exposure

- High leverage, low-to-medium implementation cost.
- Removes public DNS/TLS as a day-0 blocker, improving successful first install rates.

### 2026-03-03-capability-manifest-contract-for-terraform-and-preflight

- Foundational contract RFC that reduces drift across Terraform and controller checks.
- Enables data-driven evolution of profiles/providers/backends.

### 2026-03-02-opinionated-deployment-profiles

- Strong productization layer for reproducibility and supportability.
- Works best when backed by preflight + capability manifest.

### 2026-03-02-gateway-provider-modes

- Key unlock for Kubernetes-native environments that do not want Kong lock-in.
- High OSS/community adoption upside through provider choice.

### 2026-03-02-dns-management-provider-abstraction

- Important for reducing Cloudflare coupling and enabling enterprise DNS policies.
- Moderately complex due to ownership/reconciliation semantics.

### 2026-03-02-upgrade-preflight-and-compatibility-gates

- Critical operational safety RFC with high production value.
- Slightly less immediate local-dev impact than install preflight.

### 2026-03-02-secrets-bootstrap-ux-hardening

- Strong security baseline and onboarding improvement.
- Moderate complexity due to migration and ownership boundaries.

### 2026-03-02-controller-auth-apikey-vs-keycloak-device

- Necessary machine-auth capability, especially for CI/agents.
- Good platform maturity improvement; moderate cross-cutting complexity.

### 2026-03-03-terraform-provider-decoupling-and-optional-simplyblock

- One of the biggest long-term adoption unlocks (cloud/provider neutrality).
- Very large migration and compatibility effort; stage carefully.

### 2026-03-02-self-hosted-storage-backend-abstraction

- Major blocker-removal for homelab/single-node and non-simplyblock users.
- High-risk, high-effort change touching runtime behavior and Studio assumptions.

### 2026-03-03-kubernetes-operator-installation-and-operations

- Strong long-term control-plane direction, but net-new subsystem with high complexity.
- Should follow stabilization of contracts, preflight, and compatibility gates.

### 2026-03-02-dag-workflow-manager

- Valuable internal architecture improvement, but lower immediate external adoption pull.
- Best introduced incrementally after core installation/compatibility improvements.

### 2026-03-03-air-gapped-installation-and-lifecycle

- Essential for regulated/disconnected environments.
- Large artifact/supply-chain workflow scope with narrower immediate OSS/local-dev benefit.

## Suggested Execution Waves

1. Wave 1 (fast adoption + foundation): install preflight, internal-first exposure, capability manifest, profiles.
2. Wave 2 (portability + safety): gateway abstraction, DNS abstraction, upgrade gates, secrets hardening, auth
   extension.
3. Wave 3 (major migrations): Terraform decoupling, storage abstraction.
4. Wave 4 (control-plane evolution): operator model, DAG manager, air-gap lifecycle hardening.

## RFC Context Summaries

### 2026-03-02-controller-auth-apikey-vs-keycloak-device

Introduces non-interactive authentication for automation clients (CLI/CI/agents) by extending controller auth beyond
human bearer-token flows, with a primary Keycloak-based approach and optional controlled API-key fallback.

### 2026-03-02-dag-workflow-manager

Proposes a generic DAG execution engine in `vela-controller` to orchestrate complex lifecycle operations (starting with
branch create variants) with persisted state, retries, compensation, and resumability.

### 2026-03-02-dns-management-provider-abstraction

Decouples DNS automation from Cloudflare by introducing a provider abstraction (`disabled`, `cloudflare`, custom Python
manager), explicit ownership tracking, and intent-driven DNS reconciliation.

### 2026-03-02-gateway-provider-modes

Defines a gateway provider contract that preserves required branch path-routing behavior while removing hard Kong
coupling, enabling multiple Kubernetes gateway implementations with capability gating.

### 2026-03-02-install-preflight-validation

Adds `vela install preflight` to validate host/cluster/provider/profile prerequisites before install or upgrade, with
strict/best-effort policy modes and machine-readable output for Terraform/CI.

### 2026-03-02-internal-first-endpoint-exposure

Makes private/internal deployment the default and requires explicit opt-in for public exposure (DNS/TLS/ingress),
reducing day-0 complexity and enabling staged rollout to public endpoints.

### 2026-03-02-opinionated-deployment-profiles

Introduces tested deployment profiles (from single-node dev to HA) as the main installation input, including defaults,
resource guidance, and compatibility constraints to improve reproducibility.

### 2026-03-02-secrets-bootstrap-ux-hardening

Defines a secure-by-default secrets model for self-hosted installs: remove insecure defaults, move sensitive values to
Kubernetes Secrets, add bootstrap/verify/rotation workflows, and clarify secret ownership.

### 2026-03-02-self-hosted-storage-backend-abstraction

Replaces simplyblock-centric storage assumptions with a capability-based backend interface, preserving simplyblock while
adding first-class `zfs`/`lvm` and fallback paths for single-host/self-hosted scenarios.

### 2026-03-02-upgrade-preflight-and-compatibility-gates

Introduces mandatory upgrade preflight gates for version-path safety, migration compatibility, addon/CRD/provider
checks, and rollback readiness before applying upgrade steps.

### 2026-03-03-air-gapped-installation-and-lifecycle

Defines a first-class disconnected deployment model using signed offline bundles, deterministic import/mirroring
workflows, and air-gap-aware install/upgrade preflight and lifecycle operations.

### 2026-03-03-capability-manifest-contract-for-terraform-and-preflight

Establishes a versioned shared capability manifest (`capabilities.yaml`) as the compatibility source of truth consumed
by both Terraform validation and controller preflight to avoid rule drift.

### 2026-03-03-kubernetes-operator-installation-and-operations

Introduces a Kubernetes Operator with CRDs for declarative install/operations, reconciliation-based drift correction,
profile/capability enforcement, and long-term lifecycle management.

### 2026-03-03-terraform-provider-decoupling-and-optional-simplyblock

Refactors `vela-terraform` into provider-agnostic module contracts and makes simplyblock optional, aligning
infrastructure composition with internal-first, multi-backend, and self-host portability goals.
