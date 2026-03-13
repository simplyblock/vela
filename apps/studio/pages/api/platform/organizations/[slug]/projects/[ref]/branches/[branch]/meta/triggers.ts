import { NextApiRequest, NextApiResponse } from 'next'

import { fetchGet } from 'data/fetchers'
import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { getPgMetaRedirectUrl } from 'lib/api/getPgMetaUrl'

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
  const pgMeta = await getPgMetaRedirectUrl(req, res, 'triggers')
  if (!pgMeta) return res.status(404).json({ error: { message: 'Branch not found' } })

  const headers = { ...constructHeaders(req.headers), 'x-connection-encrypted': pgMeta.encryptedConnectionString }
  const response = await fetchGet(pgMeta.url, { headers })

  if (response.error) {
    const { code, message } = response.error
    return res.status(code ?? 500).json({ message })
  } else {
    return res.status(200).json(response)
  }
}
