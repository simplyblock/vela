import { NextApiRequest, NextApiResponse } from 'next'

import { fetchGet } from 'data/fetchers'
import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { getPgMetaBaseUrl } from 'lib/api/getPgMetaUrl'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  const includedSchema = ['public', 'graphql_public', 'storage'].join(',')

  const excludedSchema = [
    'auth',
    'cron',
    'extensions',
    'graphql',
    'net',
    'pgsodium',
    'pgsodium_masks',
    'realtime',
    'supabase_functions',
    'supabase_migrations',
    'vault',
    '_analytics',
    '_realtime',
  ].join(',')

  const headers = constructHeaders(req.headers)

  const baseUrl = await getPgMetaBaseUrl(req, res)
  if (!baseUrl) return res.status(404).json({ error: { message: 'Branch not found' } })

  const response = await fetchGet(
    `${baseUrl}/generators/typescript?included_schema=${includedSchema}&excluded_schemas=${excludedSchema}`,
    { headers }
  )

  if (response.error) {
    const { code, message } = response.error
    return res.status(code).json({ message })
  } else {
    return res.status(200).json(response)
  }
}
