import { fetchPost } from 'data/fetchers'
import { constructHeaders } from 'lib/api/apiHelpers'
import apiWrapper from 'lib/api/apiWrapper'
import { NextApiRequest, NextApiResponse } from 'next'
import { getPgMetaRedirectUrl } from 'lib/api/getPgMetaUrl'

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const pgMeta = await getPgMetaRedirectUrl(req, res, 'query')
  if (!pgMeta) return res.status(404).json({ error: { message: 'Branch not found' } })

  const { query } = req.body
  const headers = { ...constructHeaders(req.headers), 'x-connection-encrypted': pgMeta.encryptedConnectionString }

  try {
    const response = await fetchPost(pgMeta.url, { query }, { headers })

    if (response.error) {
      const { code, message } = response.error
      return res.status(code ?? 500).json({ message, formattedError: message })
    } else {
      return res.status(200).json(response)
    }
  } catch (error: any) {
    return res.status(500).json({ error: { message: error.message } })
  }
}
