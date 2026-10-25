import type { KanaItem } from './kana'

/**
 * 辨識題的干擾選項（規劃書 F4、§6.5）：優先挑同行或同母音、同種類的假名，讓選項有辨別度；
 * 以 seed 決定順序，同一張卡每次出現選項一致，方便測試。
 */
export function pickDistractors(target: KanaItem, pool: KanaItem[], count = 3, seed = 0): KanaItem[] {
  const candidates = pool.filter((i) => i.id !== target.id && i.romaji !== target.romaji && i.script === target.script)
  const score = (i: KanaItem) =>
    (i.row === target.row ? 2 : 0) + (i.vowel !== null && i.vowel === target.vowel ? 1 : 0) + (i.group === target.group ? 1 : 0)
  const rnd = mulberry32(hash(target.id) + seed)
  const ranked = candidates
    .map((i) => ({ i, k: score(i) + rnd() * 0.9 }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.i)
  // 去除羅馬字重複（じ／ぢ、ず／づ）
  const seen = new Set([target.romaji])
  const out: KanaItem[] = []
  for (const i of ranked) {
    if (seen.has(i.romaji)) continue
    seen.add(i.romaji)
    out.push(i)
    if (out.length >= count) break
  }
  return out
}

/** 選項隨機排序（以 seed 固定） */
export function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
