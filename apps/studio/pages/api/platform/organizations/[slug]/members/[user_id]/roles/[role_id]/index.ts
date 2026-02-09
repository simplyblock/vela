import { NextApiRequest, NextApiResponse } from 'next'
import { apiBuilder } from 'lib/api/apiBuilder'
import { getVelaClient } from 'data/vela/vela'
import { getPlatformQueryParams } from 'lib/api/platformQueryParams'

const handleDelete = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, user_id, role_id } = getPlatformQueryParams(req, 'slug', 'user_id', 'role_id')
  const client = getVelaClient(req)

  const response = await client.post(
    '/organizations/{organization_id}/roles/{role_id}/unassign/{user_id}/',
    {
      params: {
        path: {
          organization_id: slug,
          user_id,
          role_id,
        },
      },
    }
  )

  if (response.error) {
    return res.status(response.response.status).json(response.error)
  }

  return res.status(200).json(response.data)
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const { slug, user_id, role_id } = getPlatformQueryParams(req, 'slug', 'user_id', 'role_id')
  const client = getVelaClient(req)

  // Get the incoming body
  const { project_ids, branch_ids, env_types } = req.body
  
  // Extract whichever array is provided (only one should be present)
  let contexts: string[] | null = null
  
  if (project_ids !== undefined) {
    contexts = project_ids
  } else if (branch_ids !== undefined) {
    contexts = branch_ids
  } else if (env_types !== undefined) {
    contexts = env_types
  }
  // If none are provided, contexts remains null (for organization roles)

  const response = await client.post(
    '/organizations/{organization_id}/roles/{role_id}/assign/{user_id}/',
    {
      params: {
        path: {
          organization_id: slug,
          user_id,
          role_id,
        },
      },
      body: { contexts },
    }
  )

  if (response.error) {
    return res.status(response.response.status).json(response.error)
  }

  return res.status(200).json(response.data)
}

const apiHandler = apiBuilder((builder) => {
  builder.useAuth().delete(handleDelete).post(handlePost)
})

export default apiHandler
