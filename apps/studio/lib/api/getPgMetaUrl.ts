import { NextApiRequest, NextApiResponse } from 'next'
import { getPlatformQueryParams } from './platformQueryParams'
import { isDocker } from '../docker'
import { getBranchOrRefresh } from './branchCaching'
import { joinPath } from './apiHelpers'

const isInDocker = isDocker()

export interface PgMetaTarget {
  url: string
  encryptedConnectionString: string
}

export async function getPgMetaUrl(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<PgMetaTarget | undefined> {
  if (isInDocker) {
    const url = process.env.PLATFORM_PG_META_URL
    if (!url) return undefined
    return { url, encryptedConnectionString: '' }
  }
  const { slug, ref, branch } = getPlatformQueryParams(req, 'slug', 'ref', 'branch')
  const branchEntity = await getBranchOrRefresh(slug, ref, branch, req, res)
  if (!branchEntity) return undefined
  const url = joinPath(branchEntity.database.service_endpoint_uri, 'pg-meta')
  console.log('[getPgMetaUrl] service_endpoint_uri:', branchEntity.database.service_endpoint_uri)
  console.log('[getPgMetaUrl] pgMetaUrl:', url)
  return { url, encryptedConnectionString: branchEntity.database.encrypted_connection_string }
}

/**
 * Construct the pgMeta redirection url passing along the filtering query params
 * @param req
 * @param res
 * @param endpoint
 */
export async function getPgMetaRedirectUrl(
  req: NextApiRequest,
  res: NextApiResponse,
  endpoint: string
): Promise<PgMetaTarget | undefined> {
  const query = Object.entries(req.query).reduce((query, entry) => {
    const [key, value] = entry
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, v)
    } else if (value) {
      query.set(key, value)
    }
    return query
  }, new URLSearchParams())

  const pgMeta = await getPgMetaUrl(req, res)
  if (!pgMeta) return undefined
  let url = `${pgMeta.url}/${endpoint}`
  if (query.toString()) url += `?${query}`
  return { ...pgMeta, url }
}
