import { useToastStore } from '@/stores/toast'

/** 頁面用：`const { show } = useToast()`；顯示由 App.vue 的 <AppToast> 統一負責 */
export function useToast() {
  const store = useToastStore()
  return { show: store.show }
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
