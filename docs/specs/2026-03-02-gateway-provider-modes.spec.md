# Spec: Gateway Provider Modes

- RFC: `docs/rfcs/2026-03-02-gateway-provider-modes.md`
- Depends on: profiles, capability manifest

## Implementation Context

1. Existing behavior is Kong-centric in controller and Terraform addons.
2. Different self-hosted environments require Gateway API, Ingress, or no gateway.

## Invariants

1. Provider mode selection MUST be explicit and validated.
2. Non-Kong modes MUST NOT create Kong resources.
3. `disabled` mode MUST work with internal-only exposure.

## Files and Packages

1. Add `vela-controller/src/deployment/gateway/providers/` interface + adapters.
2. Refactor gateway creation logic in `vela-controller/src/deployment/__init__.py`.
3. Add gateway integration status endpoint in `vela-controller/src/api/system.py`.
4. Update Terraform addons (`vela-terraform/addons/kong.tf`) to be conditional by mode.

## Ordered Commit Plan

1. Commit 1: provider interface, mode enum, capability flags.
2. Commit 2: Kong adapter extraction and parity tests.
3. Commit 3: gateway_api/ingress/disabled adapters.
4. Commit 4: API/status and Terraform mode wiring.

## Mode Contract

1. `gateway.provider`: `kong|gateway_api|ingress|disabled`.
2. Provider capability flags include at least: `tls_termination`, `wildcard_host`, `path_routing`, `auth_plugin`.
3. Missing required capability for selected exposure mode MUST fail strict preflight.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/gateway`
2. Integration matrix for all modes with synthetic branch endpoint reconciliation.
3. Negative tests for CRD/controller missing in selected mode.
4. `cd vela-terraform && terraform validate` with mode fixtures.

## Definition of Done

1. Gateway behavior is provider-driven and decoupled from Kong internals.
2. Existing Kong deployments retain compatibility.
3. Mode and capability are visible via API and preflight output.
