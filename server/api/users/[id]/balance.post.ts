import { requireAdmin } from '../../../utils/admin-auth'
import { addManualUserBalance } from '../../../utils/daily-balance-top-up'

export default defineEventHandler(async (event) => {
  requireAdmin(event)

  const userId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{ amount?: unknown }>(event)
  const amount = Math.round(Number(body?.amount) * 10) / 10

  if (!Number.isInteger(userId) || userId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid user ID',
    })
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Amount must be greater than 0',
    })
  }

  try {
    return await addManualUserBalance(userId, amount)
  } catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error instanceof Error ? error.message : 'Failed to add user balance',
    })
  }
})
