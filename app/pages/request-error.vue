<script setup lang="ts">
type RequestErrorResult = {
  requestId: string
  matchedFrom: string
  account: { id: string | null; name: string | null; status: string | null; errorMessage: string | null }
  request: { model: string | null; usageCreatedAt: string | null; errorCreatedAt: string | null; firstTokenMs: number | null; durationMs: number | null }
  error: { phase: string | null; type: string | null; severity: string | null; statusCode: number | null; upstreamStatusCode: number | null; source: string | null; owner: string | null; providerCode: string | null; providerType: string | null; networkType: string | null; summary: string | null; summarySource: string | null }
  rawErrors: Record<string, string | null>
}

const route = useRoute()
const requestId = ref(String(route.query.request_id || '').trim())
const result = ref<RequestErrorResult | null>(null)
const pending = ref(false)
const errorMessage = ref('')

const details = computed(() => {
  if (!result.value) return []
  const { account, request, error } = result.value
  return [
    ['匹配来源', result.value.matchedFrom], ['账号 ID', account.id], ['账号名称', account.name], ['账号状态', account.status],
    ['模型', request.model], ['使用记录时间', formatDate(request.usageCreatedAt)], ['错误记录时间', formatDate(request.errorCreatedAt)],
    ['首 Token', request.firstTokenMs === null ? null : `${request.firstTokenMs} ms`], ['请求耗时', request.durationMs === null ? null : `${request.durationMs} ms`],
    ['错误阶段', error.phase], ['错误类型', error.type], ['严重程度', error.severity], ['HTTP 状态码', error.statusCode],
    ['上游状态码', error.upstreamStatusCode], ['错误来源', error.source], ['错误归属', error.owner],
    ['供应商错误码', error.providerCode], ['供应商错误类型', error.providerType], ['网络错误类型', error.networkType],
  ].filter(([, value]) => value !== null && value !== '')
})

const rawErrors = computed(() => Object.entries(result.value?.rawErrors || {}).filter(([, value]) => value))

function formatDate(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value))
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || '请求排查失败'
  }
  return error instanceof Error ? error.message : '请求排查失败'
}

async function lookup() {
  const value = requestId.value.trim()
  if (!value) {
    errorMessage.value = '请输入请求 ID。'
    result.value = null
    return
  }

  pending.value = true
  errorMessage.value = ''
  try {
    result.value = await $fetch<RequestErrorResult>('/api/request-error', { query: { request_id: value } })
    await navigateTo({ query: { request_id: value } }, { replace: true })
  } catch (error) {
    result.value = null
    errorMessage.value = getErrorMessage(error)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AdminGate>
    <main class="min-h-screen bg-neutral-100">
      <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p class="text-sm font-medium text-primary">Sub2API Admin</p>
            <h1 class="mt-1 text-2xl font-semibold text-highlighted">请求排查</h1>
          </div>
          <nav class="flex flex-wrap gap-2" aria-label="页面导航">
            <UButton label="用户列表" to="/" color="neutral" variant="outline" />
            <UButton label="账号统计" to="/account-stats" color="neutral" variant="outline" />
          </nav>
        </header>

        <UCard class="mb-4">
          <form class="flex flex-col gap-4 sm:flex-row sm:items-end" @submit.prevent="lookup">
            <UFormField label="请求 ID" class="flex-1">
              <UInput v-model="requestId" autocomplete="off" placeholder="输入 request_id" :disabled="pending" class="w-full" />
            </UFormField>
            <UButton type="submit" label="查询" icon="i-lucide-search" color="primary" :loading="pending" />
          </form>
        </UCard>

        <UAlert v-if="errorMessage" class="mb-4" color="error" variant="subtle" :title="errorMessage" />

        <template v-if="result">
          <UCard class="mb-4">
            <div class="grid gap-5 sm:grid-cols-[minmax(200px,0.8fr)_minmax(0,2fr)]">
              <div><p class="text-sm text-muted">请求 ID</p><p class="mt-1 break-all font-mono text-sm text-highlighted">{{ result.requestId }}</p></div>
              <div><p class="text-sm text-muted">错误摘要</p><p class="mt-1 font-medium text-highlighted">{{ result.error.summary || '未记录错误详情' }}</p><p v-if="result.error.summarySource" class="mt-1 text-xs text-muted">来源：{{ result.error.summarySource }}</p></div>
            </div>
          </UCard>

          <UCard class="mb-4">
            <template #header><h2 class="font-semibold text-highlighted">请求详情</h2></template>
            <dl class="divide-y divide-default">
              <div v-for="[label, value] in details" :key="String(label)" class="grid gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                <dt class="text-sm text-muted">{{ label }}</dt><dd class="break-all text-sm text-highlighted tabular-nums">{{ value }}</dd>
              </div>
            </dl>
          </UCard>

          <UCard v-if="result.account.errorMessage" class="mb-4">
            <template #header><h2 class="font-semibold text-highlighted">账号错误信息</h2></template>
            <pre class="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-highlighted">{{ result.account.errorMessage }}</pre>
          </UCard>

          <UCard v-if="rawErrors.length">
            <template #header><h2 class="font-semibold text-highlighted">原始错误内容</h2></template>
            <div class="space-y-3">
              <details v-for="[source, value] in rawErrors" :key="source" class="rounded-md border border-default bg-elevated px-4 py-3">
                <summary class="cursor-pointer font-mono text-sm font-medium text-highlighted">{{ source }}</summary>
                <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted">{{ value }}</pre>
              </details>
            </div>
          </UCard>
        </template>
      </div>
    </main>
  </AdminGate>
</template>
