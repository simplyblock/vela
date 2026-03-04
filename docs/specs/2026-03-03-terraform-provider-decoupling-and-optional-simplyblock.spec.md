# Spec: Terraform Provider Decoupling and Optional simplyblock

- RFC: `docs/rfcs/2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.md`
- Depends on: profiles, storage backend abstraction, capability manifest

## Implementation Context

Current coupling in root Terraform:

1. `vela-terraform/main.tf` pins `backend "gcs"` and Google provider requirements.
2. `vela-terraform/provider.tf` configures only Google provider.
3. `vela-terraform/variables.tf` uses GCP-centric variables (`project_id`, `region`, `zone`, etc.).

## Invariants

1. Root module MUST support non-GCP operation.
2. simplyblock MUST be optional and only instantiated when selected.
3. Existing configs MUST remain deployable via compatibility wrapper inputs.

## Files and Modules

1. Refactor `vela-terraform/main.tf` and `provider.tf` into provider-neutral root plus provider submodules.
2. Add `providers/<name>/` modules (at minimum keep current gcp path).
3. Add backend/storage mode modules under `vela-terraform/storage/`.
4. Make `vela-terraform/addons/simplyblock.tf` conditional by selected storage backend.

## Ordered Commit Plan

1. Commit 1: introduce new variable model (provider object, storage object, profile).
2. Commit 2: compatibility locals mapping legacy vars to new model.
3. Commit 3: conditional module instantiation and provider decoupling.
4. Commit 4: remove hard `gcs` backend default from root template and document pluggable state backend patterns.
5. Commit 5: CI matrix for provider/backend combinations.

## Config Contract

1. Root variable `infra_provider` and nested `provider_config`.
2. Root variable `storage_backend` and nested backend-specific config.
3. Validation blocks MUST reject incompatible combinations.

## Compatibility Matrix

1. Legacy GCP vars only -> map to new provider object and warn.
2. Non-simplyblock backend -> no simplyblock resources in plan.
3. Internal-only profile -> no public DNS/gateway requirements.

## Verification Protocol

1. `cd vela-terraform && terraform fmt -check`
2. `cd vela-terraform && terraform init -backend=false`
3. `cd vela-terraform && terraform validate`
4. Plan matrix tests to assert resource presence/absence by mode.

## Definition of Done

1. Terraform can validate and plan without GCP-specific required inputs.
2. simplyblock resources are truly optional in plan.
3. Legacy tfvars still function via compatibility mapping.
