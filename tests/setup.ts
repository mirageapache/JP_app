import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'

/**
 * 測試環境沒有開發伺服器：把 /content/*.json 的 fetch 導向 public/ 下的檔案，
 * 讓內容載入（kana.json、strokes/*.json）在單元測試中也能運作。
 */
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  if (path.startsWith('/content/')) {
    try {
      const body = readFileSync(new URL(`../public${path}`, import.meta.url), 'utf8')
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }
  return realFetch(input, init)
}) as typeof fetch
