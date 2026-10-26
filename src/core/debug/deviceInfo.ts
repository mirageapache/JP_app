/** 除錯面板顯示的裝置資訊 */
export interface DeviceInfo {
  userAgent: string
  standalone: boolean
  online: boolean
  viewport: string
  devicePixelRatio: number
  storagePersisted: boolean | null
  storageUsage: string | null
  serviceWorker: 'controlled' | 'registered' | 'none' | 'unsupported' | 'unknown'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

async function storageInfo(): Promise<Pick<DeviceInfo, 'storagePersisted' | 'storageUsage'>> {
  const out: Pick<DeviceInfo, 'storagePersisted' | 'storageUsage'> = { storagePersisted: null, storageUsage: null }
  if (!navigator.storage) return out
  try {
    if (navigator.storage.persisted) out.storagePersisted = await withTimeout(navigator.storage.persisted(), 1000, null)
  } catch {
    /* 不支援時略過 */
  }
  try {
    const est = navigator.storage.estimate ? await withTimeout(navigator.storage.estimate(), 1000, undefined) : undefined
    if (est) out.storageUsage = `${formatBytes(est.usage ?? 0)} / ${formatBytes(est.quota ?? 0)}`
  } catch {
    /* 不支援時略過 */
  }
  return out
}

async function serviceWorkerState(): Promise<DeviceInfo['serviceWorker']> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  try {
    if (navigator.serviceWorker.controller) return 'controlled'
    const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 1000, undefined)
    return reg ? 'registered' : 'none'
  } catch {
    return 'unknown'
  }
}

/** 是否從主畫面（standalone）開啟；同步、可在 setup 階段直接用 */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  let standalone = nav.standalone === true
  try {
    standalone ||= matchMedia('(display-mode: standalone)').matches
  } catch {
    /* 舊環境沒有 matchMedia */
  }
  return standalone
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const standalone = isStandalone()

  const [storage, serviceWorker] = await Promise.all([storageInfo(), serviceWorkerState()])

  return {
    userAgent: navigator.userAgent,
    standalone,
    online: navigator.onLine,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    ...storage,
    serviceWorker,
  }
}
