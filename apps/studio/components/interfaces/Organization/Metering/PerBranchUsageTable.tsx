import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Input_Shadcn_ as Input,
  Select,
} from 'ui'
import BranchEnvBadge from 'components/interfaces/Branch/BranchEnvBadge'


import { useProjectsQuery } from 'data/projects/projects-query'
import { getBranch } from 'data/branches/branch-query'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { formatForUnit } from 'components/interfaces/Branch/utils'


// ---- Types ----

type UsageRecord = {
  organization_id: string
  project_id: string
  branch_id: string
  amount: string
  type: 'milli_vcpu' | 'ram' | 'iops' | 'storage_size' | 'database_size'
}

type BranchUsageRow = {
  branch_id: string
  project_id: string
  metrics: {
    milli_vcpu: number
    ram: number
    iops: number
    storage_size: number
    database_size: number
  }
}

// ---- Helpers ----

function normalizeUsage(data?: unknown): BranchUsageRow[] {
  if (!Array.isArray(data)) return []

  const map = new Map<string, BranchUsageRow>()

  for (const row of data as UsageRecord[]) {
    if (!map.has(row.branch_id)) {
      map.set(row.branch_id, {
        branch_id: row.branch_id,
        project_id: row.project_id,
        metrics: {
          milli_vcpu: 0,
          ram: 0,
          iops: 0,
          storage_size: 0,
          database_size: 0,
        },
      })
    }

    const entry = map.get(row.branch_id)!
    entry.metrics[row.type] = Number(row.amount) || 0
  }

  return Array.from(map.values())
}


// ---- Component ----

type Props = {
  orgRef?: string
  perBranchUsage?: UsageRecord[]
  loading: boolean
}

const PerBranchUsageTable = ({ orgRef, perBranchUsage, loading }: Props) => {
  const rows = useMemo(() => normalizeUsage(perBranchUsage), [perBranchUsage])

  // Filters
  const [projectFilter, setProjectFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [envFilter, setEnvFilter] = useState<'all' | string>('all')

  // Org / env types
  const { data: org } = useSelectedOrganizationQuery()

  const environments = useMemo(() => {
    const base = [{ label: 'All environments', value: 'all' }]
    if (!org?.env_types?.length) return base

    return base.concat(
      org.env_types.map((type: string) => ({
        label: type,
        value: type,
      }))
    )
  }, [org])

  // Projects
  const { data: projects } = useProjectsQuery()

  const projectsById = useMemo(() => {
    return Object.fromEntries(projects?.map((p: any) => [p.id, p]) ?? [])
  }, [projects])

  // Branches
  const branchPairs = useMemo(() => {
    return rows.map(r => ({ project_id: r.project_id, branch_id: r.branch_id }))
  }, [rows])

  const { data: branches = [], isLoading: isBranchLoading } = useQuery({
    queryKey: ['metering-branch-details', orgRef, branchPairs],
    queryFn: ({ signal }) =>
      Promise.all(
        branchPairs.map(({ project_id, branch_id }) =>
          getBranch({ orgRef, projectRef: project_id, branchRef: branch_id }, signal)
        )
      ),
    enabled: Boolean(orgRef) && branchPairs.length > 0,
  })

  const branchesById = useMemo(() => {
    const map: Record<string, any> = {}
    branches.forEach((branch) => {
      if (branch) map[branch.id] = branch
    })
    return map
  }, [branches])

  // Filtering
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const project = projectsById[row.project_id]
      const branch = branchesById[row.branch_id]

      if (!project || !branch) return false

      if (projectFilter && !project.name.toLowerCase().includes(projectFilter.toLowerCase())) {
        return false
      }

      if (branchFilter && !branch.name.toLowerCase().includes(branchFilter.toLowerCase())) {
        return false
      }

      if (envFilter !== 'all' && branch.env_type !== envFilter) return false

      return true
    })
  }, [rows, projectsById, branchesById, projectFilter, branchFilter, envFilter])

  const showEmpty = !loading && !isBranchLoading && filteredRows.length === 0

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 px-6">
        
        <Input
          placeholder="Filter by branch"
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="w-56"
        />
        <Input
          placeholder="Filter by project"
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="w-56"
        />
        <Select
          value={envFilter}
          onChange={e => setEnvFilter(e.target.value)}
          className="w-56"
        >
          {environments.map(env => (
            <option key={env.value} value={env.value}>
              {env.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-6 pb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Branch</TableHead>
              <TableHead className="min-w-[120px] text-right">vCPU</TableHead>
              <TableHead className="min-w-[120px] text-right">RAM</TableHead>
              <TableHead className="min-w-[140px] text-right">Database</TableHead>
              <TableHead className="min-w-[140px] text-right">Storage</TableHead>
              <TableHead className="min-w-[120px] text-right">IOPS</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredRows.map(row => {
              const project = projectsById[row.project_id]
              const branch = branchesById[row.branch_id]

              return (
                <TableRow key={row.branch_id}>
                    <TableCell>
                    <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                    {branch?.name ?? '—'}
                    </span>
                    <span className="text-xs text-foreground-light">
                    Project: {project?.name ?? '—'}
                    </span>
                    {branch?.env_type && (
                    <div className="pt-0.5">
                    <BranchEnvBadge env={(branch as any).env_type} size="sm" />
                    </div>
                    )}
                    </div>
                    </TableCell>

                  <TableCell className="text-right">
                    {formatForUnit(row.metrics.milli_vcpu, 'milli_vcpu')}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatForUnit(row.metrics.ram, 'ram')}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatForUnit(row.metrics.database_size, 'database_size')}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatForUnit(row.metrics.storage_size, 'storage_size')}
                  </TableCell>

                  <TableCell className="text-right">
                    {formatForUnit(row.metrics.iops, 'iops')}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {showEmpty && (
          <div className="py-12 text-center text-sm text-foreground-light">
            No branch usage data for the selected filters and date range.
          </div>
        )}
      </div>
    </div>
  )
}

export default PerBranchUsageTable
