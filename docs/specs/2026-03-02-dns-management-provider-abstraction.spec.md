# Spec: DNS Management Provider Abstraction

- RFC: `docs/rfcs/2026-03-02-dns-management-provider-abstraction.md`
- Depends on: profiles, capability manifest

## Implementation Context

1. DNS/provider assumptions currently live in deployment code paths.
2. Internal-only profiles should not require DNS automation.

## Invariants

1. DNS manager mode `disabled` MUST be a valid non-error path.
2. Provider operations MUST be idempotent.
3. Provider-specific failures MUST return provider-specific remediation.

## Files and Packages

1. Add `vela-controller/src/deployment/dns/providers/` with base interface + adapters.
2. Refactor existing DNS calls in `vela-controller/src/deployment/__init__.py` to use provider registry.
3. Add status endpoint in `vela-controller/src/api/system.py` (dns mode/capabilities/health).
4. Add terraform vars and module conditions in `vela-terraform/variables.tf` and relevant addon/network modules.

## Ordered Commit Plan

1. Commit 1: provider interface + disabled provider.
2. Commit 2: migrate current provider (Cloudflare) into adapter.
3. Commit 3: registry wiring and settings/API exposure.
4. Commit 4: Terraform profile mapping and validation.

## Config Contract

1. `dns.manager`: `disabled|cloudflare|rfc2136` (v1 allowed set can be subset).
2. `dns.zone`, `dns.credentials_secret_ref`, `dns.ttl` optional/required by provider capability.
3. Health endpoint MUST return provider, capability flags, and last error (if any).

## Verification Protocol

1. `cd vela-controller && pytest -q tests/dns`
2. Integration: ensure create/update/delete records are idempotent for active provider.
3. Integration: `disabled` mode does not block branch creation in internal-only exposure.
4. `cd vela-terraform && terraform validate` with each DNS manager mode fixture.

## Definition of Done

1. No generic code path directly hardcodes Cloudflare logic.
2. DNS can be disabled safely.
3. API and preflight reflect DNS capability state.
