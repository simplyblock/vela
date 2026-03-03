# RFC: DNS Management Provider Abstraction for Self-Hosted Vela

- Status: Draft
- Target release: Phased

## 1. Summary

Introduce a DNS management abstraction in `vela-controller` so Vela can support external branch hostnames without
hard-coding Cloudflare. Cloudflare remains the first built-in manager implementation, while DNS behavior is selected by
a configured DNS manager implementation.

The manager contract is intent-driven: controller supplies branch DNS intent, and the manager chooses concrete record
types (`A`/`AAAA`/`CNAME`/`TXT`) according to capabilities and provider behavior.

This RFC defines both product behavior and the technical implementation contract.

## 2. Motivation

Current DNS automation is tightly coupled to Cloudflare assumptions, which creates avoidable friction for self-hosted
users:

- forced vendor coupling even when DNS is managed elsewhere
- hidden branching between "DNS managed" and "no DNS managed" deployments
- limited extensibility for enterprise/on-prem DNS policies

We need a clean DNS manager abstraction with explicit capability and failure semantics.

## 2.1 Current implementation verification (source-code aligned)

Observed in current `vela-controller` code:

1. DNS logic is embedded directly in `src/deployment/__init__.py` (`_create_dns_record`, `_delete_dns_records`,
   `cleanup_branch_dns`, `provision_branch_endpoints`), not in a provider abstraction.
2. Deployment settings require `cloudflare` config unconditionally (`src/deployment/settings.py`), so a truly
   DNS-disabled installation cannot start without Cloudflare-shaped env vars.
3. Endpoint route provisioning and DNS record provisioning are coupled in one function (`provision_branch_endpoints`),
   which makes non-DNS deployments and provider swapping harder.
4. DNS record creation currently uses create-only behavior, not provider-agnostic idempotent upsert semantics.
5. Record ownership metadata is not persisted; cleanup lists by `name+type` and deletes all matches, which risks
   deleting records not created by Vela when names overlap.
6. Delete flow logs DNS cleanup errors but continues, so leaked DNS records are possible without a deterministic retry
   queue.
7. `branch_db_domain(...)` depends on Cloudflare domain suffix and raises if unset; multiple API response paths use it,
   which currently prevents clean `disabled` DNS behavior.
8. Current branch DNS uses fixed patterns (`<branch_ulid>.<suffix>` for API, `db.<branch_ulid>.<suffix>` for DB) and
   fixed record targets from settings (`branch_ref`, `branch_db_ref`).
9. Current Cloudflare behavior uses `CNAME` for both API and DB records (`DATABASE_DNS_RECORD_TYPE="CNAME"`), so RFC
   requirements must not assume `AAAA` for DB in v1 parity mode.

## 3. Goals

1. Decouple controller DNS workflows from Cloudflare-specific logic.
2. Support DNS manager implementation selection: `disabled`, `cloudflare`, and custom Python manager drivers.
3. Keep branch lifecycle operational when DNS automation is disabled.
4. Expose DNS integration state and health through API for Studio.
5. Make Terraform/profile configuration explicit and validated.
6. Implement the abstraction as Python code in `vela-controller` with an extension mechanism for future DNS managers.
7. Use high-level branch-intent operations as the primary DNS manager API.
8. Preserve current hostname shape and Cloudflare behavior during migration unless explicitly reconfigured.

## 4. Non-Goals

1. Implementing every DNS manager implementation in this RFC.
2. Replacing ingress/gateway path routing behavior.
3. Supporting non-Kubernetes deployment models.

## 4.1 Capabilities model

DNS manager implementations must report explicit capabilities. Initial capability flags:

- `supports_a_records`: Can manage `A` records.
- `supports_aaaa_records`: Can manage `AAAA` records.
- `supports_cname_records`: Can manage `CNAME` records.
- `supports_txt_records`: Can manage `TXT` records.
- `supports_wildcard_records`: Can manage wildcard hostnames (`*.example.com`).
- `supports_proxied_records`: Can configure provider-specific proxy/CDN behavior for records.
- `supports_ownership_tags`: Can store/query ownership metadata/tags for managed record lifecycle.

These capabilities drive:

- Controller behavior (enforce, reject, or degrade).
- Studio UX (show/hide/gate DNS features and remediation hints).

## 5. Proposed Model

## 5.1 DNS manager implementation selection

- `disabled`: no DNS automation; platform endpoints remain internal/operator-managed.
- `cloudflare`: Vela manages records through Cloudflare API.
- `python` (custom): Vela loads a configured Python DNS manager implementation.

`disabled` is valid for setups that do not expose branch domains publicly.

## 5.2 Required and optional behavior

- DNS automation is optional.
- If external branch hostname exposure is requested by profile/policy, selected DNS manager implementation must not be
  `disabled`.
- Controller must fail fast in `strict` policy when DNS is required but unavailable.

## 5.3 Resource ownership

Controller owns only records it creates, identified via deterministic record naming and metadata/tags where supported.

## 5.4 Implementation requirement (Python)

- DNS abstraction MUST be implemented as Python interfaces/classes, not only documentation-level contracts.
- DNS manager selection MUST resolve to Python implementation classes through a registry.
- Adding a DNS manager MUST be possible without changing orchestration flow (`DNSService`), only by implementing the
  manager contract and registering it.

## 6. Functional Behavior

## 6.1 DNS automation disabled (`disabled` manager)

- Controller skips DNS reconciliation.
- Branch metadata still includes internal service endpoints.
- Studio shows DNS module as `disabled` with non-blocking warning when public hostname features are unavailable.

## 6.2 DNS enabled

- On branch creation/update, controller submits branch DNS intent and manager reconciles required DNS records.
- Manager selects concrete record set (`A`/`AAAA`/`CNAME`/`TXT`) based on capabilities and provider behavior.
- On branch deletion, controller removes owned records.
- On manager/API failure, state is `degraded` and behavior follows integration policy.

## 7. API and Config Changes

## 7.1 Settings

- `vela_dns_manager` (`disabled|cloudflare|python`)
- `vela_dns_manager_config_ref` (optional generic config/secret reference for manager-specific settings)
- `vela_dns_manager_driver` (Python import path to manager class; required when `vela_dns_manager=python`)
- `vela_dns_zone` (required when `vela_dns_manager != disabled` unless manager provides fixed-zone behavior)
- `vela_dns_ttl_seconds` (default TTL for managed records)
- `vela_dns_policy` (`strict|best_effort`) (inherits from global integration policy if unset)

Compatibility/migration requirements:

1. Existing `vela_cloudflare__*` settings remain accepted in Phase A via compatibility adapter.
2. When `vela_dns_manager=cloudflare`, controller maps generic DNS settings + Cloudflare-specific config to the
   provider.
3. When `vela_dns_manager=disabled`, Cloudflare-specific settings must be optional and not validated at startup.
4. Settings validation must fail fast only when selected manager requires missing config.

## 7.2 API endpoint additions

Extend `GET /platform/system/integrations` with DNS module details:

- `name=dns`
- `state` (`enabled|disabled|degraded`)
- `source` (`disabled|cloudflare|python|n/a`)
- `capabilities` (for example wildcard support)
- `warnings`

## 8. Controller Changes

1. Add DNS manager interface and manager registry.
2. Extract Cloudflare implementation into manager adapter from `src/deployment/__init__.py`.
3. Split endpoint provisioning into:
   - route/plugin provisioning (gateway-only),
   - DNS record reconciliation (provider-managed).
4. Introduce deterministic record ownership persistence in PostgreSQL for providers without native ownership tags.
5. Replace create-only DNS calls with idempotent apply semantics.
6. Add DNS reconcile retry queue/job for deferred cleanup and drift correction.
7. Emit DNS-specific events and health status.
8. Add pluggable Python manager loading for `python` mode with startup validation.
9. Use async `create_branch_records` / `delete_branch_records` as primary manager operations.
10. Make `branch_api_domain` / `branch_db_domain` domain resolution provider-aware and safe when DNS is disabled.

## 8.1 Required code changes by file (current layout)

1. `src/deployment/settings.py`
   - make Cloudflare config optional.
   - add generic DNS manager settings and provider-specific sub-config models.
2. `src/deployment/__init__.py`
   - remove direct Cloudflare DNS calls from `provision_branch_endpoints` and `cleanup_branch_dns`.
   - split route/Kong logic into route provisioner module.
   - replace domain helper coupling to Cloudflare settings with DNS service aware host resolution.
3. `src/api/organization/project/branch/__init__.py`
   - ensure public response host resolution does not throw when DNS manager is `disabled`.
   - consume DNS state/host metadata from persisted ownership state or manager outputs where needed.
4. `src/models/...` + migration
   - add `dns_record_ownership` SQLModel + Alembic migration.
5. `src/api/...`
   - add/extend integrations status endpoint to report DNS manager state/capabilities/warnings.
6. `src/deployment/dns/*` (new)
   - service, registry, provider interfaces, disabled/cloudflare providers, state store.

## 9. Studio Changes

1. Show DNS module state/source in system integrations UI.
2. Gate public-domain-specific UX if DNS manager is `disabled` or DNS state is `degraded`.
3. Show clear remediation hints for misconfiguration.

## 10. Terraform and Profile Mapping

`vela-terraform` profile resolution should map DNS intent to infrastructure:

- `disabled` -> no external DNS resources
- `cloudflare` -> provision/validate Cloudflare tokens, zone settings, and managed record path
- `python` -> require manager config secret/reference, Python driver reference, and preflight connectivity/contract
  checks

Profiles should declare whether public branch hostnames are required.

## 11. Rollout Plan

Phase A:

- define interface + Cloudflare adapter extraction
- add DNS manager selection settings + health/status API
- add compatibility layer for current Cloudflare settings and current hostname conventions

Phase B:

- implement custom Python manager driver path
- add Studio module state UX and remediation
- split route provisioning from DNS reconciliation
- add ownership persistence and cleanup retry job

Phase C:

- add conformance tests and migration tooling for existing Cloudflare users
- switch default internal callsites to manager API only (remove direct Cloudflare code paths)

## 12. Testing Plan

1. Unit:
   - manager registry selection
   - strict vs best-effort behavior
   - ownership tagging and cleanup planning
2. Integration:
   - branch create/update/delete with `disabled`, `cloudflare`, `python`
   - degraded manager behavior and retry semantics
3. E2E:
   - public hostname availability with managed DNS
   - Studio status and feature gating

## 13. Risks and Mitigations

1. Risk: leaked DNS records on failures.
   - Mitigation: deterministic ownership keys + periodic reconciliation + cleanup jobs.
2. Risk: manager contract too narrow for future backends.
   - Mitigation: capability model + versioned interface.
3. Risk: migration regressions for existing Cloudflare installs.
   - Mitigation: compatibility mode and phased migration validation.

## 14. Open Questions

1. Which record types are mandatory in v1 (`A/AAAA/CNAME/TXT`)?
2. Do we require wildcard support for all managers in v1?
3. Should DNS policy be global-only or overridable per workspace/project?
4. How much drift correction should happen automatically vs manual approval?

## 15. Decision

Adopt a manager-based DNS abstraction with Cloudflare as first implementation, preserving optional DNS automation and
explicit, policy-aware behavior for self-hosted installations.

## 16. Technical Specification

### 1. Scope

This document defines the controller-level DNS abstraction API, manager lifecycle, reconciliation flow, data model, and
Cloudflare adapter requirements.

It standardizes how branch DNS records are created, updated, validated, and deleted independently of a specific DNS
manager implementation.

Implementation requirement: this abstraction MUST exist as Python code in `vela-controller` (interfaces, registry,
orchestration service, and manager implementations).

### 2. Architecture

### 2.1 Components

- `DNSService`: orchestrates reconcile operations and manager selection.
- `DNSProvider` implementations: manager-specific API logic.
- `DNSRegistry`: resolves configured manager implementation from settings.
- `DNSStateStore`: persists record ownership metadata and reconcile status in PostgreSQL (when manager tags are
  insufficient).
- `EndpointRouteProvisioner`: handles gateway/Kong HTTPRoute and plugin provisioning independent of DNS manager.

### 2.2 Manager implementation selection

- `disabled`: registry returns `DisabledDNSProvider`.
- `cloudflare`: registry returns `CloudflareDNSProvider`.
- `python`: registry dynamically loads configured Python DNS implementation.

### 2.3 Proposed Python module layout

```text
vela-controller/src/deployment/dns/
  __init__.py
  service.py
  registry.py
  errors.py
  models.py
  state_store.py
  providers/
    __init__.py
    base.py
    disabled.py
    cloudflare.py
```

Custom `python` manager implementations MUST implement `DNSProvider` and be loadable from a Python import path
configured via settings.

### 3. Data Model

### 3.1 Record identity

A managed DNS record is identified by:

- `zone`
- `name` (FQDN)
- `type` (`A|AAAA|CNAME|TXT`)
- `routing_key` (optional, manager-specific)
- `owner_id` (deterministic: `vela:{project_id}:{branch_id}:{service_id}`)

### 3.1.1 PostgreSQL ownership state (required for v1)

```sql
CREATE TYPE dns_record_status AS ENUM ('applied', 'deleting', 'error');

CREATE TABLE dns_record_ownership (
  id BIGSERIAL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  project_id CHAR(26) NOT NULL,
  branch_id CHAR(26) NOT NULL,
  owner_id TEXT NOT NULL,
  manager_name TEXT NOT NULL,           -- disabled|cloudflare|python:<driver>
  zone TEXT NOT NULL,
  fqdn TEXT NOT NULL,
  record_type TEXT NOT NULL,            -- A|AAAA|CNAME|TXT
  content TEXT NOT NULL,
  provider_record_id TEXT,
  status dns_record_status NOT NULL DEFAULT 'applied',
  last_error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manager_name, zone, fqdn, record_type, content)
);

CREATE INDEX dns_record_ownership_owner_idx
  ON dns_record_ownership (owner_id, manager_name, status);

CREATE INDEX dns_record_ownership_branch_idx
  ON dns_record_ownership (organization_id, project_id, branch_id, updated_at DESC);
```

### 3.2 Branch intent and desired record model

```python
from dataclasses import dataclass
from typing import Literal, Optional

RecordType = Literal["A", "AAAA", "CNAME", "TXT"]


@dataclass(frozen=True)
class BranchDNSIntent:
    zone: str
    owner_id: str
    branch_id: str
    api_hostname: str
    db_hostname: str
    api_target_hostname: Optional[str] = None
    api_target_ipv4: Optional[str] = None
    api_target_ipv6: Optional[str] = None
    db_target_hostname: Optional[str] = None
    db_target_ipv4: Optional[str] = None
    db_target_ipv6: Optional[str] = None
    proxied: Optional[bool] = None
    ttl_seconds: int = 1


@dataclass(frozen=True)
class DNSDesiredRecord:
    zone: str
    name: str
    record_type: RecordType
    content: str
    ttl_seconds: int
    proxied: Optional[bool] = None
    owner_id: str = ""
```

### 4. Manager Interface

```python
from dataclasses import dataclass
from typing import Literal, Protocol, Sequence

DNSManagerImplementation = Literal["disabled", "cloudflare", "python"]


@dataclass(frozen=True)
class DNSProviderCapabilities:
    supports_a_records: bool
    supports_aaaa_records: bool
    supports_cname_records: bool
    supports_wildcard_records: bool
    supports_proxied_records: bool
    supports_txt_records: bool
    supports_ownership_tags: bool


@dataclass(frozen=True)
class DNSProviderHealth:
    ready: bool
    message: str


@dataclass(frozen=True)
class DNSRecordRef:
    manager_record_id: str
    zone: str
    name: str
    record_type: str


@dataclass(frozen=True)
class BranchDNSApplyResult:
    owner_id: str
    records: Sequence[DNSRecordRef]


class DNSProvider(Protocol):
    def manager_name(self) -> str:
        ...

    def capabilities(self) -> DNSProviderCapabilities:
        ...

    async def health(self) -> DNSProviderHealth:
        ...

    async def validate_config(self) -> None:
        ...

    async def create_branch_records(self, intent: BranchDNSIntent) -> BranchDNSApplyResult:
        ...

    async def delete_branch_records(self, zone: str, owner_id: str) -> None:
        ...

    # Optional low-level primitives for reconciliation/debugging paths.
    async def upsert_record(self, record: DNSDesiredRecord) -> DNSRecordRef:
        ...

    async def delete_record(self, ref: DNSRecordRef) -> None:
        ...

    async def list_managed_records(self, zone: str, owner_id: str) -> Sequence[DNSRecordRef]:
        ...
```

### 4.1 Manager registration and loading

```python
from importlib import import_module
from typing import Type


def load_manager_class(driver_path: str) -> Type[DNSProvider]:
    # Example: "my_pkg.my_dns.CustomDNSProvider"
    module_name, class_name = driver_path.rsplit(".", 1)
    module = import_module(module_name)
    manager_cls = getattr(module, class_name)
    return manager_cls
```

Registry behavior:

- built-in managers (`disabled`, `cloudflare`) are statically registered
- custom `python` manager is loaded from `vela_dns_manager_driver`
- startup MUST fail in `strict` mode if the driver cannot be imported or does not implement the interface
- startup MAY mark DNS as `degraded` in `best_effort` mode if load/validation fails

### 5. Reconciliation Flow

### 5.1 Branch create/update

1. Build `BranchDNSIntent` from gateway exposure model and deterministic hostname rules.
2. Resolve manager implementation via registry.
3. Validate manager health/config (cached + periodic refresh).
4. Call `create_branch_records(intent)`; manager chooses concrete record mix by capabilities and target shape.
5. Persist mapping of branch/owner to manager record refs from `BranchDNSApplyResult` in PostgreSQL.
6. Emit success/failure event with per-record status.

### 5.2 Branch delete

1. Resolve manager implementation.
2. Call `delete_branch_records(zone, owner_id)` for deterministic ownership cleanup.
3. Remove persisted refs (or mark `deleting`/`error` and enqueue retry on failure).
4. Emit cleanup event.

### 5.3 Drift correction

Periodic reconcile rebuilds branch intent and compares desired/applied record state, using low-level manager primitives
where needed, then self-heals mismatch.

### 6. Error Handling and Policy

Error classes:

- `DNSConfigurationError`: invalid config/credentials.
- `DNSManagerUnavailableError`: transport/auth/manager outage.
- `DNSOperationError`: upsert/delete failures.

Policy behavior:

- `strict`: fail operation/startup when DNS is required and manager is unhealthy.
- `best_effort`: mark module `degraded`, continue core branch lifecycle, and retry DNS asynchronously.

### 7. Cloudflare Adapter Requirements

### 7.1 Inputs

- API token secret reference
- Zone ID or zone name
- Optional `proxied` default
- TTL default

### 7.2 Behavior

- Use Cloudflare record APIs to upsert/delete records idempotently.
- Prefer tagging/metadata for ownership where available; otherwise rely on deterministic naming + state store.
- Support `A`, `AAAA`, `CNAME`, `TXT` in v1.
- Respect Cloudflare-specific constraints (for example proxied mode applicability).
- Preserve current parity mode defaults:
  - API hostname record: `CNAME` to configured `branch_ref`.
  - DB hostname record: `CNAME` to configured `branch_db_ref` (current implementation behavior).

### 7.3 Health checks

- Validate token scope and zone access on startup.
- Periodically refresh manager health.

### 8. Configuration Contract

Required settings:

- `vela_dns_manager`
- `vela_dns_manager_driver` (required for `python`)
- `vela_dns_zone` (unless manager supplies fixed-zone behavior)
- manager credential/config references

Optional settings:

- `vela_dns_ttl_seconds`
- manager-specific tuning

### 9. Observability

Metrics:

- `vela_dns_reconcile_total{manager,result}`
- `vela_dns_reconcile_duration_seconds{manager}`
- `vela_dns_records_managed{manager}`
- `vela_dns_manager_health{manager}`

Logs/events:

- manager selection
- reconcile plan
- upsert/delete outcomes
- degraded and recovered states

### 10. Security

- Credentials are read from Kubernetes secrets only.
- No manager secrets in logs/events.
- Least-privilege token scopes are required and validated.

### 11. Migration

1. Introduce abstraction behind existing behavior with Cloudflare adapter.
2. Migrate existing Cloudflare code paths to `DNSService`.
3. Run dual-path validation in test environments.
4. Remove direct Cloudflare calls from feature handlers.
5. Make Cloudflare settings optional unless manager selection requires Cloudflare.
6. Migrate delete cleanup from best-effort logs-only to retryable ownership-driven jobs.

### 12. Conformance Tests

Manager conformance suite must verify:

1. config validation and health reporting
2. idempotent `create_branch_records` for identical intent
3. `delete_branch_records` semantics
4. ownership isolation (no deletion of non-owned records)
5. behavior under temporary manager failures
6. async safety and idempotency under concurrent reconcile calls for same `owner_id`
7. parity fixtures for current Cloudflare hostname/record-shape defaults
