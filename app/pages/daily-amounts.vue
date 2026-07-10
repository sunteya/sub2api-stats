<script setup lang="ts">
type User = {
  id: number
  email: string
  username: string | null
  balance: number
  daily_amount: number | null
}

type UsersResponse = {
  items: User[]
}

const route = useRoute()
const selectedEmail = computed(() => String(route.query.email || '').trim())
const amountDraft = ref<number | null>(null)
const savedDailyAmount = ref<number | null | undefined>()
const saving = ref(false)
const saveError = ref('')
const isAdminAuthenticated = useState<boolean>('admin-authenticated', () => false)

const { data, error, pending, refresh } = await useFetch<UsersResponse>('/api/users', {
  query: { page: 1, page_size: 100, search: selectedEmail },
  immediate: false,
  watch: false,
})

const selectedUser = computed(() => {
  const email = selectedEmail.value.toLowerCase()
  return email ? data.value?.items.find((user) => user.email.toLowerCase() === email) || null : null
})

const currentDailyAmount = computed(() => savedDailyAmount.value === undefined ? selectedUser.value?.daily_amount ?? null : savedDailyAmount.value)

watch(selectedUser, (user) => {
  savedDailyAmount.value = undefined
  amountDraft.value = user?.daily_amount ?? null
}, { immediate: true })

watch([isAdminAuthenticated, selectedEmail], ([authenticated]) => {
  if (authenticated) refresh()
}, { immediate: true })

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.trunc(value * 10) / 10)
}

function formatDailyAmount(value?: number | null): string {
  if (value === null || value === undefined) return '-'
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(value)
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || '每日金额保存失败'
  }
  return error instanceof Error ? error.message : '每日金额保存失败'
}

async function saveDailyAmount() {
  if (!selectedUser.value) {
    saveError.value = '没有找到要编辑的用户。'
    return
  }

  const amount = amountDraft.value === null ? null : Math.round(amountDraft.value * 10) / 10
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    saveError.value = '每日金额必须是大于等于 0 的数字。'
    return
  }

  saveError.value = ''
  saving.value = true

  try {
    const user = selectedUser.value
    await $fetch('/api/daily-amounts', {
      method: 'PUT',
      body: { amounts: { [user.email]: amount } },
    })
    user.daily_amount = amount
    savedDailyAmount.value = amount
    await navigateTo('/')
  } catch (error) {
    saveError.value = getErrorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AdminGate>
    <main class="min-h-screen bg-neutral-100">
      <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-medium text-primary">Sub2API Admin</p>
            <h1 class="mt-1 text-2xl font-semibold text-highlighted">设置每日金额</h1>
          </div>
          <UButton label="返回用户列表" to="/" color="neutral" variant="outline" />
        </header>

        <UCard>
          <UAlert v-if="saveError" color="error" variant="subtle" :title="saveError" />
          <UAlert v-else-if="!selectedEmail" color="neutral" variant="subtle" title="请从用户列表选择一个用户。" />
          <UAlert v-else-if="error" color="error" variant="subtle" :title="`用户加载失败：${error.statusMessage || error.message}`" />
          <UAlert v-else-if="pending && !data" color="neutral" variant="subtle" title="正在加载用户..." />
          <UAlert v-else-if="!selectedUser" color="neutral" variant="subtle" :title="`没有找到 ${selectedEmail}。`" />

          <form v-else class="space-y-6" @submit.prevent="saveDailyAmount">
            <div class="grid gap-4 sm:grid-cols-3">
              <div><p class="text-sm text-muted">邮箱</p><p class="mt-1 break-all font-mono text-sm text-highlighted">{{ selectedUser.email }}</p></div>
              <div><p class="text-sm text-muted">用户名</p><p class="mt-1 font-medium text-highlighted">{{ selectedUser.username || '-' }}</p></div>
              <div><p class="text-sm text-muted">余额 / 每日金额</p><p class="mt-1 font-medium text-highlighted tabular-nums">{{ formatNumber(selectedUser.balance) }} / {{ formatDailyAmount(currentDailyAmount) }}</p></div>
            </div>

            <UFormField label="每日金额" help="留空表示不设置每日金额。">
              <UInputNumber v-model="amountDraft" :min="0" :step="0.1" class="w-full sm:max-w-xs" />
            </UFormField>

            <div class="flex justify-end">
              <UButton type="submit" label="保存" color="primary" :loading="saving" :disabled="pending" />
            </div>
          </form>
        </UCard>
      </div>
    </main>
  </AdminGate>
</template>
