# Implementation Specs Index (Implementation-Grade)

Each `*.spec.md` file is intended to be directly executable by a coding agent with minimal interpretation.

## Required execution model

1. Apply specs in dependency order.
2. Do not skip `Invariants` and `Definition of Done` sections.
3. Every spec requires: code changes, migration/contract updates (if declared), and verification commands.

## Dependency Order

1. `2026-03-03-capability-manifest-contract-for-terraform-and-preflight.spec.md`
2. `2026-03-02-opinionated-deployment-profiles.spec.md`
3. `2026-03-02-install-preflight-validation.spec.md`
4. `2026-03-02-upgrade-preflight-and-compatibility-gates.spec.md`
5. `2026-03-02-dns-management-provider-abstraction.spec.md`
6. `2026-03-02-gateway-provider-modes.spec.md`
7. `2026-03-02-internal-first-endpoint-exposure.spec.md`
8. `2026-03-02-self-hosted-storage-backend-abstraction.spec.md`
9. `2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.spec.md`
10. `2026-03-03-air-gapped-installation-and-lifecycle.spec.md`
11. `2026-03-03-kubernetes-operator-installation-and-operations.spec.md`
12. `2026-03-02-secrets-bootstrap-ux-hardening.spec.md`
13. `2026-03-02-controller-auth-apikey-vs-keycloak-device.spec.md`
14. `2026-03-02-dag-workflow-manager.spec.md`

## Shared repo anchors

- API app bootstrap: `vela-controller/src/api/__init__.py`
- System routes: `vela-controller/src/api/system.py`
- Branch flows: `vela-controller/src/api/organization/project/branch/__init__.py`
- Deployment orchestration: `vela-controller/src/deployment/__init__.py`
- DB migrations: `vela-controller/src/models/migrations/versions/`
- Terraform root/provider: `vela-terraform/main.tf`, `vela-terraform/provider.tf`, `vela-terraform/variables.tf`

## Mapping

- `2026-03-02-controller-auth-apikey-vs-keycloak-device.spec.md` -> `docs/rfcs/2026-03-02-controller-auth-apikey-vs-keycloak-device.md`
- `2026-03-02-dag-workflow-manager.spec.md` -> `docs/rfcs/2026-03-02-dag-workflow-manager.md`
- `2026-03-02-dns-management-provider-abstraction.spec.md` -> `docs/rfcs/2026-03-02-dns-management-provider-abstraction.md`
- `2026-03-02-gateway-provider-modes.spec.md` -> `docs/rfcs/2026-03-02-gateway-provider-modes.md`
- `2026-03-02-install-preflight-validation.spec.md` -> `docs/rfcs/2026-03-02-install-preflight-validation.md`
- `2026-03-02-internal-first-endpoint-exposure.spec.md` -> `docs/rfcs/2026-03-02-internal-first-endpoint-exposure.md`
- `2026-03-02-opinionated-deployment-profiles.spec.md` -> `docs/rfcs/2026-03-02-opinionated-deployment-profiles.md`
- `2026-03-02-secrets-bootstrap-ux-hardening.spec.md` -> `docs/rfcs/2026-03-02-secrets-bootstrap-ux-hardening.md`
- `2026-03-02-self-hosted-storage-backend-abstraction.spec.md` -> `docs/rfcs/2026-03-02-self-hosted-storage-backend-abstraction.md`
- `2026-03-02-upgrade-preflight-and-compatibility-gates.spec.md` -> `docs/rfcs/2026-03-02-upgrade-preflight-and-compatibility-gates.md`
- `2026-03-03-air-gapped-installation-and-lifecycle.spec.md` -> `docs/rfcs/2026-03-03-air-gapped-installation-and-lifecycle.md`
- `2026-03-03-capability-manifest-contract-for-terraform-and-preflight.spec.md` -> `docs/rfcs/2026-03-03-capability-manifest-contract-for-terraform-and-preflight.md`
- `2026-03-03-kubernetes-operator-installation-and-operations.spec.md` -> `docs/rfcs/2026-03-03-kubernetes-operator-installation-and-operations.md`
- `2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.spec.md` -> `docs/rfcs/2026-03-03-terraform-provider-decoupling-and-optional-simplyblock.md`
