# Spec: Air-Gapped Installation and Lifecycle

- RFC: `docs/rfcs/2026-03-03-air-gapped-installation-and-lifecycle.md`
- Depends on: terraform decoupling, capability manifest, install/upgrade preflight

## Implementation Context

1. Current Terraform/addon flows fetch remote artifacts during apply.
2. Air-gapped operation requires preloaded artifacts and deterministic references.

## Invariants

1. Air-gap mode MUST perform zero required external network fetches.
2. All artifacts MUST be digest-pinned in bundle manifest.
3. Import/verification MUST be repeatable and auditable.

## Files and Packages

1. Add tooling under `scripts/airgap/` for bundle create/verify/import.
2. Add bundle manifest schema under `docs/airgap/manifest.schema.json`.
3. Add Terraform inputs in `vela-terraform/variables.tf`:
   - `airgap_mode`
   - mirror endpoints/paths
   - bundle manifest path/ref
4. Refactor remote URLs in `vela-terraform/addons/*.tf` to conditional mirror references.

## Ordered Commit Plan

1. Commit 1: manifest schema and bundle builder.
2. Commit 2: bundle verifier + import workflow.
3. Commit 3: Terraform air-gap toggles and remote-source replacement.
4. Commit 4: preflight checks for mirror completeness and digest verification.

## Artifact Contract

1. Bundle must include: OCI images, Helm charts, CRD manifests, binaries, checksums, manifest, optional signatures/SBOM references.
2. Manifest entries must include: `source`, `target`, `digest`, `size`, `kind`, `version`.

## Verification Protocol

1. Build bundle in connected environment; verify checksum/signature.
2. Import into isolated registry/object store; generate import report.
3. `cd vela-terraform && terraform validate` with `airgap_mode=true`.
4. Run install and upgrade tests in network-isolated environment.

## Definition of Done

1. End-to-end install/upgrade can run in isolated network from bundle only.
2. Any missing artifact causes deterministic preflight failure.
3. Artifact provenance/integrity evidence is retained.
