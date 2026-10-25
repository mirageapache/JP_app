import { reactive, readonly } from 'vue'
import { db, type Setting } from '@/core/db'

/**
 * 設定（規劃書 §5.3「設定的範圍」、設計原則 6）：
 * Dexie 是唯一來源，這裡的 reactive 物件只是讀取快取；寫入時先寫 Dexie，成功後再更新快取。
 * `updatedAt` 只在使用者實際修改時更新，初始化預設值不算（同步合併時避免新裝置預設值蓋掉雲端）。
 */

export interface SettingsSchema {
  /** 讀音標注預設顯示 */
  showFurigana: boolean
  /** 假名筆畫版本選擇：char → variantId */
  kanaStrokeVariants: Record<string, string>
  /** 手寫調校模式（device） */
  tuningMode: boolean
  /** 除錯面板（device） */
  debugPanel: boolean
}

type Key = keyof SettingsSchema

export const SETTING_DEFAULTS: SettingsSchema = {
  showFurigana: true,
  kanaStrokeVariants: {},
  tuningMode: false,
  debugPanel: false,
}

export const SETTING_SCOPE: Record<Key, Setting['scope']> = {
  showFurigana: 'account',
  kanaStrokeVariants: 'account',
  tuningMode: 'device',
  debugPanel: 'device',
}

const state = reactive<SettingsSchema>({ ...SETTING_DEFAULTS })
let loaded: Promise<void> | undefined

/** 從 Dexie 載入一次；之後讀取 `settings` 即可 */
export function loadSettings(): Promise<void> {
  loaded ??= (async () => {
    const rows = await db.settings.toArray()
    for (const row of rows) {
      if (row.key in SETTING_DEFAULTS) (state as Record<string, unknown>)[row.key] = row.value
    }
  })()
  return loaded
}

export const settings = readonly(state) as Readonly<SettingsSchema>

export async function setSetting<K extends Key>(key: K, value: SettingsSchema[K]): Promise<void> {
  await db.settings.put({ key, value, scope: SETTING_SCOPE[key], updatedAt: Date.now() })
  ;(state as SettingsSchema)[key] = value
}

/** 測試用：清除快取狀態 */
export function resetSettingsCache(): void {
  Object.assign(state, SETTING_DEFAULTS)
  loaded = undefined
}
