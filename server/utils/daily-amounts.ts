import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { stringify, parse } from 'yaml'

export type DailyAmounts = Record<string, number>

const dailyAmountsPath = resolve(process.cwd(), 'daily-amounts.yml')

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

export async function readDailyAmounts(): Promise<DailyAmounts> {
  let content = ''

  try {
    content = await readFile(dailyAmountsPath, 'utf8')
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

  const amounts: DailyAmounts = {}

  for (const [email, rawAmount] of Object.entries(parsed)) {
    const normalizedEmail = normalizeEmail(email)
    const amount = readAmount(rawAmount)

    if (normalizedEmail && amount !== null) {
      amounts[normalizedEmail] = amount
    }
  }

  return amounts
}

export async function writeDailyAmounts(amounts: Record<string, unknown>): Promise<DailyAmounts> {
  const normalized: DailyAmounts = {}

  for (const [email, rawAmount] of Object.entries(amounts)) {
    const normalizedEmail = normalizeEmail(email)
    const amount = readAmount(rawAmount)

    if (normalizedEmail && amount !== null) {
      normalized[normalizedEmail] = amount
    }
  }

  await mkdir(dirname(dailyAmountsPath), { recursive: true })
  await writeFile(dailyAmountsPath, stringify(normalized), 'utf8')

  return normalized
}

export async function updateDailyAmounts(amounts: Record<string, unknown>): Promise<DailyAmounts> {
  const existing = await readDailyAmounts()

  for (const [email, rawAmount] of Object.entries(amounts)) {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail) {
      continue
    }

    if (rawAmount === null || rawAmount === undefined || rawAmount === '') {
      delete existing[normalizedEmail]
      continue
    }

    const amount = readAmount(rawAmount)

    if (amount !== null) {
      existing[normalizedEmail] = amount
    }
  }

  return writeDailyAmounts(existing)
}
