import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
import { probeDb } from './core/db/status'
import { installErrorCapture } from './core/debug/capture'
import { warmStrokeCache } from './core/handwriting/templates'
import { installTtsUnlock } from './core/tts'
import { startSync } from './core/sync/useSync'
import './styles/app.css'

const app = createApp(App)
installErrorCapture(app)
installTtsUnlock()
void probeDb()
startSync()
app.use(createPinia()).use(router).mount('#app')

// 首屏之後再背景預抓筆畫檔（離線可用）
setTimeout(() => void warmStrokeCache(__APP_VERSION__).catch(() => {}), 8000)
