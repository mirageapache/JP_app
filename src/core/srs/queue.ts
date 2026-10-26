import type { KanaItem } from '@/core/content/kana'
import { dayKey, endOfDay } from './day'
import type { CardRecord, Skill } from './types'

/**
 * 每日佇列（規劃書 §6.2「每日佇列」）：純函式，輸入卡片與內容，輸出今天要出的卡片。
 * - 到期複習卡（越久沒複習的越先）→ 新卡（依學習順序）
 * - 新卡上限以「項目」計：一個項目的第一張卡（辨識類）出現才算一個新項目
 * - 技能錯開：產出類（write）在同項目的辨識卡（read）畢業（Review 狀態且不是今天畢業）或被標記已會後才加入，
 *   不佔新項目額度；同一項目的兩種技能不會同一天第一次出現
 * - 到期複習超過 newPauseThreshold 時暫停新卡
 * - 通勤模式：排除 write 卡（延後到當天稍晚，不算逾期）
 */

export interface QueueInput {
  cards: CardRecord[]
  /** 可排程的項目（例如目前開放的假名），依學習順序 */
  items: KanaItem[]
  now: number
  /** 今天已導入的新項目數（今天第一次評分的 read 卡） */
  newItemsIntroducedToday: number
  dailyNewItems: number
  /** 「今天想多學一點」追加的項目數 */
  extraNewItems: number
  newPauseThreshold: number
  commuteMode: boolean
}

export interface QueueEntry {
  cardId: string
  itemId: string
  skill: Skill
  /** review：到期複習；new：新卡 */
  kind: 'review' | 'new'
}

export interface DailyQueue {
  entries: QueueEntry[]
  dueCount: number
  newCount: number
  /** 因到期複習太多而暫停新卡 */
  newPaused: boolean
  /** 通勤模式下延後的手寫卡數 */
  deferredWrite: number
}

const INTRO_SKILL: Skill = 'read'
const UNLOCK_AFTER: Skill = 'read'

const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)

export function buildDailyQueue(input: QueueInput): DailyQueue {
  // 設定值可能來自壞掉的備份或雲端；NaN 會讓「introduced >= budget」永遠 false 而把全部假名排成新卡
  const dailyNewItems = num(input.dailyNewItems, 0)
  const extraNewItems = num(input.extraNewItems, 0)
  const introducedToday = num(input.newItemsIntroducedToday, 0)
  const pauseThreshold = num(input.newPauseThreshold, Infinity)
  const byId = new Map(input.cards.map((c) => [c.id, c]))
  const cutoff = endOfDay(input.now)
  const entries: QueueEntry[] = []
  let deferredWrite = 0

  // 1. 到期複習（已開始的卡：reps > 0，未暫停，到期）
  const due = input.cards
    .filter((c) => !c.suspended && c.reps > 0 && c.due <= cutoff)
    .sort((a, b) => a.due - b.due)
  for (const c of due) {
    if (input.commuteMode && c.skill === 'write') {
      deferredWrite++
      continue
    }
    entries.push({ cardId: c.id, itemId: c.itemId, skill: c.skill, kind: 'review' })
  }
  const dueCount = entries.length

  const newPaused = due.length > pauseThreshold
  let newCount = 0

  // 2. 已導入項目解鎖的 write 卡（不佔新項目額度）
  for (const item of input.items) {
    if (!item.skills.includes('write') || input.commuteMode) continue
    const read = byId.get(`${item.id}#${UNLOCK_AFTER}`)
    const write = byId.get(`${item.id}#write`)
    const writeStarted = write ? write.reps > 0 || write.suspended : false
    const readKnown = read?.suspended === true // 標記已會（讀）後，寫仍要練
    const readGraduated = !!read && read.state === 2 && !read.suspended && read.lastReview !== null && dayKey(read.lastReview) !== dayKey(input.now)
    if (read && (readKnown || readGraduated) && !writeStarted && !newPaused) {
      entries.push({ cardId: `${item.id}#write`, itemId: item.id, skill: 'write', kind: 'new' })
      newCount++
    }
  }

  // 3. 新項目：read 卡尚未開始的項目，依學習順序，受每日上限限制
  const budget = newPaused ? 0 : Math.max(0, dailyNewItems + extraNewItems - introducedToday)
  let introduced = 0
  for (const item of input.items) {
    if (introduced >= budget) break
    if (!item.skills.includes(INTRO_SKILL)) continue
    const read = byId.get(`${item.id}#${INTRO_SKILL}`)
    if (read && (read.reps > 0 || read.suspended)) continue
    entries.push({ cardId: `${item.id}#${INTRO_SKILL}`, itemId: item.id, skill: INTRO_SKILL, kind: 'new' })
    introduced++
    newCount++
  }

  return { entries, dueCount, newCount, newPaused, deferredWrite }
}
