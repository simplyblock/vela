import { ReactNode } from 'react'
import { StatsCard } from 'components/ui/StatsCard'
import { formatForUnit, ResourceKey } from 'components/interfaces/Branch/utils'

export interface ResourceUsageMetric {
  key: ResourceKey
  label: string
  value: number
  summarySuffix?: string
  icon?: ReactNode
}

interface ResourceUsageStatsProps {
  metrics: ResourceUsageMetric[]
  loading?: boolean
}

const ResourceUsageStats = ({ metrics, loading }: ResourceUsageStatsProps) => {
  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-medium text-foreground">Resource usage summary</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-md bg-surface-200 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium text-foreground">Resource usage summary</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <StatsCard
            key={metric.key}
            title={metric.label}
            value={formatForUnit(metric.value, metric.key)}
            description={`Usage in selected period: ${formatForUnit(metric.value, metric.key)}${
              metric.summarySuffix ? ` ${metric.summarySuffix}` : ''
            }`}
            icon={metric.icon}
          />
        ))}
      </div>
    </div>
  )
}

export default ResourceUsageStats
