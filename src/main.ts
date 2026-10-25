import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './app/router'
import { installErrorCapture } from './core/debug/capture'
import { installTtsUnlock } from './core/tts'
import './styles/app.css'

const app = createApp(App)
installErrorCapture(app)
installTtsUnlock()
app.use(createPinia()).use(router).mount('#app')
