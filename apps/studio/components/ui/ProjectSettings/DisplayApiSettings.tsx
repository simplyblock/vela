import { JwtSecretUpdateStatus } from '@supabase/shared-types/out/events'
import { AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useParams } from 'common'
import Panel from 'components/ui/Panel'
import { useJwtSecretUpdatingStatusQuery } from 'data/config/jwt-secret-updating-status-query'
import { Input } from 'ui'
import { getLastUsedAPIKeys, useLastUsedAPIKeysLogQuery } from './DisplayApiSettings.utils'
import { useSelectedBranchQuery } from 'data/branches/selected-branch-query'
import { useCheckPermissions } from 'hooks/misc/useCheckPermissions'
import { getKeys, useAPIKeysQuery, APIKey } from 'data/api-keys/api-keys-query'

export const DisplayApiSettings = ({
  showTitle = true,
  showNotice = true,
  showLegacyText = true,
}: {
  showTitle?: boolean
  showNotice?: boolean
  showLegacyText?: boolean
}) => {
  const { slug: orgRef, ref: projectRef, branch: branchRef } = useParams()
  const { data: branch } = useSelectedBranchQuery()

  const {
    data: apiKeys = [],
    isError: isAPIKeysError,
    isLoading: isAPIKeysLoading,
  } = useAPIKeysQuery(
    { branch, reveal: true },
    {
      enabled: !!branch,
    }
  )

  const {
    data,
    isError: isJwtSecretUpdateStatusError,
    isLoading: isJwtSecretUpdateStatusLoading,
  } = useJwtSecretUpdatingStatusQuery({ branch })

  const jwtSecretUpdateStatus = data?.jwtSecretUpdateStatus

  const { isLoading: isLoadingPermissions, can: canReadAPIKeys } =
    useCheckPermissions('branch:api:getkeys')

  const isLoading = isAPIKeysLoading || isLoadingPermissions

  const isNotUpdatingJwtSecret =
    jwtSecretUpdateStatus === undefined || jwtSecretUpdateStatus === JwtSecretUpdateStatus.Updated

  // Keep this page focused on the legacy keys it previously displayed.
  // The API keys query is now the single source of truth.
  const { anonKey, serviceKey } = useMemo(() => getKeys(apiKeys), [apiKeys])
  const displayedKeys = useMemo((): APIKey[] => {
    return [anonKey, serviceKey].filter((key): key is APIKey => key !== undefined)
  }, [anonKey, serviceKey])

  // api keys should not be empty. However it can be populated with a delay on project creation
  const isApiKeysEmpty = displayedKeys.length === 0

  const { isLoading: isLoadingLastUsed, logData: lastUsedLogData } = useLastUsedAPIKeysLogQuery(
    orgRef!,
    projectRef!,
    branchRef!
  )

  const lastUsedAPIKeys = useMemo(() => {
    if (displayedKeys.length < 1 || !lastUsedLogData || lastUsedLogData.length < 1) {
      return {}
    }

    try {
      return getLastUsedAPIKeys(displayedKeys, lastUsedLogData)
    } catch (e: any) {
      toast.error('Failed to identify when the anon and service_role keys were last used')
      console.error(e)
      return {}
    }
  }, [lastUsedLogData, displayedKeys])

  return (
    <>
      <Panel
        noMargin
        title={
          showTitle && (
            <div className="space-y-3">
              <h5 className="text-base">Project API Keys</h5>
              <p className="text-sm text-foreground-light">
                Your API is secured behind an API gateway which requires an API Key for every
                request.
                <br />
                You can use the keys below in the Vela client libraries.
                <br />
              </p>
            </div>
          )
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8 space-x-2">
            <Loader2 className="animate-spin" size={16} strokeWidth={1.5} />
            <p className="text-sm text-foreground-light">Retrieving API keys</p>
          </div>
        ) : !canReadAPIKeys ? (
          <div className="flex items-center py-8 px-8 space-x-2">
            <AlertCircle size={16} strokeWidth={1.5} />
            <p className="text-sm text-foreground-light">
              You don't have permission to view API keys. These keys restricted to users with higher
              access levels.
            </p>
          </div>
        ) : isAPIKeysError || isJwtSecretUpdateStatusError ? (
          <div className="flex items-center justify-center py-8 space-x-2">
            <AlertCircle size={16} strokeWidth={1.5} />
            <p className="text-sm text-foreground-light">
              {isAPIKeysError ? 'Failed to retrieve API keys' : 'Failed to update JWT secret'}
            </p>
          </div>
        ) : isApiKeysEmpty || isAPIKeysLoading || isJwtSecretUpdateStatusLoading ? (
          <div className="flex items-center justify-center py-8 space-x-2">
            <Loader2 className="animate-spin" size={16} strokeWidth={1.5} />
            <p className="text-sm text-foreground-light">
              {isAPIKeysLoading || isApiKeysEmpty
                ? 'Retrieving API keys'
                : 'JWT secret is being updated'}
            </p>
          </div>
        ) : (
          displayedKeys.map((x, i: number) => (
            <Panel.Content
              key={x.api_key}
              className={
                i >= 1 &&
                'border-t border-panel-border-interior-light [[data-theme*=dark]_&]:border-panel-border-interior-dark'
              }
            >
              <Input
                readOnly
                disabled
                layout="horizontal"
                className="input-mono"
                label={
                  <>
                    <code className="text-xs text-code">{x.name}</code>

                    {x.name === 'service_role' && (
                      <code className="text-xs text-code !bg-destructive !text-white !border-destructive">
                        secret
                      </code>
                    )}

                    {x.name === 'anon' && <code className="text-xs text-code">public</code>}
                  </>
                }
                copy={canReadAPIKeys && isNotUpdatingJwtSecret}
                reveal={x.name !== 'anon' && canReadAPIKeys && isNotUpdatingJwtSecret}
                value={
                  !canReadAPIKeys
                    ? 'You need additional permissions to view API keys'
                    : jwtSecretUpdateStatus === JwtSecretUpdateStatus.Failed
                      ? 'JWT secret update failed, new API key may have issues'
                      : jwtSecretUpdateStatus === JwtSecretUpdateStatus.Updating
                        ? 'Updating JWT secret...'
                        : x.api_key ?? 'You need additional permissions to view API keys'
                }
                onChange={() => {}}
                descriptionText={
                  x.name === 'service_role' ? (
                    <>
                      This key has the ability to bypass Row Level Security. Never share it
                      publicly. If leaked, generate a new JWT secret immediately.{' '}
                      {showLegacyText && (
                        <span>
                          Prefer using{' '}
                          <Link
                            href={`/org/${orgRef}/project/${projectRef}/branch/${branchRef}/settings/api-keys/new`}
                            className="text-link underline"
                          >
                            Secret API keys
                          </Link>{' '}
                          instead.
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      This key is safe to use in a browser if you have enabled Row Level Security
                      for your tables and configured policies.{' '}
                      {showLegacyText && (
                        <span>
                          Prefer using{' '}
                          <Link
                            href={`/org/${orgRef}/project/${projectRef}/branch/${branchRef}/settings/api-keys/new`}
                            className="text-link underline"
                          >
                            Publishable API keys
                          </Link>{' '}
                          instead.
                        </span>
                      )}
                    </>
                  )
                }
              />

              <div
                className="pt-2 text-foreground-lighter w-full text-sm data-[invisible=true]:invisible"
                data-invisible={isLoadingLastUsed}
              >
                {lastUsedAPIKeys[x.api_key]
                  ? `Last request was ${lastUsedAPIKeys[x.api_key]} ago.`
                  : 'No requests in the past 24 hours.'}
              </div>
            </Panel.Content>
          ))
        )}

        {showNotice ? (
          <Panel.Notice
            className="border-t"
            title="API keys have moved"
            badgeLabel="Changelog"
            description={`
  \`anon\` and \`service_role\` API keys can now be replaced with \`publishable\` and \`secret\` API keys.
  `}
            href="https://github.com/simplyblock/vela-studio/discussions/29260"
            buttonText="Read the announcement"
          />
        ) : null}
      </Panel>
    </>
  )
}
