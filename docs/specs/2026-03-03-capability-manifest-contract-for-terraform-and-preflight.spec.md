# Spec: Shared Capability Manifest Contract

- RFC: `docs/rfcs/2026-03-03-capability-manifest-contract-for-terraform-and-preflight.md`
- Depends on: none
- Blocks: install preflight, upgrade preflight, profile resolver, terraform validations

## Implementation Context

1. There is no shared capability artifact today.
2. Validation logic is currently scattered across controller and Terraform assumptions.
3. This spec creates the canonical contract and parsers.

## Invariants

1. Same input context MUST produce identical decisions in Terraform and controller.
2. Unknown required fields MUST fail `strict` evaluation.
3. Manifest format MUST be versioned (`manifest_version`).

## Files and Packages

1. Add `docs/capabilities/manifest.schema.json`.
2. Add `docs/capabilities/manifest.v1.yaml` sample.
3. Add controller parser/evaluator package: `vela-controller/src/capabilities/`.
4. Add Terraform load path: `vela-terraform/capabilities/manifest.v1.yaml` (copied/generated from canonical source).

## Ordered Commit Plan

1. Commit 1: schema + sample manifest + docs.
2. Commit 2: controller parser and evaluator with unit tests.
3. Commit 3: Terraform parser/evaluator wrapper (locals + validation/check blocks).
4. Commit 4: cross-consumer golden tests proving equal decisions.

## Contract Details

1. Top-level keys required: `manifest_version`, `release`, `profiles`, `capabilities`, `constraints`, `support_levels`.
2. `support_levels` allowed values: `required`, `supported`, `experimental`, `unsupported`.
3. Constraint result contract: `pass|fail|skip` + `reason` + `evidence`.

## Verification Protocol

1. `cd vela-controller && tox -e lint,type-check,format-check`
2. `cd vela-controller && pytest -q tests/capabilities`
3. `cd vela-terraform && terraform init -backend=false`
4. `cd vela-terraform && terraform validate`
5. Run golden parity test script to compare controller vs terraform outputs for fixture contexts.

## Definition of Done

1. Shared manifest artifact exists and is validated by JSON schema.
2. Controller and Terraform produce byte-equivalent decision payload for fixture matrix.
3. All dependent specs consume this keyspace without introducing local aliases.
