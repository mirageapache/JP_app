import type { CardType, Skill } from './types'

/**
 * 卡片 ID 的唯一出入口（規劃書 §5.1）：`<type>:<key>#<skill>`，例如 kana:あ#write。
 * 所有拼接與拆解都走這裡；P2 加入 vocab、P4 加入 kanji 時只改這個檔與型別。
 */

const CARD_TYPES: readonly string[] = ['kana'] satisfies readonly CardType[]
const SKILLS: readonly string[] = ['read', 'write'] satisfies readonly Skill[]

export function isCardType(x: string): x is CardType {
  return CARD_TYPES.includes(x)
}
export function isSkill(x: string): x is Skill {
  return SKILLS.includes(x)
}

export function makeCardId(itemId: string, skill: Skill): string {
  return `${itemId}#${skill}`
}

export interface ParsedCardId {
  itemId: string
  type: CardType
  /** 項目在類型內的鍵，例如 あ */
  key: string
  skill: Skill
}

/** 解析失敗回傳 null（來自雲端或備份的 ID 不可信） */
export function tryParseCardId(cardId: string): ParsedCardId | null {
  const hash = cardId.lastIndexOf('#')
  const colon = cardId.indexOf(':')
  if (hash <= 0 || colon <= 0 || colon > hash) return null
  const type = cardId.slice(0, colon)
  const key = cardId.slice(colon + 1, hash)
  const skill = cardId.slice(hash + 1)
  if (!isCardType(type) || !isSkill(skill) || !key) return null
  return { itemId: cardId.slice(0, hash), type, key, skill }
}

export function parseCardId(cardId: string): ParsedCardId {
  const parsed = tryParseCardId(cardId)
  if (!parsed) throw new Error(`無效的卡片 ID：${cardId}`)
  return parsed
}

export function isValidCardId(x: unknown): x is string {
  return typeof x === 'string' && tryParseCardId(x) !== null
}

/** 項目 ID 去掉類型前綴：kana:あ → あ */
export function itemKey(itemId: string): string {
  return itemId.slice(itemId.indexOf(':') + 1)
}

/** 顯示用：kana:あ#write → あ */
export function displayKeyOf(cardId: string): string {
  return parseCardId(cardId).key
}
