import { makeCardId } from '@/core/srs/cardId'
import type { Skill } from '@/core/srs/types'

/**
 * 假名內容包（public/content/kana.json，由 tools/kana/build_kana.py 產生）。
 * 內容只讀、隨版本更新；進度以 ID（kana:あ）連結（規劃書 §5.1）。
 */

export type KanaScript = 'hiragana' | 'katakana'
export type KanaGroup = 'seion' | 'dakuon' | 'handakuon' | 'youon' | 'small'
/** 假名的技能就是 SRS 的 Skill（讀、寫）；單一型別，避免兩個名字 */
export type KanaSkill = Skill

export interface StrokeVariant {
  id: string
  label: string
  default?: boolean
  /** null = 尚未提供筆畫資料（使用 KanjiVG 預設） */
  strokes?: null
}

export interface KanaItem {
  id: string
  char: string
  script: KanaScript
  group: KanaGroup
  row: string
  vowel: string | null
  column: number | null
  romaji: string
  order: number
  strokeCount: number | null
  skills: KanaSkill[]
  strokeVariants?: StrokeVariant[]
}

export interface KanaPack {
  version: number
  vowels: string[]
  rows: Record<Exclude<KanaGroup, 'small'>, string[]>
  items: KanaItem[]
}

let packPromise: Promise<KanaPack> | undefined

export function loadKanaPack(): Promise<KanaPack> {
  packPromise ??= fetch('/content/kana.json').then((res) => {
    if (!res.ok) throw new Error(`讀取假名內容失敗（${res.status}）`)
    return res.json() as Promise<KanaPack>
  })
  packPromise.catch(() => (packPromise = undefined))
  return packPromise
}

export async function findKana(char: string): Promise<KanaItem | undefined> {
  const pack = await loadKanaPack()
  return pack.items.find((i) => i.char === char)
}

export function kanaItemId(char: string): string {
  return `kana:${char}`
}

/** 卡片 ID = 項目 ID + # + 技能（規劃書 §5.1） */
export function kanaCardId(char: string, skill: KanaSkill): string {
  return makeCardId(kanaItemId(char), skill)
}

/** 五十音表的格子：依行 × 母音排列，缺的位置為 null */
export function kanaTable(items: KanaItem[], script: KanaScript, group: Exclude<KanaGroup, 'small' | 'youon'>): (KanaItem | null)[][] {
  const rows = new Map<string, (KanaItem | null)[]>()
  for (const item of items) {
    if (item.script !== script || item.group !== group) continue
    const row = rows.get(item.row) ?? [null, null, null, null, null]
    if (item.column !== null) row[item.column] = item
    rows.set(item.row, row)
  }
  return [...rows.values()]
}
