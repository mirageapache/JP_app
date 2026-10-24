import type { CharTemplate, StrokeIndex } from './types'

/** 讀取 public/content/strokes/（由 Service Worker 以 CacheFirst 快取） */

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
