import { runDailyBalanceTopUp } from '../utils/daily-balance-top-up'

export default defineNitroPlugin(() => {
  setTimeout(() => {
    runDailyBalanceTopUp({ reason: 'startup' })
      .then((result) => {
        if (result.skipped) {
          console.log(`[daily-balance-top-up] skipped for ${result.date}`)
          return
        }

        console.log(`[daily-balance-top-up] topped up ${result.topped_up.length} users for ${result.date}`)
      })
      .catch((error) => {
        console.error('[daily-balance-top-up] failed', error)
      })
  }, 0)
})
