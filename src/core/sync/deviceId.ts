const KEY = 'jp-app.deviceId'

/** 裝置識別碼：本機產生、不同步；資料被清除時會重新產生（規劃書 §5.3 syncMeta） */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return 'unknown-device'
  }
}
