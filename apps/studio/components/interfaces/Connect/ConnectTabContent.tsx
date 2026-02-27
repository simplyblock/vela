import dynamic from 'next/dynamic'
import { forwardRef, HTMLAttributes, useMemo } from 'react'

import { useParams } from 'common'
import { GenericSkeletonLoader } from 'components/ui/ShimmeringLoader'
import { useReadReplicasQuery } from 'data/read-replicas/replicas-query'
import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'
import { pluckObjectFields } from 'lib/helpers'
import { useDatabaseSelectorStateSnapshot } from 'state/database-selector'
import { cn } from 'ui'
import type { projectKeys } from './Connect.types'
import { getConnectionStrings } from './DatabaseSettings.utils'

interface ConnectContentTabProps extends HTMLAttributes<HTMLDivElement> {
  projectKeys: projectKeys
  filePath: string
  connectionStringPooler?: {
    transactionShared: string
    sessionShared: string
    transactionDedicated?: string
    sessionDedicated?: string
    ipv4SupportedForDedicatedPooler: boolean
    direct?: string
  }
}

const ConnectTabContent = forwardRef<HTMLDivElement, ConnectContentTabProps>(
  ({ projectKeys, filePath, ...props }, ref) => {
    const { ref: projectRef } = useParams()
    const { data: branch } = useSelectedBranchQuery()
    const state = useDatabaseSelectorStateSnapshot()
    const { data: databases } = useReadReplicasQuery({ branch })

    const selectedDatabase =
      (databases ?? []).find((db) => db.identifier === state.selectedDatabaseId) ??
      (databases ?? []).find((db) => db.identifier === branch?.project_id)

    const DB_FIELDS = ['db_host', 'db_name', 'db_port', 'db_user', 'inserted_at']
    const emptyState = { db_user: '', db_host: '', db_port: '', db_name: '' }
    const connectionInfo = pluckObjectFields(selectedDatabase || emptyState, DB_FIELDS)

    const connectionStrings = getConnectionStrings({
      connectionInfo,
      metadata: { projectRef },
    })

    const transactionShared = connectionStrings.direct.uri
    const sessionShared = connectionStrings.direct.uri

    const ContentFile = useMemo(() => {
      return dynamic<ConnectContentTabProps>(() => import(`./content/${filePath}/content`), {
        loading: () => (
          <div className="p-4 min-h-[331px]">
            <GenericSkeletonLoader />
          </div>
        ),
      })
    }, [filePath])

    return (
      <div ref={ref} {...props} className={cn('border rounded-lg', props.className)}>
        <ContentFile
          projectKeys={projectKeys}
          filePath={filePath}
          connectionStringPooler={{
            transactionShared,
            sessionShared,
            ipv4SupportedForDedicatedPooler: false,
            direct: connectionStrings.direct.uri,
          }}
        />
      </div>
    )
  }
)

ConnectTabContent.displayName = 'ConnectTabContent'

export default ConnectTabContent
