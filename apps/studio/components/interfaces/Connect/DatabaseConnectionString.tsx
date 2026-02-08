import { HTMLAttributes, ReactNode, useState } from 'react'

import AlertError from 'components/ui/AlertError'
import DatabaseSelector from 'components/ui/DatabaseSelector'
import { InlineLink } from 'components/ui/InlineLink'
import ShimmeringLoader from 'components/ui/ShimmeringLoader'
import { useReadReplicasQuery } from 'data/read-replicas/replicas-query'
import { useSendEventMutation } from 'data/telemetry/send-event-mutation'
import { useSelectedOrganizationQuery } from 'hooks/misc/useSelectedOrganization'
import { pluckObjectFields } from 'lib/helpers'
import { useDatabaseSelectorStateSnapshot } from 'state/database-selector'
import {
  cn,
  CodeBlock,
  Collapsible_Shadcn_,
  CollapsibleContent_Shadcn_,
  CollapsibleTrigger_Shadcn_,
  DIALOG_PADDING_X,
  Select_Shadcn_,
  SelectContent_Shadcn_,
  SelectItem_Shadcn_,
  SelectTrigger_Shadcn_,
  SelectValue_Shadcn_,
  Separator,
} from 'ui'
import {
  CONNECTION_PARAMETERS,
  DATABASE_CONNECTION_TYPES,
  DatabaseConnectionType,
} from './Connect.constants'
import { CodeBlockFileHeader, ConnectionPanel } from './ConnectionPanel'
import { getConnectionStrings } from './DatabaseSettings.utils'
import examples, { Example } from './DirectConnectionExamples'
import { getPathReferences } from 'data/vela/path-references'
import { ChevronDown } from 'lucide-react'
import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'

const StepLabel = ({
  number,
  children,
  ...props
}: { number: number; children: ReactNode } & HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={cn('flex items-center gap-2', props.className)}>
    <div className="flex font-mono text-xs items-center justify-center w-6 h-6 border border-strong rounded-md bg-surface-100">
      {number}
    </div>
    <span>{children}</span>
  </div>
)

/**
 * [Joshen] For paid projects - Dedicated pooler is always in transaction mode
 * So session mode connection details are always using the shared pooler (Supavisor)
 */
export const DatabaseConnectionString = () => {
  const { slug: orgRef, ref: projectRef, branch: branchRef } = getPathReferences()
  const { data: org } = useSelectedOrganizationQuery()
  const { data: branch } = useSelectedBranchQuery()
  const state = useDatabaseSelectorStateSnapshot()

  const [selectedTab, setSelectedTab] = useState<DatabaseConnectionType>('uri')

  const { data: databases, error, isLoading, isError, isSuccess } = useReadReplicasQuery({ branch })

  const selectedDatabase = (databases ?? []).find(
    (db) => db.identifier === state.selectedDatabaseId
  )

  const { mutate: sendEvent } = useSendEventMutation()

  const DB_FIELDS = ['db_host', 'db_name', 'db_port', 'db_user', 'inserted_at']
  const emptyState = { db_user: '', db_host: '', db_port: '', db_name: '' }
  const connectionInfo = pluckObjectFields(selectedDatabase || emptyState, DB_FIELDS)

  const handleCopy = (
    connectionTypeId: string,
    connectionMethod: 'direct' | 'transaction_pooler' | 'session_pooler'
  ) => {
    const connectionInfo = DATABASE_CONNECTION_TYPES.find((type) => type.id === connectionTypeId)
    const connectionType = connectionInfo?.label ?? 'Unknown'
    const lang = connectionInfo?.lang ?? 'Unknown'
    sendEvent({
      action: 'connection_string_copied',
      properties: { connectionType, lang, connectionMethod },
      groups: { project: projectRef ?? 'Unknown', organization: org?.id ?? 'Unknown', branch: branch?.id ?? 'Unknown' },
    })
  }

  const connectionStrings = getConnectionStrings({
    connectionInfo,
    metadata: { projectRef },
  })

  const lang = DATABASE_CONNECTION_TYPES.find((type) => type.id === selectedTab)?.lang ?? 'bash'
  const contentType =
    DATABASE_CONNECTION_TYPES.find((type) => type.id === selectedTab)?.contentType ?? 'input'

  const example: Example | undefined = examples[selectedTab as keyof typeof examples]

  const exampleFiles = example?.files
  const exampleInstallCommands = example?.installCommands
  const examplePostInstallCommands = example?.postInstallCommands
  const hasCodeExamples = exampleFiles || exampleInstallCommands
  const fileTitle = DATABASE_CONNECTION_TYPES.find((type) => type.id === selectedTab)?.fileTitle

  // [Refactor] See if we can do this in an immutable way, technically not a good practice to do this
  let stepNumber = 0

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          'flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3',
          DIALOG_PADDING_X
        )}
      >
        <div className="flex">
          <span className="flex items-center text-foreground-lighter px-3 rounded-lg rounded-r-none text-xs border border-button border-r-0">
            Type
          </span>
          <Select_Shadcn_
            value={selectedTab}
            onValueChange={(connectionType: DatabaseConnectionType) =>
              setSelectedTab(connectionType)
            }
          >
            <SelectTrigger_Shadcn_ size="small" className="w-auto rounded-l-none">
              <SelectValue_Shadcn_ />
            </SelectTrigger_Shadcn_>
            <SelectContent_Shadcn_>
              {DATABASE_CONNECTION_TYPES.map((type) => (
                <SelectItem_Shadcn_ key={type.id} value={type.id}>
                  {type.label}
                </SelectItem_Shadcn_>
              ))}
            </SelectContent_Shadcn_>
          </Select_Shadcn_>
        </div>
        <DatabaseSelector portal={false} buttonProps={{ size: 'small' }} />
      </div>

      {isLoading && (
        <div className="p-7">
          <ShimmeringLoader className="h-8 w-full" />
        </div>
      )}

      {isError && (
        <div className="p-7">
          <AlertError error={error} subject="Failed to retrieve database settings" />
        </div>
      )}

      {isSuccess && (
        <div className="flex flex-col divide-y divide-border">
          {/* // handle non terminal examples */}
          {hasCodeExamples && (
            <div className="grid grid-cols-2 gap-x-20 w-full px-4 md:px-7 py-8">
              <div>
                <StepLabel number={++stepNumber} className="mb-4">
                  Install the following
                </StepLabel>
                {exampleInstallCommands?.map((cmd, i) => (
                  <CodeBlock
                    key={i}
                    className="[&_code]:text-[12px] [&_code]:text-foreground"
                    value={cmd}
                    hideLineNumbers
                    language="bash"
                  >
                    {cmd}
                  </CodeBlock>
                ))}
              </div>
              {exampleFiles && exampleFiles?.length > 0 && (
                <div>
                  <StepLabel number={++stepNumber} className="mb-4">
                    Add file to project
                  </StepLabel>
                  {exampleFiles?.map((file, i) => (
                    <div key={i}>
                      <CodeBlockFileHeader title={file.name} />
                      <CodeBlock
                        wrapperClassName="[&_pre]:max-h-40 [&_pre]:px-4 [&_pre]:py-3 [&_pre]:rounded-t-none"
                        value={file.content}
                        hideLineNumbers
                        language={lang}
                        className="[&_code]:text-[12px] [&_code]:text-foreground"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            {hasCodeExamples && (
              <div className="px-4 md:px-7 pt-8">
                <StepLabel number={++stepNumber}>Choose type of connection</StepLabel>
              </div>
            )}
            <div className="divide-y divide-border-muted [&>div]:px-4 [&>div]:md:px-7 [&>div]:py-8">
              <ConnectionPanel
                type="direct"
                title="Direct connection"
                contentType={contentType}
                lang={lang}
                fileTitle={fileTitle}
                description="Ideal for applications with persistent, long-lived connections, such as those running on virtual machines or long-standing containers."
                connectionString={connectionStrings['direct'][selectedTab]}
                parameters={[
                  { ...CONNECTION_PARAMETERS.host, value: connectionInfo.db_host },
                  { ...CONNECTION_PARAMETERS.port, value: connectionInfo.db_port },
                  { ...CONNECTION_PARAMETERS.database, value: connectionInfo.db_name },
                  { ...CONNECTION_PARAMETERS.user, value: connectionInfo.db_user },
                ]}
                onCopyCallback={() => handleCopy(selectedTab, 'direct')}
              />
            </div>
          </div>

          {examplePostInstallCommands && (
            <div className="grid grid-cols-2 gap-20 w-full px-4 md:px-7 py-10">
              <div>
                <StepLabel number={++stepNumber} className="mb-4">
                  Add the configuration package to read the settings
                </StepLabel>
                {examplePostInstallCommands?.map((cmd, i) => (
                  <CodeBlock
                    key={i}
                    className="text-sm"
                    value={cmd}
                    hideLineNumbers
                    language="bash"
                  >
                    {cmd}
                  </CodeBlock>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'python' && (
        <>
          <Separator />
          <Collapsible_Shadcn_ className="px-8 py-5">
            <CollapsibleTrigger_Shadcn_ className="group [&[data-state=open]>div>svg]:!-rotate-180">
              <div className="flex items-center gap-x-2 w-full">
                <p className="text-xs text-foreground-light group-hover:text-foreground transition">
                  Connecting to SQL Alchemy
                </p>
                <ChevronDown
                  className="transition-transform duration-200"
                  strokeWidth={1.5}
                  size={14}
                />
              </div>
            </CollapsibleTrigger_Shadcn_>
            <CollapsibleContent_Shadcn_ className="my-2">
              <div className="text-foreground-light text-xs grid gap-2">
                <p>
                  Please use <code>postgresql://</code> instead of <code>postgres://</code> as your
                  dialect when connecting via SQLAlchemy.
                </p>
                <p>
                  Example:
                  <code>create_engine("postgresql+psycopg2://...")</code>
                </p>
                <p className="text-sm font-mono tracking-tight text-foreground-lighter"></p>
              </div>
            </CollapsibleContent_Shadcn_>
          </Collapsible_Shadcn_>
        </>
      )}

      <Separator />
      <div className="px-8 pt-5 flex flex-col gap-y-1">
        <p className="text-sm">Reset your database password</p>
        <p className="text-sm text-foreground-lighter">
          You may reset your database password in your project's{' '}
          <InlineLink
            href={`/org/${orgRef}/project/${projectRef}/branch/${branchRef}/database/settings`}
            className="text-foreground-lighter hover:text-foreground"
          >
            Database Settings
          </InlineLink>
        </p>
      </div>
    </div>
  )
}
