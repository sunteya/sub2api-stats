<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type User = {
  id: number
  email: string
  balance: number
  daily_amount: number | null
  concurrency: number
  current_concurrency?: number | null
  rpm_limit?: number | null
  status: string
  last_active_at?: string | null
  last_used_at?: string | null
  created_at: string
}

type UsersResponse = {
  items: User[]
  total: number
  page: number
  page_size: number
  pages: number
}

type DailyUsageResponse = {
  items: Array<{ email: string; daily_used: number }>
}

type ResetDailyBalanceResponse = {
  email: string
  balance: number
  target: number
  amount: number
  new_balance: number
  skipped: boolean
}

type UsageProgressColor = 'primary' | 'secondary' | 'info' | 'warning' | 'error'

type UsageProgress = {
  value: number
  color: UsageProgressColor
  baseClass?: string
}

const usageProgressLayers = [
  { color: 'primary', baseClass: 'bg-primary' },
  { color: 'error', baseClass: 'bg-error' },
  { color: 'warning', baseClass: 'bg-warning' },
  { color: 'secondary', baseClass: 'bg-secondary' },
  { color: 'info', baseClass: 'bg-info' },
] as const satisfies ReadonlyArray<{ color: UsageProgressColor; baseClass: string }>

const page = ref(1)
const pageSize = 20
const resettingEmail = ref('')
const resetMessage = ref('')
const resetError = ref('')
const dailyUsageByEmail = ref<Record<string, number>>({})
const isAdminAuthenticated = useState<boolean>('admin-authenticated', () => false)
let dailyUsageRequest = 0

const columns: TableColumn<User>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'balance', header: '余额' },
  { id: 'usage', header: '使用额度' },
  { id: 'concurrency', header: '并发' },
  { accessorKey: 'rpm_limit', header: 'RPM' },
  { id: 'last_used_at', header: '最近使用' },
  { accessorKey: 'created_at', header: '创建时间' },
  { id: 'actions', header: '操作' },
]

const { data, error, pending, refresh } = await useFetch<UsersResponse>('/api/users', {
  query: { page, page_size: pageSize },
  immediate: false,
  watch: false,
})

const users = computed(() => data.value?.items || [])
const total = computed(() => data.value?.total || 0)
const pages = computed(() => data.value?.pages || 1)

watch(users, async (loadedUsers) => {
  const requestId = ++dailyUsageRequest
  const emails = loadedUsers.map((user) => user.email)
  dailyUsageByEmail.value = {}

  if (!emails.length) return

  try {
    const result = await $fetch<DailyUsageResponse>('/api/daily-usage', {
      method: 'POST',
      body: { emails },
    })

    if (requestId === dailyUsageRequest) {
      dailyUsageByEmail.value = Object.fromEntries(result.items.map((item) => [item.email.toLowerCase(), item.daily_used]))
    }
  } catch {
    if (requestId === dailyUsageRequest) dailyUsageByEmail.value = {}
  }
})

watch(isAdminAuthenticated, (authenticated) => {
  if (authenticated) refresh()
}, { immediate: true })

watch(page, () => {
  if (isAdminAuthenticated.value) refresh()
})

function formatDate(value?: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.trunc(value * 10) / 10)
}

function formatDailyAmount(value?: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value)
}

function getDailyUsage(email: string): number | null {
  return dailyUsageByEmail.value[email.toLowerCase()] ?? null
}

function getDailyUsagePercentage(user: User): number | null {
  const dailyUsage = getDailyUsage(user.email)
  const dailyAmount = user.daily_amount
  if (dailyUsage === null || !dailyAmount || dailyAmount <= 0) return null
  return dailyUsage / dailyAmount * 100
}

function getUsageProgress(user: User): UsageProgress {
  const percentage = Math.max(getDailyUsagePercentage(user) || 0, 0)
  const layerIndex = Math.max(Math.ceil(percentage / 100) - 1, 0)
  const layer = usageProgressLayers[layerIndex % usageProgressLayers.length]!
  const previousLayer = layerIndex > 0
    ? usageProgressLayers[(layerIndex - 1) % usageProgressLayers.length]!
    : null

  return {
    value: Math.min(percentage - layerIndex * 100, 100),
    color: layer.color,
    baseClass: previousLayer?.baseClass,
  }
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || '重置每日额度失败'
  }
  return error instanceof Error ? error.message : '重置每日额度失败'
}

function statusColor(status: string): 'success' | 'error' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'disabled' || status === 'inactive') return 'error'
  return 'neutral'
}

async function resetDailyBalance(user: User) {
  if (user.daily_amount === null || user.daily_amount === undefined) {
    resetError.value = `${user.email} 未设置每日金额。`
    resetMessage.value = ''
    return
  }

  resettingEmail.value = user.email
  resetMessage.value = ''
  resetError.value = ''

  try {
    const result = await $fetch<ResetDailyBalanceResponse>('/api/daily-amounts/reset', {
      method: 'POST',
      body: { email: user.email },
    })
    resetMessage.value = result.skipped
      ? `${user.email} 当前余额 ${formatNumber(result.balance)} 已达到每日金额 ${formatDailyAmount(result.target)}。`
      : `${user.email} 已增加 ${formatNumber(result.amount)}，余额约为 ${formatNumber(result.new_balance)}。`
    await refresh()
  } catch (error) {
    resetError.value = getErrorMessage(error)
  } finally {
    resettingEmail.value = ''
  }
}
</script>

<template>
  <AdminGate>
    <main class="min-h-screen bg-neutral-100">
      <div class="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-medium text-primary">Sub2API Admin</p>
            <h1 class="mt-1 text-2xl font-semibold text-highlighted">用户列表</h1>
          </div>
          <nav class="flex flex-wrap gap-2" aria-label="页面导航">
            <UButton label="请求排查" to="/request-error" color="neutral" variant="outline" />
            <UButton label="账号统计" to="/account-stats" color="neutral" variant="outline" />
            <UButton label="刷新" icon="i-lucide-refresh-cw" color="primary" :loading="pending" @click="refresh()" />
          </nav>
        </header>

        <section class="mb-5 grid gap-4 sm:grid-cols-3" aria-label="用户列表统计">
          <UCard><p class="text-sm text-muted">总用户</p><p class="mt-2 text-2xl font-semibold text-highlighted tabular-nums">{{ total }}</p></UCard>
          <UCard><p class="text-sm text-muted">当前页</p><p class="mt-2 text-2xl font-semibold text-highlighted tabular-nums">{{ page }} / {{ pages }}</p></UCard>
          <UCard><p class="text-sm text-muted">每页</p><p class="mt-2 text-2xl font-semibold text-highlighted tabular-nums">{{ pageSize }}</p></UCard>
        </section>

        <div class="mb-4 space-y-3">
          <UAlert v-if="resetError" color="error" variant="subtle" :title="resetError" />
          <UAlert v-if="resetMessage" color="success" variant="subtle" :title="resetMessage" />
          <UAlert v-if="error" color="error" variant="subtle" :title="`用户列表加载失败：${error.statusMessage || error.message}`" />
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <UTable :data="users" :columns="columns" :loading="pending && !data" class="min-w-[1200px]">
              <template #id-cell="{ row }"><span class="font-mono text-xs tabular-nums">{{ row.original.id }}</span></template>
              <template #status-cell="{ row }"><UBadge :color="statusColor(row.original.status)" variant="subtle" :label="row.original.status" /></template>
              <template #balance-cell="{ row }">
                <div class="tabular-nums">
                  {{ formatNumber(row.original.balance) }}
                </div>
              </template>
              <template #usage-cell="{ row }">
                <div v-if="getDailyUsagePercentage(row.original) !== null" class="min-w-40">
                  <div class="text-xs text-muted tabular-nums">{{ formatNumber(getDailyUsage(row.original.email)) }} / {{ formatDailyAmount(row.original.daily_amount) }} ({{ formatNumber(getDailyUsagePercentage(row.original)) }}%)</div>
                  <UProgress
                    :model-value="getUsageProgress(row.original).value"
                    :color="getUsageProgress(row.original).color"
                    :ui="{ base: getUsageProgress(row.original).baseClass }"
                    size="sm"
                    class="mt-1.5"
                  />
                </div>
                <span v-else>-</span>
              </template>
              <template #concurrency-cell="{ row }"><span class="tabular-nums">{{ row.original.current_concurrency ?? 0 }} / {{ row.original.concurrency }}</span></template>
              <template #rpm_limit-cell="{ row }"><span class="tabular-nums">{{ row.original.rpm_limit ?? '-' }}</span></template>
              <template #last_used_at-cell="{ row }">{{ formatDate(row.original.last_used_at || row.original.last_active_at) }}</template>
              <template #created_at-cell="{ row }">{{ formatDate(row.original.created_at) }}</template>
              <template #actions-cell="{ row }">
                <div class="flex items-center gap-2">
                  <UButton label="设置每日金额" size="xs" color="neutral" variant="outline" :to="{ path: '/daily-amounts', query: { email: row.original.email } }" />
                  <UButton label="重置每日额度" size="xs" color="primary" :loading="resettingEmail === row.original.email" :disabled="pending || row.original.daily_amount === null" @click="resetDailyBalance(row.original)" />
                </div>
              </template>
              <template #empty><div class="p-10 text-center text-sm text-muted">暂无用户。</div></template>
            </UTable>
          </div>
        </UCard>

        <div class="mt-4 flex justify-end">
          <UPagination v-model:page="page" :total="total" :items-per-page="pageSize" :sibling-count="1" show-edges />
        </div>
      </div>
    </main>
  </AdminGate>
</template>
