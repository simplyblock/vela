import { NextApiRequest, NextApiResponse } from 'next'
import { getPlatformQueryParams } from './platformQueryParams'
import { isDocker } from '../docker'
import { getBranchOrRefresh } from './branchCaching'
import { joinPath } from './apiHelpers'

const isInDocker = isDocker()

/**
 * Return the pg-meta base URL for a branch.
 * For non-Docker deployments the URL is derived from `service_endpoint_uri`
 * (the same field used by the REST proxy) so that non-default environments
 * with custom internal names are handled correctly.
 *
 * Returns `null` if the branch entity could not be resolved.
 */
export async function getPgMetaBaseUrl(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  if (isInDocker) {
    return `${process.env.PLATFORM_PG_META_URL}`
  }

  const { slug, ref, branch } = getPlatformQueryParams(req, 'slug', 'ref', 'branch')
  const branchEntity = await getBranchOrRefresh(slug, ref, branch, req, res)
  if (!branchEntity) return null
  return joinPath(branchEntity.database.service_endpoint_uri, 'pg-meta')
}

/**
 * Construct the pgMeta redirection url, passing along all filtering query params.
 *
 * For non-Docker deployments the base URL is derived from the branch entity's
 * `service_endpoint_uri` (the same source used by the REST proxy) so that
 * non-default environments with custom internal names are handled correctly.
 */
export async function getPgMetaRedirectUrl(
  req: NextApiRequest,
  res: NextApiResponse,
  endpoint: string
): Promise<string | null> {
  const baseUrl = await getPgMetaBaseUrl(req, res)
  if (!baseUrl) return null

  const query = Object.entries(req.query).reduce((params, [key, value]) => {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else if (value) {
      params.set(key, value)
    }
    return params
  }, new URLSearchParams())

  let url = `${baseUrl}/${endpoint}`
  if (query.toString()) url += `?${query}`
  return url
}
