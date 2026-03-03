# RFC: Internal-First Endpoint Exposure for Self-Hosted Vela

- Status: Draft
- Target release: Phased

## 1. Summary

Make external endpoint exposure optional and disabled by default for self-hosted Vela.

Default deployment behavior should be:

- Vela services and branch endpoints operate inside cluster/LAN only.
- Public ingress/DNS/TLS automation is enabled only when explicitly requested.

This reduces installation complexity and allows operators to validate a working private deployment before exposing services publicly.

## 2. Motivation

Many self-hosted deployments fail early because they are forced to solve public ingress, DNS, and certificate automation during initial installation.

Internal-first defaults improve reliability by:

- minimizing required external dependencies for day-0 install
- reducing failure surface in bootstrap
- allowing staged rollout from private validation to public exposure

## 2.1 Current implementation verification (source-code aligned)

Observed in current `vela-controller` and `vela-terraform` code:

1. Branch endpoint provisioning (`src/deployment/__init__.py::provision_branch_endpoints`) currently always performs
   gateway route reconciliation, Kong plugin reconciliation, and external Cloudflare DNS record creation.
2. DNS helpers (`branch_api_domain`, `branch_db_domain`, `branch_rest_endpoint`) are Cloudflare-domain based and not
   exposure-mode aware.
3. Deployment settings currently require Cloudflare configuration (`src/deployment/settings.py`), so a true
   DNS-disabled internal-only path is not represented in the settings contract.
4. Branch API payload currently exposes a single `service_endpoint_uri`; there is no internal/public channelized model.
5. No `GET /platform/system/integrations` endpoint currently exists to report exposure mode/state.
6. Terraform addons currently require public-domain inputs and provision cert-manager + Let's Encrypt DNS issuer +
   public Kong Gateway by default.
7. Current Terraform network rules expose broad external access (including NodePort range), which conflicts with an
   internal-first default posture.
8. Current runtime has only incidental internal fallback behavior (using DB host when dedicated API domain is absent),
   not a formal `internal_only` mode.

## 3. Goals

1. Default to private/internal endpoint mode.
2. Keep full branch lifecycle functional in internal mode.
3. Provide explicit, reversible transition to public endpoint mode.
4. Ensure API/Studio clearly reflect current endpoint exposure mode.
5. Keep Terraform/profile behavior aligned with runtime controller behavior.
6. Preserve backward compatibility for existing public deployments mapped to `public_enabled`.

## 4. Non-Goals

1. Removing support for public ingress.
2. Defining non-Kubernetes deployment models.
3. Replacing gateway provider abstraction.

## 5. Exposure Modes

## 5.1 Modes

- `internal_only` (default)
- `public_enabled`

## 5.2 Mode semantics

`internal_only`:

- no public ingress resources are reconciled
- no external DNS automation is attempted
- endpoints are published as cluster-local and optionally LAN-reachable addresses

`public_enabled`:

- public ingress reconciliation enabled
- external DNS/cert integrations (if configured) may run
- branch public URLs are issued per configured host policy

## 6. Configuration and API

## 6.1 Settings

- `vela_endpoint_exposure_mode` (`internal_only|public_enabled`) default: `internal_only`
- `vela_endpoint_internal_base_domain` (optional internal suffix)
- `vela_endpoint_internal_publish_strategy` (`cluster_dns|node_ip|loadbalancer_internal`)
- `vela_endpoint_public_base_domain` (required when `public_enabled`)
- `vela_endpoint_public_tls_mode` (`disabled|managed|external`)
- `vela_endpoint_public_policy` (`strict|best_effort`)

Compatibility requirements:

1. Existing `cloudflare.*`, `gateway_name`, and `gateway_namespace` settings remain accepted and map to
   `public_enabled` during migration.
2. In `internal_only`, public DNS/cert settings are optional and must not block startup.
3. In `public_enabled` + `strict`, missing public prerequisites must fail fast.

## 6.2 API model changes

`GET /platform/system/integrations` should expose endpoint status:

- `name=endpoints`
- `mode` (`internal_only|public_enabled`)
- `state` (`enabled|disabled|degraded`)
- `capabilities`
- `warnings`

Branch endpoint response should include channelized endpoint data:

- `internal_url`
- `public_url` (nullable)
- `public_state` (`disabled|pending|active|degraded`)

Migration note:

- Keep existing `database.service_endpoint_uri` for compatibility, derived from `internal_url` (or preferred channel)
  until clients migrate.

## 7. Controller Design

## 7.1 Endpoint manager

Introduce an `EndpointExposureManager` that:

- resolves effective exposure mode
- reconciles internal endpoints in all modes
- conditionally reconciles public ingress in `public_enabled`
- emits clear mode/state events

## 7.2 Reconciliation behavior

In `internal_only`:

- always reconcile internal service routes
- skip public gateway route creation
- skip external DNS/certificate workflows

In `public_enabled`:

- reconcile internal and public routes
- enforce required public prerequisites by policy

Code-aligned behavior split required:

1. Internal channel:
   - cluster DNS publication always available,
   - optional NodePort/internal-LB publication based on strategy.
2. Public channel:
   - provider-managed public listener/route reconciliation,
   - provider-managed DNS/certificate workflows.
3. Failure isolation:
   - internal channel failures are blocking,
   - public channel failures follow `strict|best_effort` without breaking internal availability.

## 7.3 Policy behavior

- `strict`: block transition or reconcile if public prerequisites are missing
- `best_effort`: keep internal endpoints active and mark public path `degraded`

## 8. Gateway and DNS Integration

## 8.1 Gateway integration

Gateway provider remains required for path routing, but in `internal_only` it should be configured for internal/LAN exposure only.

Public listener configuration is activated only in `public_enabled`.

## 8.2 DNS integration

DNS provider usage is mode-dependent:

- `internal_only`: no external DNS reconcile
- `public_enabled`: DNS provider may reconcile external records when configured

Implementation constraint from current code:

- DNS and gateway flows are currently coupled in one function; they must be separated so `internal_only` can run
  without public DNS prerequisites.

## 9. Terraform and Profile Integration

## 9.1 Profile defaults

Installation profiles should default to `internal_only` unless explicitly overridden.

## 9.2 Terraform mapping

`vela-terraform` should:

- skip public ingress and DNS resources in `internal_only`
- provision internal networking artifacts required for LAN/cluster access
- conditionally deploy public ingress/DNS/cert resources in `public_enabled`
- run mode-specific preflight validations

Current-state delta to close:

1. Add exposure-mode conditionals to avoid unconditional creation of public gateway/cert-manager/Cloudflare-dependent
   resources.
2. Align network firewall defaults with internal-first posture.
3. Preserve legacy behavior via explicit migration mapping for existing public environments.

## 10. Migration and Transition

## 10.1 Existing deployments

Existing public deployments keep current behavior via explicit migration mapping to `public_enabled`.

## 10.2 Transition workflow

Recommended transition:

1. install in `internal_only`
2. validate control plane and branch lifecycle
3. configure public domain/gateway/DNS/TLS prerequisites
4. switch to `public_enabled`
5. verify public endpoint readiness

## 11. Security Considerations

- `internal_only` reduces accidental internet exposure by default.
- Public exposure transition requires explicit operator intent.
- Mode changes should be audited in controller events/logs.

## 12. Observability

Add metrics/events:

- `vela_endpoint_mode{mode}`
- `vela_endpoint_reconcile_total{channel,result}` where `channel=internal|public`
- `vela_endpoint_public_state{state}`

Also expose:

- mode source (`default|config|migration`)
- public prerequisite failure counters/events (`gateway`, `dns`, `tls`)

## 13. Testing Plan

1. Unit:
   - mode resolution and policy decisions
   - endpoint model serialization (`internal_url`/`public_url`)
2. Integration:
   - branch lifecycle in `internal_only`
   - transition `internal_only -> public_enabled`
   - failure handling for missing public prerequisites
3. E2E:
   - full private install success without public dependencies
   - staged enablement of public ingress

## 14. Risks and Mitigations

1. Risk: feature assumptions that always expect public URLs.
   - Mitigation: API contract explicitly models nullable `public_url` and public state.
2. Risk: config drift between Terraform mode and controller mode.
   - Mitigation: shared config contract and startup validation.
3. Risk: operators forget to enable public exposure and report missing behavior.
   - Mitigation: Studio/admin UX shows mode and guided transition steps.

## 15. Rollout Plan

Phase A:

- new exposure mode settings and API fields
- controller internal-only gating
- compatibility shims for existing public-domain behavior

Phase B:

- Terraform/profile mode mapping
- Studio mode visibility and guided enablement UX
- split endpoint reconciliation into internal/public channels with policy isolation

Phase C:

- migration tooling and docs for existing installations
- default-mode enforcement in installation workflows
- remove legacy unconditional public provisioning paths

## 16. Open Questions

1. Should `internal_only` be hard-default across all profiles, including HA/production profiles?
2. Which internal publish strategy should be default (`cluster_dns` vs `loadbalancer_internal`)?
3. Do we need per-project/public exposure overrides or only global mode initially?
4. Should switching to `public_enabled` require a successful public preflight gate by default?

## 17. Decision

Adopt an internal-first endpoint exposure model where self-hosted Vela defaults to private cluster/LAN operation, and public ingress is enabled later through an explicit configuration transition.

## 18. Technical Specification

### 18.1 Required controller refactor by file

1. `src/deployment/settings.py`
   - add exposure-mode settings and make public integration settings optional under `internal_only`.
2. `src/deployment/__init__.py`
   - split `provision_branch_endpoints` into internal/public reconciliation paths.
   - remove unconditional DNS/public-host assumptions from shared path.
3. `src/api/organization/project/branch/__init__.py`
   - extend branch response generation with channelized endpoint fields.
   - retain `service_endpoint_uri` compatibility mapping.
4. `src/models/branch.py`
   - extend API-facing endpoint model with `internal_url`, `public_url`, `public_state`.
5. `src/api/system.py`
   - add endpoint exposure/integration status endpoint payload.

### 18.2 Endpoint model (conceptual)

```python
from dataclasses import dataclass
from typing import Literal

PublicState = Literal["disabled", "pending", "active", "degraded"]
ExposureMode = Literal["internal_only", "public_enabled"]

@dataclass(frozen=True)
class BranchEndpointChannels:
    internal_url: str
    public_url: str | None
    public_state: PublicState
```

### 18.3 Policy matrix

1. `internal_only`
   - DNS/cert checks: skipped
   - public route reconcile: skipped
   - required outcome: valid internal endpoint channel
2. `public_enabled` + `strict`
   - DNS/gateway/TLS prerequisites: blocking
   - public failures: blocking
3. `public_enabled` + `best_effort`
   - internal channel must succeed
   - public channel may be `degraded` with actionable warnings
