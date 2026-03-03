# RFC: Gateway Provider Modes for Self-Hosted Vela

- Status: Draft
- Target release: Phased

## 1. Summary

Define a gateway-provider abstraction for self-hosted Vela so branch services can always be exposed through path-based routing, without hard dependency on Kong.

API gateway capability is required. Kong is one provider option among alternative Kubernetes-native gateway options.

## 2. Motivation

Current behavior is tightly coupled to Kong-specific assumptions. This creates unnecessary friction for environments that already standardize on other Kubernetes gateway stacks.

We need a provider model that:

- preserves required gateway behavior (branch path mapping)
- supports multiple Kubernetes gateway implementations
- keeps provider-specific logic out of core branch lifecycle code

## 2.1 Current implementation verification (source-code aligned)

Observed in current `vela-controller` code:

1. Branch endpoint provisioning is implemented in `src/deployment/__init__.py` (`provision_branch_endpoints`), which
   currently combines:
   - route generation (`HTTPRoute` resources),
   - Kong plugin creation (`KongPlugin` CRDs),
   - DNS creation.
2. Route manifests are Kubernetes Gateway API resources (`gateway.networking.k8s.io/v1`), but route behavior depends on
   Kong-specific annotations (`konghq.com/strip-path`, `konghq.com/plugins`).
3. Auth and policy behavior depends on Kong-only plugin resources, including `pre-function` Lua scripts for JWT and
   encrypted-header enforcement.
4. `KubernetesService` contains Kong-specific apply methods (`apply_kong_plugin`, `apply_kong_consumer`) and generic
   `apply_http_routes`, with no provider abstraction boundary.
5. Current settings only expose `gateway_name` and `gateway_namespace` in `src/deployment/settings.py`; no provider
   selection, policy, or class settings exist.
6. No `GET /platform/system/integrations` endpoint currently exists for gateway state reporting; this RFC must include
   implementation scope for API additions.
7. Cleanup is currently namespace-driven (branch namespace deletion), not explicit route/plugin ownership reconciliation.
8. Current required behavior is broader than path routing: JWT enforcement, encrypted-header checks, and CORS behavior
   are part of live branch security semantics.

## 3. Goals

1. Keep gateway capability mandatory for branch path routing.
2. Decouple controller logic from Kong-specific implementation details.
3. Support multiple Kubernetes gateway providers via a common contract.
4. Expose provider state/capabilities via API for Studio and operations.
5. Map provider choice cleanly into `vela-terraform` installation behavior.

## 4. Non-Goals

1. Removing Kong support.
2. Building non-Kubernetes gateway paths.
3. Standardizing every possible gateway product in v1.

## 5. Provider Model

## 5.1 Required gateway capabilities

The selected provider must satisfy:

- path-based routing for branch services
- route reconciliation on branch create/update/delete
- deterministic ownership/cleanup of managed routes
- health/status reporting consumable by controller
- request authentication/authorization enforcement equivalent to current JWT path policy
- encrypted transport/header policy enforcement equivalent to current behavior
- CORS behavior support for exposed branch APIs

## 5.2 Provider options (v1)

- `kong` (current first-class provider)
- `gateway_api` (Kubernetes Gateway API compatible provider)
- `ingress` (Ingress-compatible provider with required feature subset)
- `external` (provider implemented outside Vela with explicit contract)

`gateway_api` and `ingress` are provider families. Concrete implementations are validated through capability checks and conformance tests.

## 5.3 Capability flags

- `supports_path_routing`
- `supports_route_rewrite`
- `supports_regex_paths`
- `supports_weighted_routing`
- `supports_route_annotations`
- `supports_tls_termination`
- `supports_auth_policy_attachment`
- `supports_request_header_policy`
- `supports_cors_policy`
- `supports_shared_gateway_namespace`

Vela requires `supports_path_routing=true`. Other capabilities are feature-gated in controller/Studio.

## 6. Functional Behavior

## 6.1 Provider unavailable

- `strict`: startup/reconcile fails if no valid provider is configured.
- `best_effort`: integration state becomes `degraded`; core control plane can stay up but branch public routing operations are blocked.

## 6.2 Kong provider

- Existing Kong route management remains supported.
- Kong-only features remain available when capability checks pass.

## 6.3 Gateway API / Ingress providers

- Controller targets provider contract rather than Kong APIs.
- Provider adapters translate desired branch routing model into concrete Gateway/Ingress resources.
- Unsupported optional features are surfaced as degraded capability, not silent failure.

## 7. API and Config Changes

## 7.1 Settings

- `vela_gateway_provider` (`kong|gateway_api|ingress|external`)
- `vela_gateway_external_config_ref` (required when `vela_gateway_provider=external`)
- `vela_gateway_class_name` (required for `gateway_api|ingress` in most deployments)
- `vela_gateway_namespace` (resource namespace for managed routes)
- `vela_gateway_policy` (`strict|best_effort`) (inherits global policy when unset)

Compatibility requirements:

1. Existing `gateway_name` and `gateway_namespace` settings remain supported and map to provider config in Phase A.
2. Provider-specific required settings are validated only for selected provider.
3. `strict` mode fails startup when required provider capabilities are missing.
4. `best_effort` mode marks gateway integration `degraded` and blocks branch endpoint reconciliation.

## 7.2 Integration status API

`GET /platform/system/integrations` for `gateway` includes:

- `name=gateway`
- `state` (`enabled|disabled|degraded`)
- `source` (`kong|gateway_api|ingress|external|n/a`)
- `capabilities` (resolved provider capabilities)
- `warnings`
- `blocking`

## 8. Controller Changes

1. Introduce `GatewayProvider` interface and provider registry.
2. Keep route orchestration provider-agnostic in a central `GatewayService`.
3. Move Kong-specific logic into `KongGatewayProvider` adapter.
4. Add `GatewayAPIProvider` and `IngressProvider` adapters behind conformance gates.
5. Enforce capability checks before executing provider-dependent features.
6. Emit gateway integration health/events and startup diagnostics.
7. Separate gateway routing from DNS management (DNS handled by DNS provider subsystem).
8. Add explicit ownership tracking for provider-managed route/policy resources (for non-namespace cleanup paths).

## 8.1 Required code changes by file (current layout)

1. `src/deployment/settings.py`
   - add gateway provider mode and provider-specific config sections.
   - keep compatibility mapping for existing gateway name/namespace fields.
2. `src/deployment/__init__.py`
   - extract `HTTPRoute`/Kong plugin generation and apply logic into provider modules.
   - remove direct provider-specific branching from `provision_branch_endpoints`.
   - remove DNS coupling from gateway reconcile path.
3. `src/deployment/kubernetes/__init__.py`
   - keep low-level CRUD primitives; avoid provider semantics in this layer.
4. `src/api/system.py`
   - add gateway integration status endpoint payload (`state`, `source`, `capabilities`, `warnings`, `blocking`).
5. `src/deployment/gateway/*` (new)
   - provider interface, registry, service, kong adapter, gateway_api adapter, ingress adapter.
6. Models/migrations (new)
   - add ownership/reconcile state table for managed gateway resources when needed.

## 9. Studio Changes

1. Display gateway provider type, state, and capabilities.
2. Gate UI actions that require unavailable capabilities.
3. Show explicit remediation guidance for degraded provider state.

## 10. Terraform and Deployment Mapping

`vela-terraform` should compose gateway resources by provider mode:

- `kong` -> deploy and validate Kong modules/resources
- `gateway_api` -> deploy/validate Gateway API CRDs/controller and gateway class wiring
- `ingress` -> deploy/validate ingress controller and ingress class wiring
- `external` -> validate integration contract and controller connectivity/permissions

Profiles should declare gateway provider intent and required capabilities.

## 11. Rollout Plan

Phase A:

- provider setting + status API + provider registry
- Kong adapter extraction
- preserve current route/plugin behavior parity

Phase B:

- Gateway API adapter implementation
- Ingress adapter implementation
- Studio capability-aware UX
- add ownership-backed cleanup for non-namespace deletion scenarios

Phase C:

- Terraform/profile conformance mapping
- migration tooling from Kong-only assumptions
- remove direct Kong assumptions from shared orchestration paths

## 12. Testing Plan

1. Unit:
   - provider selection/validation
   - strict vs best-effort behavior
   - capability gating decisions
2. Integration:
   - branch route lifecycle (`create/update/delete`) for each provider type
   - degraded and recovery behavior
   - unsupported capability signaling
3. E2E:
   - path routing correctness for branch services
   - Studio feature gating by provider capability
   - API integration status correctness
   - auth/header policy parity verification against current Kong behavior

## 13. Risks and Mitigations

1. Risk: hidden Kong coupling causes regressions for other providers.
   - Mitigation: provider interface boundary + conformance test suite.
2. Risk: capability mismatch across gateway implementations.
   - Mitigation: explicit capability model and feature gating.
3. Risk: Terraform/controller configuration drift.
   - Mitigation: shared provider contract and post-apply validation.

## 14. Open Questions

1. Which optional capabilities are mandatory for GA vs preview?
2. Which Gateway API versions/controllers are supported in v1?
3. Should `ingress` provider stay first-class long-term or only transition support?
4. Do we require per-provider reconciliation rate limits/backoff tuning?

## 15. Decision

Adopt a gateway-provider architecture where API gateway capability is mandatory for branch path mapping, Kong is optional as one provider, and alternative Kubernetes gateway options are supported through a shared provider contract with capability-based feature gating.

## 16. Technical Specification

### 16.1 Proposed module layout

```text
vela-controller/src/deployment/gateway/
  __init__.py
  service.py
  registry.py
  models.py
  errors.py
  providers/
    __init__.py
    base.py
    kong.py
    gateway_api.py
    ingress.py
    external.py
```

### 16.2 Provider interface (conceptual)

```python
from dataclasses import dataclass
from typing import Protocol, Sequence


@dataclass(frozen=True)
class GatewayCapabilities:
    supports_path_routing: bool
    supports_auth_policy_attachment: bool
    supports_request_header_policy: bool
    supports_cors_policy: bool
    supports_tls_termination: bool


@dataclass(frozen=True)
class BranchRouteIntent:
    organization_id: str
    project_id: str
    branch_id: str
    namespace: str
    host: str
    enable_file_storage: bool
    jwt_secret_ref: str


@dataclass(frozen=True)
class GatewayApplyResult:
    owner_id: str
    resource_refs: Sequence[str]


class GatewayProvider(Protocol):
    def provider_name(self) -> str: ...
    def capabilities(self) -> GatewayCapabilities: ...
    async def validate_config(self) -> None: ...
    async def health(self) -> str: ...
    async def apply_branch_routes(self, intent: BranchRouteIntent) -> GatewayApplyResult: ...
    async def delete_branch_routes(self, owner_id: str) -> None: ...
```

### 16.3 Reconciliation flow

1. Build branch route intent from branch deploy context.
2. Resolve provider from registry based on settings.
3. Validate health/capabilities (cached with periodic refresh).
4. Apply provider route/policy resources.
5. Persist ownership refs for later cleanup/drift correction.
6. Emit integration and per-branch events.

### 16.4 PostgreSQL ownership state (proposed)

```sql
CREATE TYPE gateway_resource_status AS ENUM ('applied', 'deleting', 'error');

CREATE TABLE gateway_resource_ownership (
  id BIGSERIAL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  project_id CHAR(26) NOT NULL,
  branch_id CHAR(26) NOT NULL,
  owner_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  resource_kind TEXT NOT NULL,   -- HTTPRoute, KongPlugin, Ingress, Middleware, etc.
  resource_namespace TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  status gateway_resource_status NOT NULL DEFAULT 'applied',
  last_error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, resource_kind, resource_namespace, resource_name)
);

CREATE INDEX gateway_resource_ownership_owner_idx
  ON gateway_resource_ownership (owner_id, provider_name, status);
```

### 16.5 Parity constraints for phase migration

To prevent behavior regressions during provider extraction:

1. Preserve current route paths (`/rest`, `/storage`, `/pg-meta`) and strip-path behavior.
2. Preserve equivalent JWT auth policy and public storage path bypass semantics.
3. Preserve equivalent encrypted-header enforcement for `pg-meta` path.
4. Preserve CORS behavior for currently exposed routes.
