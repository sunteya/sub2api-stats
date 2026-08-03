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

type AddBalanceResponse = {
  user_id: number
  amount: number
  new_balance: number | null
}

type BalanceOperation = 'add' | 'reset'

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
const operationMessage = ref('')
const balanceModalOpen = ref(false)
const balanceUser = ref<User | null>(null)
const balanceOperation = ref<BalanceOperation>('add')
const amountDraft = ref<number | null>(null)
const balanceSubmitting = ref(false)
const balanceError = ref('')
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
const estimatedResetAmount = computed(() => {
  const user = balanceUser.value
  if (!user || user.daily_amount === null) return null
  return Math.max(Math.ceil(user.daily_amount - user.balance), 0)
})
const canSubmitBalanceOperation = computed(() => {
  const user = balanceUser.value
  if (!user) return false
  if (balanceOperation.value === 'reset') return user.daily_amount !== null

  const amount = amountDraft.value
  return amount !== null && Number.isFinite(amount) && amount > 0
})

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

function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

function statusColor(status: string): 'success' | 'error' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'disabled' || status === 'inactive') return 'error'
  return 'neutral'
}

function openBalanceModal(user: User) {
  balanceUser.value = user
  balanceOperation.value = 'add'
  amountDraft.value = user.daily_amount
  balanceError.value = ''
  balanceModalOpen.value = true
}

function selectBalanceOperation(operation: BalanceOperation) {
  balanceOperation.value = operation
  balanceError.value = ''
}

async function submitBalanceOperation() {
  const user = balanceUser.value
  const amount = amountDraft.value === null ? null : Math.round(amountDraft.value * 10) / 10

  if (!user) return

  if (balanceOperation.value === 'add' && (amount === null || !Number.isFinite(amount) || amount <= 0)) {
    balanceError.value = '追加金额必须是大于 0 的数字。'
    return
  }

  if (balanceOperation.value === 'reset' && user.daily_amount === null) {
    balanceError.value = `${user.email} 未设置每日金额。`
    return
  }

  balanceSubmitting.value = true
  balanceError.value = ''
  operationMessage.value = ''

  try {
    if (balanceOperation.value === 'reset') {
      const result = await $fetch<ResetDailyBalanceResponse>('/api/daily-amounts/reset', {
        method: 'POST',
        body: { email: user.email },
      })
      operationMessage.value = result.skipped
        ? `${user.email} 当前余额 ${formatNumber(result.balance)} 已达到每日金额 ${formatDailyAmount(result.target)}。`
        : `${user.email} 已增加 ${formatNumber(result.amount)}，余额约为 ${formatNumber(result.new_balance)}。`
    } else {
      const result = await $fetch<AddBalanceResponse>(`/api/users/${user.id}/balance`, {
        method: 'POST',
        body: { amount },
      })
      operationMessage.value = result.new_balance === null
        ? `${user.email} 已增加 ${formatNumber(result.amount)}。`
        : `${user.email} 已增加 ${formatNumber(result.amount)}，余额为 ${formatNumber(result.new_balance)}。`
    }

    balanceModalOpen.value = false
    await refresh()
  } catch (error) {
    balanceError.value = getErrorMessage(error, balanceOperation.value === 'reset' ? '重置每日额度失败' : '追加额度失败')
  } finally {
    balanceSubmitting.value = false
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
          <UAlert v-if="operationMessage" color="success" variant="subtle" :title="operationMessage" />
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
                  <UButton label="额度操作" size="xs" color="primary" :disabled="pending || balanceSubmitting" @click="openBalanceModal(row.original)" />
                </div>
              </template>
              <template #empty><div class="p-10 text-center text-sm text-muted">暂无用户。</div></template>
            </UTable>
          </div>
        </UCard>

        <UModal v-model:open="balanceModalOpen" title="额度操作" :description="balanceUser?.email" :ui="{ footer: 'justify-end' }">
          <template #body>
            <form v-if="balanceUser" id="balance-operation-form" class="space-y-5" @submit.prevent="submitBalanceOperation">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-sm text-muted">当前余额</p>
                  <p class="mt-1 font-medium text-highlighted tabular-nums">{{ formatNumber(balanceUser.balance) }}</p>
                </div>
                <div>
                  <p class="text-sm text-muted">每日金额</p>
                  <p class="mt-1 font-medium text-highlighted tabular-nums">{{ formatDailyAmount(balanceUser.daily_amount) }}</p>
                </div>
              </div>

              <UFieldGroup class="w-full" aria-label="额度操作类型">
                <UButton
                  label="追加额度"
                  class="flex-1 justify-center"
                  :color="balanceOperation === 'add' ? 'primary' : 'neutral'"
                  :variant="balanceOperation === 'add' ? 'solid' : 'outline'"
                  :aria-pressed="balanceOperation === 'add'"
                  @click="selectBalanceOperation('add')"
                />
                <UButton
                  label="重置每日额度"
                  class="flex-1 justify-center"
                  :color="balanceOperation === 'reset' ? 'primary' : 'neutral'"
                  :variant="balanceOperation === 'reset' ? 'solid' : 'outline'"
                  :aria-pressed="balanceOperation === 'reset'"
                  @click="selectBalanceOperation('reset')"
                />
              </UFieldGroup>

              <UAlert v-if="balanceError" color="error" variant="subtle" :title="balanceError" />

              <UFormField v-if="balanceOperation === 'add'" label="追加金额" required>
                <UInputNumber v-model="amountDraft" :min="0.1" :step="0.1" autofocus class="w-full" />
              </UFormField>

              <div v-else-if="balanceUser.daily_amount !== null" class="grid gap-4 sm:grid-cols-2">
                <div>
                  <p class="text-sm text-muted">目标余额</p>
                  <p class="mt-1 font-medium text-highlighted tabular-nums">{{ formatDailyAmount(balanceUser.daily_amount) }}</p>
                </div>
                <div>
                  <p class="text-sm text-muted">预计补充</p>
                  <p class="mt-1 font-medium text-highlighted tabular-nums">{{ formatNumber(estimatedResetAmount) }}</p>
                </div>
              </div>
              <UAlert v-else color="warning" variant="subtle" title="该用户未设置每日金额。" />
            </form>
          </template>
          <template #footer>
            <UButton label="取消" color="neutral" variant="outline" :disabled="balanceSubmitting" @click="balanceModalOpen = false" />
            <UButton
              type="submit"
              form="balance-operation-form"
              :label="balanceOperation === 'add' ? '确认追加' : '确认重置'"
              color="primary"
              :loading="balanceSubmitting"
              :disabled="!canSubmitBalanceOperation"
            />
          </template>
        </UModal>

        <div class="mt-4 flex justify-end">
          <UPagination v-model:page="page" :total="total" :items-per-page="pageSize" :sibling-count="1" show-edges />
        </div>
      </div>
    </main>
  </AdminGate>
</template>
