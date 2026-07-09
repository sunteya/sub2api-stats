export default defineNuxtConfig({
  compatibilityDate: '2026-07-09',
  runtimeConfig: {
    appDisplayName: process.env.APP_DISPLAY_NAME || '',
  },
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
})
