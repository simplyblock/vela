# Spec: Opinionated Deployment Profiles

- RFC: `docs/rfcs/2026-03-02-opinionated-deployment-profiles.md`
- Depends on: capability manifest contract

## Implementation Context

1. No first-class profile resolver is currently wired in controller/Terraform.
2. Current `vela-terraform/variables.tf` is GCP-centric and lacks profile object contracts.

## Invariants

1. Effective profile resolution MUST be deterministic.
2. Profile defaults MUST be overridable only by validated override keys.
3. Unsupported override combinations MUST fail in strict mode.

## Files and Packages

1. Add `vela-controller/src/profile/registry.py`, `resolver.py`, `models.py`.
2. Add `vela-controller/src/api/system.py` endpoint: `GET /system/deployment-profile/effective`.
3. Add Terraform variable: `deployment_profile` + `profile_overrides` in `vela-terraform/variables.tf`.
4. Add Terraform locals for resolved profile in `vela-terraform/main.tf` (or new `profiles.tf`).

## Ordered Commit Plan

1. Commit 1: profile schema (YAML/JSON) and fixtures.
2. Commit 2: controller resolver + API endpoint.
3. Commit 3: Terraform resolver locals and validations.
4. Commit 4: Studio consumption hooks (`apps/studio`) for profile constraints.

## Contract Details

1. Supported profiles: `single-node-dev`, `single-node-prod-lite`, `basic-ha-cluster`, `full-ha-cluster`.
2. Effective profile payload MUST include: selected profile, defaults, overrides, effective values, and violations.
3. Every profile MUST declare defaults for storage backend, gateway provider, dns mode, exposure mode.

## Compatibility Matrix

1. Legacy explicit Terraform vars + no profile: map to compatibility profile `legacy-explicit`.
2. New profile + legacy vars simultaneously: explicit vars win, warning emitted.
3. Missing profile and missing legacy vars: default to `single-node-dev`.

## Verification Protocol

1. `cd vela-controller && pytest -q tests/profile`
2. `cd vela-controller && tox -e lint,type-check`
3. `cd vela-terraform && terraform validate`
4. Execute matrix script across all profiles and assert deterministic effective config.

## Definition of Done

1. Same profile input resolves identically in controller and Terraform.
2. Profile endpoint returns capability-linked effective settings.
3. Invalid overrides return actionable errors with violated rules.
