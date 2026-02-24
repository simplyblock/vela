import dynamic from 'next/dynamic'
import { forwardRef, HTMLAttributes, useMemo } from 'react'

import { useParams } from 'common'
import { GenericSkeletonLoader } from 'components/ui/ShimmeringLoader'
import { useProjectSettingsV2Query } from 'data/config/project-settings-v2-query'
import { pluckObjectFields } from 'lib/helpers'
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
    const { slug: orgSlug, ref: projectRef } = useParams()

    const { data: settings } = useProjectSettingsV2Query({ orgRef: orgSlug, projectRef })

    const DB_FIELDS = ['db_host', 'db_name', 'db_port', 'db_user', 'inserted_at']
    const emptyState = { db_user: '', db_host: '', db_port: '', db_name: '' }
    const connectionInfo = pluckObjectFields(settings || emptyState, DB_FIELDS)

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
