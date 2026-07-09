import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stringify, parse } from 'yaml'

export type DailyAmounts = Record<string, number>

export type DailyBalanceTopUpConfig = {
  last_run_date: string
  users: DailyAmounts
}

type RawSettings = Record<string, unknown>

const settingsPath = resolve(process.cwd(), 'settings.yml')

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function readAmount(value: unknown): number | null {
  const amount = typeof value === 'string' ? Number(value.trim()) : Number(value)

  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  return Math.round(amount * 10) / 10
}

function normalizeUsers(value: unknown): DailyAmounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const users: DailyAmounts = {}

  for (const [email, rawAmount] of Object.entries(value)) {
    const normalizedEmail = normalizeEmail(email)
    const amount = readAmount(rawAmount)

    if (normalizedEmail && amount !== null) {
      users[normalizedEmail] = amount
    }
  }

  return users
}

function normalizeDailyBalanceTopUpConfig(value: unknown): DailyBalanceTopUpConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      last_run_date: '',
      users: {},
    }
  }

  const config = value as Record<string, unknown>

  return {
    last_run_date: String(config.last_run_date || '').trim(),
    users: normalizeUsers(config.users),
  }
}

async function readRawSettings(): Promise<RawSettings> {
  let content = ''

  try {
    content = await readFile(settingsPath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {}
    }

    throw error
  }

  const parsed = parse(content) as unknown

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {}
  }

  return parsed as RawSettings
}

async function writeRawSettings(settings: RawSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, stringify(settings), 'utf8')
}

export async function readDailyBalanceTopUpConfig(): Promise<DailyBalanceTopUpConfig> {
  const settings = await readRawSettings()

  return normalizeDailyBalanceTopUpConfig(settings.daily_balance_top_up)
}

export async function writeDailyBalanceTopUpConfig(config: DailyBalanceTopUpConfig): Promise<DailyBalanceTopUpConfig> {
  const settings = await readRawSettings()
  const normalized = normalizeDailyBalanceTopUpConfig(config)

  settings.daily_balance_top_up = normalized
  await writeRawSettings(settings)

  return normalized
}

export async function updateDailyBalanceTopUpLastRunDate(lastRunDate: string): Promise<DailyBalanceTopUpConfig> {
  const config = await readDailyBalanceTopUpConfig()

  return writeDailyBalanceTopUpConfig({
    ...config,
    last_run_date: lastRunDate,
  })
}

export async function readDailyAmounts(): Promise<DailyAmounts> {
  return (await readDailyBalanceTopUpConfig()).users
}

export async function writeDailyAmounts(amounts: Record<string, unknown>): Promise<DailyAmounts> {
  const config = await readDailyBalanceTopUpConfig()
  const updated = await writeDailyBalanceTopUpConfig({
    ...config,
    users: normalizeUsers(amounts),
  })

  return updated.users
}

export async function updateDailyAmounts(amounts: Record<string, unknown>): Promise<DailyAmounts> {
  const config = await readDailyBalanceTopUpConfig()
  const users = { ...config.users }

  for (const [email, rawAmount] of Object.entries(amounts)) {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      continue
    }

    if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
      delete users[normalizedEmail]
      continue
    }

    const amount = readAmount(rawAmount)

    if (amount !== null) {
      users[normalizedEmail] = amount
    }
  }

  const updated = await writeDailyBalanceTopUpConfig({
    ...config,
    users,
  })

  return updated.users
}
