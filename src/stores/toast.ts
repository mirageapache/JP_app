import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 全站唯一的 Toast（design-system §6：3 秒）；由 App.vue 的 <AppToast> 顯示，任何頁面呼叫 show() 即可 */
export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(text: string, durationMs = 3000) {
    message.value = text
    clearTimeout(timer)
    timer = setTimeout(() => (message.value = ''), durationMs)
  }

  return { message, show }
})
