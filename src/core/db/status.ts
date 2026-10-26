import { reactive, readonly } from 'vue'
import { db } from './index'

/**
 * 本機資料庫是否可用。Safari 隱私模式、儲存空間被清除或版本升級失敗時 Dexie 會開不起來；
 * 這時各頁面會各自報錯，但使用者需要一個明確的全站訊息知道「不是 App 壞了，是資料庫」。
 */
const state = reactive<{ error: string | null }>({ error: null })
export const dbStatus = readonly(state)

export async function probeDb(): Promise<boolean> {
  try {
    await db.open()
    state.error = null
    return true
  } catch (e) {
    state.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    console.error('無法開啟本機資料庫', e)
    return false
  }
}
