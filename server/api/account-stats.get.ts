import { getAccountStats } from '../utils/account-stats'
import { requireAdmin } from '../utils/admin-auth'

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const config = useRuntimeConfig(event)
  const databaseUrl = String(config.databaseUrl || '').trim()

  if (!databaseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DATABASE_URL is not configured',
    })
  }

  try {
    return {
      items: await getAccountStats(databaseUrl),
    }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Failed to load account statistics',
    })
  }
})
