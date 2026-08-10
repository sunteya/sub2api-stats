import { Client } from 'pg'
import { requireAdmin } from '../utils/admin-auth'

type DailyUsageItem = {
  email: string
  daily_used: number
}

export default defineEventHandler(async (event): Promise<{ items: DailyUsageItem[] }> => {
  requireAdmin(event)

  const body = await readBody<{ emails?: unknown }>(event)

  if (!Array.isArray(body?.emails)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must include an emails array',
    })
  }

  const emails = [...new Set(body.emails
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean))]

  if (emails.length > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A maximum of 100 emails is allowed',
    })
  }

  if (emails.length === 0) {
    return { items: [] }
  }

  const databaseUrl = String(useRuntimeConfig(event).databaseUrl || '').trim()

  if (!databaseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'DATABASE_URL is not configured',
    })
  }

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()
    const result = await client.query<DailyUsageItem>(`
      WITH requested_emails AS (
        SELECT UNNEST($1::text[]) AS email
      ), today_bounds AS (
        SELECT date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' AS start_at
      )
      SELECT
        requested_emails.email,
        COALESCE(SUM(usage_logs.actual_cost), 0)::float8 AS daily_used
      FROM requested_emails
      LEFT JOIN users ON lower(users.email) = requested_emails.email AND users.deleted_at IS NULL
      LEFT JOIN usage_logs ON usage_logs.user_id = users.id
        AND usage_logs.created_at >= (SELECT start_at FROM today_bounds)
        AND usage_logs.created_at < (SELECT start_at + INTERVAL '1 day' FROM today_bounds)
      GROUP BY requested_emails.email
    `, [emails])

    return { items: result.rows }
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Failed to load daily usage',
    })
  } finally {
    await client.end()
  }
})
