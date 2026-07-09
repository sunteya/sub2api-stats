import { readDailyAmounts } from '../utils/settings'
import { requireAdmin } from '../utils/admin-auth'

type AdminUser = {
  id: number
  email: string
  username: string | null
  role: string
  balance: number
  concurrency: number
  current_concurrency?: number | null
  rpm_limit?: number | null
  status: string
  last_active_at?: string | null
  last_used_at?: string | null
  created_at: string
  updated_at?: string | null
  notes?: string | null
}

type AdminUserWithDailyAmount = AdminUser & {
  daily_amount: number | null
}

type PaginatedUsers = {
  items: AdminUserWithDailyAmount[]
  total: number
  page: number
  page_size: number
  pages: number
}

type Sub2apiPaginatedUsers = Omit<PaginatedUsers, 'items'> & {
  items: AdminUser[]
}

type Sub2apiEnvelope<T> = {
  code?: number
  message?: string
  data?: T
}

function readPositiveInteger(value: unknown, fallback: number, max?: number): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value)

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  const integer = Math.floor(parsed)
  return max ? Math.min(integer, max) : integer
}

export default defineEventHandler(async (event): Promise<PaginatedUsers> => {
  requireAdmin(event)

  const config = useRuntimeConfig(event)
  const apiKey = String(config.sub2apiKey || '').trim()
  const baseUrl = String(config.sub2apiBaseUrl || '').trim()

  if (!apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SUB2API_KEY is not configured',
    })
  }

  if (!baseUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SUB2API_BASE_URL is not configured',
    })
  }

  const query = getQuery(event)
  const page = readPositiveInteger(query.page, 1)
  const pageSize = readPositiveInteger(query.page_size, 20, 100)

  const params: Record<string, string | number> = {
    page,
    page_size: pageSize,
  }

  for (const key of ['status', 'role', 'search'] as const) {
    const value = query[key]
    const normalized = String(Array.isArray(value) ? value[0] : value || '').trim()

    if (normalized) {
      params[key] = normalized
    }
  }

  try {
    const response = await $fetch<Sub2apiEnvelope<Sub2apiPaginatedUsers>>('/api/v1/admin/users', {
      baseURL: baseUrl,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      params,
    })

    if (response.code !== 0 || !response.data) {
      throw createError({
        statusCode: 502,
        statusMessage: response.message || 'Invalid sub2api users response',
      })
    }

    const dailyAmounts = await readDailyAmounts()

    return {
      ...response.data,
      items: response.data.items.map((user) => ({
        ...user,
        daily_amount: dailyAmounts[user.email.toLowerCase()] ?? null,
      })),
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Failed to load users from sub2api',
    })
  }
})
