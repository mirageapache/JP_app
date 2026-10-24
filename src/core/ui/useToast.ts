import { ref } from 'vue'

/** 簡單的 Toast 狀態；頁面以 `<div v-if="toast" class="toast">{{ toast }}</div>` 顯示 */
export function useToast(durationMs = 2000) {
  const toast = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  function show(message: string) {
    toast.value = message
    clearTimeout(timer)
    timer = setTimeout(() => (toast.value = ''), durationMs)
  }
  return { toast, show }
}

/** 複製文字到剪貼簿；iOS 需在使用者手勢內呼叫。回傳是否成功 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
