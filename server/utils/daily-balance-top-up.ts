import { readDailyBalanceTopUpConfig, updateDailyBalanceTopUpLastRunDate } from './settings'

type AdminUser = {
  id: number
  email: string
  balance: number
}

type PaginatedUsers = {
  items: AdminUser[]
  page: number
  page_size: number
  pages: number
  total: number
}

type Sub2apiEnvelope<T> = {
  code?: number
  message?: string
  data?: T
}

type DailyBalanceTopUpOptions = {
  force?: boolean
  reason?: string
}

type DailyBalanceTopUpItem = {
  email: string
  user_id: number
  balance: number
  target: number
  amount: number
}

type DailyBalanceTopUpResult = {
  date: string
  reason: string
  skipped: boolean
  matched_users: number
  topped_up: DailyBalanceTopUpItem[]
  missing_users: string[]
  already_enough: string[]
}

type ManualDailyBalanceResetResult = {
  email: string
  user_id: number
  balance: number
  target: number
  amount: number
  new_balance: number
  skipped: boolean
  reason: 'already_enough' | 'topped_up'
}

type ManualBalanceTopUpResult = {
  user_id: number
  amount: number
  new_balance: number | null
}

let activeRun: Promise<DailyBalanceTopUpResult> | null = null

function getShanghaiDate(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

function getSub2apiConfig(): { baseUrl: string; apiKey: string } {
  const config = useRuntimeConfig()
  const baseUrl = String(config.sub2apiBaseUrl || '').trim()
  const apiKey = String(config.sub2apiKey || '').trim()

  if (!baseUrl) {
    throw new Error('SUB2API_BASE_URL is not configured')
  }

  if (!apiKey) {
    throw new Error('SUB2API_KEY is not configured')
  }

  return { baseUrl, apiKey }
}

async function fetchAllUsers(baseUrl: string, apiKey: string): Promise<AdminUser[]> {
  const pageSize = 100
  let page = 1
  const users: AdminUser[] = []

  while (true) {
    const response = await $fetch<Sub2apiEnvelope<PaginatedUsers>>('/api/v1/admin/users', {
      baseURL: baseUrl,
      headers: {
        accept: 'application/json',
        'x-api-key': apiKey,
      },
      params: {
        page,
        page_size: pageSize,
      },
    })

    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || 'Invalid sub2api users response')
    }

    users.push(...response.data.items)

    if (page >= response.data.pages || response.data.items.length === 0) {
      break
    }

    page += 1
  }

  return users
}

async function requestBalanceAddition(baseUrl: string, apiKey: string, userId: number, amount: number, notes: string): Promise<AdminUser | null> {
  const response = await $fetch<Sub2apiEnvelope<AdminUser>>(`/api/v1/admin/users/${userId}/balance`, {
    method: 'POST',
    baseURL: baseUrl,
    headers: {
      accept: 'application/json',
      'x-api-key': apiKey,
    },
    body: {
      balance: amount,
      operation: 'add',
      notes,
    },
  })

  if (response.code !== 0) {
    throw new Error(response.message || `Failed to top up user ${userId}`)
  }

  return response.data || null
}

async function addDailyUserBalance(baseUrl: string, apiKey: string, item: DailyBalanceTopUpItem, date: string): Promise<void> {
  await requestBalanceAddition(baseUrl, apiKey, item.user_id, item.amount, `Daily balance top-up ${date}`)
}

async function runDailyBalanceTopUpNow(options: DailyBalanceTopUpOptions = {}): Promise<DailyBalanceTopUpResult> {
  const reason = options.reason || 'manual'
  const date = getShanghaiDate()
  const config = await readDailyBalanceTopUpConfig()
  const targetEntries = Object.entries(config.users)

  if (!options.force && config.last_run_date === date) {
    return {
      date,
      reason,
      skipped: true,
      matched_users: 0,
      topped_up: [],
      missing_users: [],
      already_enough: [],
    }
  }

  const { baseUrl, apiKey } = getSub2apiConfig()
  const users = await fetchAllUsers(baseUrl, apiKey)
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))
  const toppedUp: DailyBalanceTopUpItem[] = []
  const missingUsers: string[] = []
  const alreadyEnough: string[] = []
  let matchedUsers = 0

  for (const [email, target] of targetEntries) {
    const user = userByEmail.get(email)

    if (!user) {
      missingUsers.push(email)
      continue
    }

    matchedUsers += 1

    const balance = Number(user.balance)

    if (!Number.isFinite(balance)) {
      throw new Error(`Invalid balance for ${email}`)
    }

    const amount = Math.ceil(target - balance)

    if (amount <= 0) {
      alreadyEnough.push(email)
      continue
    }

    const item: DailyBalanceTopUpItem = {
      email,
      user_id: user.id,
      balance,
      target,
      amount,
    }

    await addDailyUserBalance(baseUrl, apiKey, item, date)
    toppedUp.push(item)
  }

  await updateDailyBalanceTopUpLastRunDate(date)

  return {
    date,
    reason,
    skipped: false,
    matched_users: matchedUsers,
    topped_up: toppedUp,
    missing_users: missingUsers,
    already_enough: alreadyEnough,
  }
}

export async function resetUserDailyBalance(email: string): Promise<ManualDailyBalanceResetResult> {
  const normalizedEmail = String(email || '').trim().toLowerCase()

  if (!normalizedEmail) {
    throw new Error('Email is required')
  }

  const config = await readDailyBalanceTopUpConfig()
  const target = config.users[normalizedEmail]

  if (target === undefined) {
    throw new Error(`${normalizedEmail} has no daily amount configured`)
  }

  const { baseUrl, apiKey } = getSub2apiConfig()
  const users = await fetchAllUsers(baseUrl, apiKey)
  const user = users.find((user) => user.email.toLowerCase() === normalizedEmail)

  if (!user) {
    throw new Error(`${normalizedEmail} was not found in sub2api users`)
  }

  const balance = Number(user.balance)

  if (!Number.isFinite(balance)) {
    throw new Error(`Invalid balance for ${normalizedEmail}`)
  }

  const amount = Math.ceil(target - balance)
  const result: ManualDailyBalanceResetResult = {
    email: normalizedEmail,
    user_id: user.id,
    balance,
    target,
    amount: Math.max(amount, 0),
    new_balance: balance + Math.max(amount, 0),
    skipped: amount <= 0,
    reason: amount <= 0 ? 'already_enough' : 'topped_up',
  }

  if (amount <= 0) {
    return result
  }

  await addDailyUserBalance(baseUrl, apiKey, {
    email: normalizedEmail,
    user_id: user.id,
    balance,
    target,
    amount,
  }, getShanghaiDate())

  return result
}

export async function addManualUserBalance(userId: number, rawAmount: number): Promise<ManualBalanceTopUpResult> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Invalid user ID')
  }

  const amount = Math.round(rawAmount * 10) / 10

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  const { baseUrl, apiKey } = getSub2apiConfig()
  const user = await requestBalanceAddition(baseUrl, apiKey, userId, amount, `Manual balance top-up ${getShanghaiDate()}`)
  const newBalance = Number(user?.balance)

  return {
    user_id: userId,
    amount,
    new_balance: Number.isFinite(newBalance) ? newBalance : null,
  }
}

export async function runDailyBalanceTopUp(options: DailyBalanceTopUpOptions = {}): Promise<DailyBalanceTopUpResult> {
  if (activeRun) {
    return activeRun
  }

  activeRun = runDailyBalanceTopUpNow(options).finally(() => {
    activeRun = null
  })

  return activeRun
}
