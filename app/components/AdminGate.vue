<script setup lang="ts">
type AdminSessionResponse = {
  authenticated: boolean
}

const authenticated = useState<boolean>('admin-authenticated', () => false)
const checking = ref(true)
const submitting = ref(false)
const passwordDraft = ref('')
const errorMessage = ref('')

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { statusMessage?: string; message?: string }
    return data.statusMessage || data.message || '管理密钥校验失败'
  }

  return error instanceof Error ? error.message : '管理密钥校验失败'
}

async function checkSession() {
  checking.value = true
  errorMessage.value = ''

  try {
    const session = await $fetch<AdminSessionResponse>('/api/admin-session')
    authenticated.value = session.authenticated
  } catch (error) {
    authenticated.value = false
    errorMessage.value = getErrorMessage(error)
  } finally {
    checking.value = false
  }
}

async function submitPassword() {
  const password = passwordDraft.value.trim()

  if (!password) {
    errorMessage.value = '请输入管理密钥。'
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const session = await $fetch<AdminSessionResponse>('/api/admin-session', {
      method: 'POST',
      body: { password },
    })

    authenticated.value = session.authenticated
    passwordDraft.value = ''
  } catch (error) {
    authenticated.value = false
    errorMessage.value = getErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(checkSession)
</script>

<template>
  <slot v-if="authenticated" />
  <main v-else class="grid min-h-screen place-items-center bg-neutral-100 p-5">
    <UCard class="w-full max-w-md">
      <template #header>
        <p class="text-sm font-medium text-primary">Sub2API Admin</p>
        <h1 class="mt-1 text-2xl font-semibold text-highlighted">输入管理密钥</h1>
      </template>

      <div class="space-y-5">
        <UAlert v-if="checking" color="neutral" variant="subtle" title="正在检查管理权限..." />
        <UAlert v-else-if="errorMessage" color="error" variant="subtle" :title="errorMessage" />

        <form class="space-y-5" @submit.prevent="submitPassword">
          <UFormField label="管理密钥" name="password">
            <UInput v-model="passwordDraft" type="password" autocomplete="current-password" autofocus :disabled="checking || submitting" class="w-full" />
          </UFormField>
          <UButton type="submit" label="进入管理" color="primary" :loading="submitting" :disabled="checking || submitting" block />
        </form>
      </div>
    </UCard>
  </main>
</template>
