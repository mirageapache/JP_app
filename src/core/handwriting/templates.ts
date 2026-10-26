import type { CharTemplate, StrokeIndex } from './types'

/** 讀取 public/content/strokes/（由 Service Worker 以 StaleWhileRevalidate 快取） */

let indexPromise: Promise<StrokeIndex> | undefined
const cache = new Map<string, Promise<CharTemplate>>()

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`讀取 ${url} 失敗（${res.status}）`)
  return (await res.json()) as T
}

export function loadStrokeIndex(): Promise<StrokeIndex> {
  indexPromise ??= fetchJson<StrokeIndex>('/content/strokes/index.json')
  return indexPromise
}

export async function loadCharTemplate(char: string): Promise<CharTemplate> {
  let p = cache.get(char)
  if (!p) {
    p = (async () => {
      const index = await loadStrokeIndex()
      const entry = index.chars[char]
      if (!entry) throw new Error(`沒有「${char}」的筆畫資料`)
      return fetchJson<CharTemplate>(`/content/strokes/${entry.code}.json`)
    })()
    cache.set(char, p)
    p.catch(() => cache.delete(char))
  }
  return p
}

const WARM_KEY = 'jp-app.strokes-warmed'

/**
 * 背景把所有筆畫檔抓一次，讓 Service Worker 的執行期快取裝滿：加入主畫面後即使沒逛過 50 音表，
 * 離線也能出手寫題。每個 App 版本只做一次；沒有 Service Worker 控制頁面時不做（抓了也不會進快取）。
 */
export async function warmStrokeCache(appVersion: string): Promise<void> {
  try {
    if (localStorage.getItem(WARM_KEY) === appVersion) return
  } catch {
    return
  }
  if (!('serviceWorker' in navigator)) return
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
  }
  const index = await loadStrokeIndex()
  const codes = [...new Set(Object.values(index.chars).map((e) => e.code))]
  let failed = 0
  for (let i = 0; i < codes.length; i += 6) {
    await Promise.all(
      codes.slice(i, i + 6).map((code) =>
        fetch(`/content/strokes/${code}.json`).then((r) => {
          if (!r.ok) failed++
        }, () => failed++),
      ),
    )
  }
  if (failed === 0) {
    try {
      localStorage.setItem(WARM_KEY, appVersion)
    } catch {
      /* 存不了就下次再抓一次 */
    }
  }
}
