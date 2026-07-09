import { runDailyBalanceTopUp } from '../../utils/daily-balance-top-up'

export default defineTask({
  meta: {
    description: 'Top up listed users to their configured daily balance',
  },
  async run() {
    return runDailyBalanceTopUp({ reason: 'scheduled' })
  },
})
