<script setup lang="ts">
const { data, error, pending } = await useFetch('/api/config')
</script>

<template>
  <main class="page">
    <section class="panel">
      <p class="label">APP_DISPLAY_NAME</p>
      <h1>{{ data?.appDisplayName || 'Not configured' }}</h1>
      <p v-if="pending" class="status">Loading server config...</p>
      <p v-else-if="error" class="status error">Failed to load server config.</p>
    </section>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: #f5f7fb;
  color: #111827;
  padding: 24px;
}

.panel {
  width: min(100%, 560px);
  border: 1px solid #d6dbe6;
  border-radius: 8px;
  background: #ffffff;
  padding: 32px;
  box-shadow: 0 18px 48px rgb(17 24 39 / 8%);
}

.label {
  margin: 0 0 12px;
  color: #536078;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0;
}

h1 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: clamp(2rem, 8vw, 3rem);
  font-weight: 700;
}

.status {
  margin: 16px 0 0;
  color: #536078;
}

.error {
  color: #b42318;
}
</style>
