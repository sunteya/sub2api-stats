import { getRequestError } from '../utils/request-error'
import { requireAdmin } from '../utils/admin-auth'

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const requestId = String(getQuery(event).request_id || '').trim()
  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'request_id is required' })
  }

  if (requestId.length > 512) {
    throw createError({ statusCode: 400, statusMessage: 'request_id is too long' })
  }

  const databaseUrl = String(useRuntimeConfig(event).databaseUrl || '').trim()
  if (!databaseUrl) {
    throw createError({ statusCode: 500, statusMessage: 'DATABASE_URL is not configured' })
  }

  try {
    const result = await getRequestError(databaseUrl, requestId)
    if (!result) {
      throw createError({ statusCode: 404, statusMessage: 'Request was not found' })
    }

    return result
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Failed to load request details',
    })
  }
})
