<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type AccountStatsRow = {
  id: string
  account_name: string
  status: string | null
  request_count: string
  avg_first_token: string | null
  error_windows: string
  total_windows: string
  availability_10m: string | null
  latest_request_at: string | null
}

type AccountStatsResponse = {
  items: AccountStatsRow[]
}

const isAdminAuthenticated = useState<boolean>('admin-authenticated', () => false)
const columns: TableColumn<AccountStatsRow>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'account_name', header: '账号名称' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'request_count', header: '请求数' },
  { id: 'avg_first_token', header: '平均首 Token' },
  { id: 'error_windows', header: '异常窗口 / 总窗口' },
  { id: 'availability_10m', header: '10 分钟可用率' },
  { id: 'latest_request_at', header: '最近请求时间' },
]

const { data, error, pending, refresh } = await useFetch<AccountStatsResponse>('/api/account-stats', {
  immediate: false,
  watch: false,
})

const accounts = computed(() => data.value?.items || [])
const activeAccounts = computed(() => accounts.value.filter((account) => account.status === 'active').length)

watch(isAdminAuthenticated, (authenticated) => {
  if (authenticated) refresh()
}, { immediate: true })

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}

function formatStatus(status: string | null): string {
  if (status === 'active') return '启用'
  if (status === 'inactive') return '停用'
  return status || '-'
}

function statusColor(status: string | null): 'success' | 'error' | 'neutral' {
  if (status === 'active') return 'success'
  if (status === 'inactive') return 'error'
  return 'neutral'
}

function formatAvailability(value: string | null): string {
  return value === null ? '-' : `${value}%`
}

function formatFirstToken(value: string | null): string {
  return value === null ? '-' : `${value}s`
}
</script>

<template>
  <AdminGate>
    <main class="min-h-screen bg-neutral-100">
      <div class="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-medium text-primary">Sub2API Admin</p>
            <h1 class="mt-1 text-2xl font-semibold text-highlighted">账号统计</h1>
          </div>
          <nav class="flex flex-wrap gap-2" aria-label="页面导航">
            <UButton label="用户列表" to="/" color="neutral" variant="outline" />
            <UButton label="请求排查" to="/request-error" color="neutral" variant="outline" />
            <UButton label="刷新" icon="i-lucide-refresh-cw" color="primary" :loading="pending" @click="refresh()" />
          </nav>
        </header>

        <section class="mb-5 grid gap-4 sm:grid-cols-2" aria-label="账号统计摘要">
          <UCard><p class="text-sm text-muted">有请求账号</p><p class="mt-2 text-2xl font-semibold text-highlighted tabular-nums">{{ accounts.length }}</p></UCard>
          <UCard><p class="text-sm text-muted">启用账号</p><p class="mt-2 text-2xl font-semibold text-highlighted tabular-nums">{{ activeAccounts }}</p></UCard>
        </section>

        <UAlert v-if="error" class="mb-4" color="error" variant="subtle" :title="`账号统计加载失败：${error.statusMessage || error.message}`" />

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <div class="overflow-x-auto">
            <UTable :data="accounts" :columns="columns" :loading="pending && !data" class="min-w-[1030px]">
              <template #id-cell="{ row }"><span class="font-mono text-xs">{{ row.original.id }}</span></template>
              <template #status-cell="{ row }"><UBadge :color="statusColor(row.original.status)" variant="subtle" :label="formatStatus(row.original.status)" /></template>
              <template #request_count-cell="{ row }"><span class="tabular-nums">{{ row.original.request_count }}</span></template>
              <template #avg_first_token-cell="{ row }"><span class="tabular-nums">{{ formatFirstToken(row.original.avg_first_token) }}</span></template>
              <template #error_windows-cell="{ row }"><span class="tabular-nums">{{ row.original.error_windows }} / {{ row.original.total_windows }}</span></template>
              <template #availability_10m-cell="{ row }"><span class="tabular-nums">{{ formatAvailability(row.original.availability_10m) }}</span></template>
              <template #latest_request_at-cell="{ row }">{{ formatDate(row.original.latest_request_at) }}</template>
              <template #empty><div class="p-10 text-center text-sm text-muted">暂无有请求记录的账号。</div></template>
            </UTable>
          </div>
        </UCard>
      </div>
    </main>
  </AdminGate>
</template>
