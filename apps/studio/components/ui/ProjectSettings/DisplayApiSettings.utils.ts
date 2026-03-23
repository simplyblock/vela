import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { useRef } from 'react'

import useLogsQuery from 'hooks/analytics/useLogsQuery'

dayjs.extend(duration)

export function useLastUsedAPIKeysLogQuery(orgRef: string, projectRef: string, branchRef: string) {
  const now = useRef(new Date()).current
  return useLogsQuery(orgRef, projectRef, branchRef, {
    iso_timestamp_start: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    iso_timestamp_end: now.toISOString(),
    sql: "-- last-used-anon--service_role-api-keys\nSELECT unix_millis(max(timestamp)) as timestamp, payload.role, payload.signature_prefix FROM edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as request cross join unnest(request.sb) as sb cross join unnest(sb.jwt) as jwt cross join unnest(jwt.apikey) as apikey cross join unnest(apikey.payload) as payload WHERE apikey.invalid is null and payload.issuer = 'supabase' and payload.algorithm = 'HS256' and payload.role in ('anon', 'service_role') GROUP BY payload.role, payload.signature_prefix",
  })
}

export function getLastUsedAPIKeys(
  apiKeys: {
    name: string
    api_key: string
  }[],
  logData:
    | {
        timestamp: number
        role?: 'anon' | 'service_role' | string
        signature_prefix?: string
      }[]
    | null
) {
  if (apiKeys.length < 1 || !logData || logData.length < 1) {
    return {}
  }

  const now = dayjs()

  return apiKeys.reduce(
    (acc, key) => {
      const entry = logData.find(
        ({ role, signature_prefix }) =>
          role &&
          signature_prefix &&
          key.name === role &&
          key.api_key.split('.')[2]?.startsWith(signature_prefix)
      )?.timestamp

      if (entry) {
        acc[key.api_key] = dayjs.duration(now.diff(dayjs(entry))).humanize(false)
      }

      return acc
    },
    {} as Record<string, string>
  )
}