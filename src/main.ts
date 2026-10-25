import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
import { installErrorCapture } from './core/debug/capture'
import { installTtsUnlock } from './core/tts'
import { startSync } from './core/sync/useSync'
import './styles/app.css'

const app = createApp(App)
installErrorCapture(app)
installTtsUnlock()
startSync()
app.use(createPinia()).use(router).mount('#app')
