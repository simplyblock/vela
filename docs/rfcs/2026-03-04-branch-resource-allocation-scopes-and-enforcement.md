# RFC: Branch Resource Allocation Scopes and Enforcement

- Status: Draft
- Target release: Phased
- Last updated: 2026-03-04
- Related code:
    - `vela-controller/src/api/_util/resourcelimit.py`
    - `vela-controller/src/api/organization/project/branch/__init__.py`
    - `vela-controller/src/api/resources.py`
    - `vela-controller/src/deployment/__init__.py`
    - `apps/studio/components/interfaces/Branch/ResizeBranchModal.tsx`

## 1. Summary

Define and standardize branch resource-allocation behavior across scopes (`global`, `organization`, `project`) and
enforce it consistently for create and resize operations.

This RFC also audits the current implementation and identifies concrete fixes needed to align behavior with the required
branch rules.

## 2. Branch Rules (Normative)

1. Branch deployments consume allocated resources.
2. Allocated resources are: `cpu`, `memory`, `iops`, `database_size`, `storage_size`.
3. Branch allocations can be modified.
4. Allocation limits can be set at scopes: `global`, `organization`, `project`.
5. All branch deployments in a scope contribute to that scope's allocated total.
6. Allocation-changing operations (branch create, resize) must not violate any applicable scope limit.
7. Effective available resources for a branch operation are the minimum availability across all applicable scopes.
8. Stopped branches do not consume `cpu`, `memory`, `iops`, but still consume persistent storage (`database_size`,
   `storage_size`).
9. Availability means remaining free resources in a specific scope (`limit - allocated`).
10. Allocation modification policy:
    - `storage_size`: upsize only
    - `database_size`: upsize only
    - `cpu`: upsize and downsize
    - `iops`: upsize and downsize
    - `memory`: upsize and downsize, but downsize floor is `current_usage + 20%`
11. Allocated organization resources are the sum of branch allocations in the organization (per resource type, with
    stop-state behavior from rule 8).
12. Allocated project resources are the sum of branch allocations in the project (per resource type, with stop-state
    behavior from rule 8).
13. Empty projects do not consume resources by themselves; limits define capacity, not allocation.

## 3. Scope Model

- `global` scope maps to system-level limits (`EntityType.system`).
- `organization` scope maps to org-level limits (`EntityType.org`).
- `project` scope maps to project-level limits (`EntityType.project`).

Project-level limits are only capacity constraints. A project with no branches has zero allocation and therefore
consumes no resources.

Availability is computed per resource and scope, then combined as:

- `effective_available(resource) = min(available_global, available_org, available_project, per_branch_limit)`

## 3.1 Capacity vs allocation

- Capacity (`limits`): policy ceilings configured at `system`, `organization`, and `project` scopes.
- Allocation: branch-level resource assignments that consume capacity within those scopes.
- Availability: remaining free capacity in a scope (`capacity - allocated`).

Implications:

1. Limits do not consume resources by themselves.
2. Allocations consume resources only when branches have provisioned resource assignments.
3. Empty projects and newly created organizations with only default limits but no branches have zero allocation.

## 3.2 Capacity hierarchy and defaults

1. Global (`system`) limits represent total cluster capacity across all organizations.
2. Organization limits are initialized from system defaults when an organization is created.
3. Project limits are scoped inside the owning organization and constrain branch allocations in that project.

## 4. Current Implementation Verification

## 4.1 Implemented and aligned

1. Resource types are modeled and persisted (`milli_vcpu`, `ram`, `iops`, `database_size`, `storage_size`).
    - `vela-controller/src/models/resources.py`
2. Branch create validates requested allocations against effective limits before provisioning records are persisted.
    - `vela-controller/src/api/organization/project/branch/__init__.py:1326`
3. Resize validates the target allocation envelope against scope limits (excluding the current branch from aggregate
   usage).
    - `vela-controller/src/api/organization/project/branch/__init__.py:1137`
4. Storage downsize is explicitly blocked on resize.
    - `vela-controller/src/api/organization/project/branch/__init__.py:1668`
5. Effective per-branch available limits are computed using per-branch cap + remaining org + remaining project min
   logic.
    - `vela-controller/src/api/_util/resourcelimit.py:345`
6. Allocation usage is derived from branch provisioning rows.
    - Current behavior: runtime allocation sums are computed from `BranchProvisioning` records, not directly from project
      limit rows.
    - `vela-controller/src/api/_util/resourcelimit.py:491`
7. Organization defaults are copied from system limits at organization creation.
    - Organization create calls `initialize_organization_resource_limits`, which copies system `ResourceLimit` rows into
      org-scoped limits.
    - `vela-controller/src/api/organization/__init__.py:111`
    - `vela-controller/src/api/_util/resourcelimit.py:163`
8. System limits are bootstrapped as cluster-wide defaults at API startup.
    - API bootstrap calls `create_system_resource_limits`.
    - `vela-controller/src/api/__init__.py:188`
    - `vela-controller/src/api/_util/resourcelimit.py:133`

## 4.2 Gaps and non-compliance

1. Limit checks are conditionally skipped when `milli_vcpu` is absent or zero.
    - Current behavior: in `check_available_resources_limits`, all resource checks are nested under
      `if provisioning_request.milli_vcpu`.
    - Impact: a storage-only or database-only allocation update via allocation APIs can bypass limit validation.
    - Location: `vela-controller/src/api/_util/resourcelimit.py:267`

2. Stopped branch aggregation excludes all resources, including persistent storage.
    - Current behavior: aggregation excludes branches in `STOPPED`/`DELETING` for every resource type.
    - Rule mismatch: `database_size` and `storage_size` must continue to count for stopped branches.
    - Location: `vela-controller/src/api/_util/resourcelimit.py:527`

3. Global (`system`) max-total availability is not included in effective remaining calculations.
    - Current behavior: `get_remaining_project_resources` uses system `max_per_branch` but not system `max_total` as a
      remaining pool.
    - Impact: effective availability is not the strict minimum across all scopes when global total capacity is
      constrained.
    - Location: `vela-controller/src/api/_util/resourcelimit.py:352`

4. Organization provisioning limit creation writes a wrong entity type.
    - Current behavior: `set_organization_provisioning_limit` creates records with `EntityType.project`.
    - Impact: newly created org limits can be misclassified and omitted from org-scope reads/computation paths.
    - Location: `vela-controller/src/api/resources.py:157`

5. Resize policy for `database_size` downsize is not explicitly blocked.
    - Current behavior: `storage_size` downsize is blocked; `database_size` has no corresponding check.
    - Rule mismatch: policy requires storage-like persistent size resources to be upsize-only.
    - Location: `vela-controller/src/api/organization/project/branch/__init__.py:1668`

6. RAM downsize floor (`current_usage + 20%`) is only enforced in Studio UI, not controller API.
    - Current behavior: UI computes RAM minimum from usage, but the backend resize endpoint accepts values based only on
      static constraints.
    - Impact: direct API calls can violate RAM floor policy.
    - UI location: `apps/studio/components/interfaces/Branch/ResizeBranchModal.tsx:193`
    - Backend schema location (no dynamic floor): `vela-controller/src/deployment/__init__.py:669`

7. Branch effective-limits endpoint is known to be inaccurate for resize semantics (self-allocation included), requiring
   UI compensation.
    - Current behavior: code comments explicitly mark this as incorrect.
    - Impact: risk of inconsistent UX/API limit interpretation.
    - Location: `vela-controller/src/api/_util/resourcelimit.py:305`

8. Project limit creation currently treats limits as reserved allocations across projects.
    - Current behavior: when creating a project, requested `project_limits` are validated against
      `organization_limit - sum(other_project_limits)` rather than against actual branch allocations.
    - Rule mismatch: empty projects should not consume resources by configured limits; limits must act as constraints,
      not allocations.
    - Locations:
      - `vela-controller/src/api/organization/project/__init__.py:154`
      - `vela-controller/src/api/organization/project/__init__.py:219`
      - `vela-controller/src/api/organization/project/__init__.py:374`

9. Remaining-capacity math is incorrect when current allocation is zero.
    - Current behavior: some remaining-capacity calculations branch on the truthiness of current allocation, producing
      wrong values at zero usage (`0` or `inf` instead of `max_total`).
    - Impact:
      - organization available-capacity endpoint can report zero remaining for empty organizations/projects
      - first branch allocation can bypass org/project `max_total` constraints depending on `max_per_branch`
    - Locations:
      - `vela-controller/src/api/_util/resourcelimit.py:323`
      - `vela-controller/src/api/_util/resourcelimit.py:345`

## 5. Required Updates (with locations)

1. Fix unconditional per-resource checking.
    - Update `check_available_resources_limits` to evaluate each resource independently (remove dependency on
      `milli_vcpu` presence).
    - File: `vela-controller/src/api/_util/resourcelimit.py:267`

2. Make stop-state aggregation resource-aware.
    - Count `database_size` and `storage_size` for stopped branches.
    - Exclude stopped branches only for `milli_vcpu`, `ram`, `iops`.
    - File: `vela-controller/src/api/_util/resourcelimit.py:527`

3. Add global total-scope availability into effective min calculation.
    - Include remaining system/global total in `get_remaining_project_resources` and related creation paths.
    - File: `vela-controller/src/api/_util/resourcelimit.py:345`

4. Correct organization limit entity type.
    - Change created entity from `EntityType.project` to `EntityType.org`.
    - File: `vela-controller/src/api/resources.py:157`

5. Enforce `database_size` upsize-only at API layer.
    - Add an explicit downsized rejection similar to the current storage check.
    - File: `vela-controller/src/api/organization/project/branch/__init__.py:1668`

6. Enforce RAM `usage + 20%` floor in a backend resize path.
    - Use branch usage snapshot (or real-time measured usage) to calculate minimum acceptable RAM for resize requests.
    - Return `422` with a computed floor in error detail.
    - File: `vela-controller/src/api/organization/project/branch/__init__.py:1659`

7. Fix branch effective-limits semantics for resize consumers.
    - Ensure `/resources/branches/{branch_id}/limits/` returns values suitable for resize without frontend compensation
      hacks.
    - File: `vela-controller/src/api/_util/resourcelimit.py:305`

8. Remove project-limit reservation semantics from project creation validation.
    - Project limit validation should compare requested project limits against organization policy limits, without
      subtracting other projects' configured limits.
    - Branch allocation checks remain the enforcement point for actual resource consumption.
    - File: `vela-controller/src/api/organization/project/__init__.py:154`

9. Fix zero-allocation remaining-capacity calculations for org/project scopes.
    - Use `max_total - current_allocation` whenever a scope limit exists, including when current allocation is `0`.
    - Do not fall back to `0` or `inf` solely because current allocation is zero.
    - File: `vela-controller/src/api/_util/resourcelimit.py:323`

## 6. Validation and Tests

Add/adjust tests to cover:

1. Storage-only and DB-only allocation updates must fail when over the scope limit.
2. Stopped branch allocation accounting:
    - compute resources removed
    - persistent storage still counted
3. Global+org+project min behavior with conflicting scope availability.
4. Org limit CRUD persists and reads as `EntityType.org`.
5. Resize rejects `database_size` downsize.
6. Resize rejects RAM below `usage + 20%` via backend API.
7. Project creation accepts project limits without treating other projects' configured limits as consumed allocations.

## 7. Rollout Plan

1. Land backend fixes first (authoritative enforcement).
2. Keep Studio-side UX guardrails but treat them as advisory only.
3. Backfill/repair incorrectly persisted org limits (if any) created with wrong entity type.
4. Run migration or cleanup script before enabling strict policy checks in production environments.

## 8. Decision

Adopt the branch allocation rules above as normative behavior and prioritize backend enforcement so all clients (UI,
API, automation) observe identical limit semantics.
