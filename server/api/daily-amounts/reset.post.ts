import { resetUserDailyBalance } from '../../utils/daily-balance-top-up'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: unknown }>(event)
  const email = String(body?.email || '').trim()

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required',
    })
  }

  try {
    return await resetUserDailyBalance(email)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset daily balance'
    const statusCode = message.includes('no daily amount configured') || message.includes('was not found') ? 400 : 502

    throw createError({
      statusCode,
      statusMessage: message,
    })
  }
})
