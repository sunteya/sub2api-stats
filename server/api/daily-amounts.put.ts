import { updateDailyAmounts } from '../utils/daily-amounts'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ amounts?: Record<string, unknown> }>(event)

  if (!body || !body.amounts || typeof body.amounts !== 'object' || Array.isArray(body.amounts)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body must include an amounts object',
    })
  }

  return {
    amounts: await updateDailyAmounts(body.amounts),
  }
})
