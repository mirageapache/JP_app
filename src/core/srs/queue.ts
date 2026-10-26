import { makeCardId } from './cardId'
import { dayKey, endOfDay } from './day'
import type { CardRecord, CardType, SchedulableItem, Skill, SkillLadder } from './types'

/**
 * 每日佇列（規劃書 §6.2「每日佇列」）：純函式，輸入卡片、可排程項目與各類型的技能階梯，輸出今天要出的卡片。
 * 不認識任何內容型別——假名、單字、文法都只是 SchedulableItem + SkillLadder。
 * - 到期複習卡（到期越早越先）→ 新卡（依學習順序）
 * - 新卡上限以「項目」計：一個項目的導入技能（ladder.intro）出現才算一個新項目
 * - 技能錯開（規劃書 §6.2「首次複習通過後才加入產出類」）：ladder.unlockAfter 指定的前置技能已在前一天（或更早）練過、
 *   或被標記已會後才加入，不佔新項目額度；同一項目的兩種技能不會同一天第一次出現
 * - 到期複習超過 newPauseThreshold 時暫停新卡
 * - 每日總量上限 maxCards（F5；0 = 不限）：超過的留到明天，到期卡不會因此消失
 * - 通勤模式：ladder.deferInCommute 的技能延後到當天稍晚，不算逾期
 */

export interface QueueInput {
  cards: CardRecord[]
  /** 可排程的項目（例如目前開放的假名），依學習順序 */
  items: SchedulableItem[]
  /** 各內容類型的技能階梯；沒有階梯的類型不會排新卡 */
  ladders: Partial<Record<CardType, SkillLadder>>
  now: number
  /** 今天已導入的新項目數（今天第一次評分的導入技能卡） */
  newItemsIntroducedToday: number
  dailyNewItems: number
  /** 「今天想多學一點」追加的項目數 */
  extraNewItems: number
  newPauseThreshold: number
  /** 一天最多出幾張（含複習與新卡）；0 = 不限 */
  maxCards: number
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
  /** 通勤模式下延後的卡數 */
  deferred: number
  /** 因每日總量上限而留到明天的卡數 */
  capped: number
}

const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)

export function buildDailyQueue(input: QueueInput): DailyQueue {
  // 設定值可能來自壞掉的備份或雲端；NaN 會讓「introduced >= budget」永遠 false 而把全部假名排成新卡
  const dailyNewItems = num(input.dailyNewItems, 0)
  const extraNewItems = num(input.extraNewItems, 0)
  const introducedToday = num(input.newItemsIntroducedToday, 0)
  const pauseThreshold = num(input.newPauseThreshold, Infinity)
  const maxCards = num(input.maxCards, 0)
  const byId = new Map(input.cards.map((c) => [c.id, c]))
  const cutoff = endOfDay(input.now)
  const entries: QueueEntry[] = []
  let deferred = 0
  const deferInCommute = (type: CardType, skill: Skill) => input.commuteMode && (input.ladders[type]?.deferInCommute.includes(skill) ?? false)

  // 1. 到期複習（已開始的卡：reps > 0，未暫停，到期）
  const due = input.cards
    .filter((c) => !c.suspended && c.reps > 0 && c.due <= cutoff)
    .sort((a, b) => a.due - b.due)
  for (const c of due) {
    if (deferInCommute(c.type, c.skill)) {
      deferred++
      continue
    }
    entries.push({ cardId: c.id, itemId: c.itemId, skill: c.skill, kind: 'review' })
  }

  const newPaused = due.length > pauseThreshold

  // 2. 已導入項目解鎖的後續技能（不佔新項目額度）
  if (!newPaused) {
    for (const item of input.items) {
      const ladder = input.ladders[item.type]
      if (!ladder) continue
      for (const skill of item.skills) {
        const after = ladder.unlockAfter[skill]
        if (!after || deferInCommute(item.type, skill)) continue
        const prereq = byId.get(makeCardId(item.id, after))
        const card = byId.get(makeCardId(item.id, skill))
        const started = card ? card.reps > 0 || card.suspended : false
        const prereqKnown = prereq?.suspended === true // 前置技能標記已會後，這個技能仍要練
        // 首次複習通過：前置卡已練過，且最後一次不是今天（兩種技能不同天第一次出現）
        const prereqPassed = !!prereq && prereq.reps > 0 && !prereq.suspended && prereq.lastReview !== null && dayKey(prereq.lastReview) !== dayKey(input.now)
        if (prereq && (prereqKnown || prereqPassed) && !started) {
          entries.push({ cardId: makeCardId(item.id, skill), itemId: item.id, skill, kind: 'new' })
        }
      }
    }
  }

  // 3. 新項目：導入技能尚未開始的項目，依學習順序，受每日上限限制
  const budget = newPaused ? 0 : Math.max(0, dailyNewItems + extraNewItems - introducedToday)
  let introduced = 0
  for (const item of input.items) {
    if (introduced >= budget) break
    const ladder = input.ladders[item.type]
    if (!ladder || !item.skills.includes(ladder.intro)) continue
    const intro = byId.get(makeCardId(item.id, ladder.intro))
    if (intro && (intro.reps > 0 || intro.suspended)) continue
    entries.push({ cardId: makeCardId(item.id, ladder.intro), itemId: item.id, skill: ladder.intro, kind: 'new' })
    introduced++
  }

  // 每日總量上限：複習在前、新卡在後，超過的留到明天
  let capped = 0
  let finalEntries = entries
  if (maxCards > 0 && entries.length > maxCards) {
    capped = entries.length - maxCards
    finalEntries = entries.slice(0, maxCards)
  }
  const finalDue = finalEntries.filter((e) => e.kind === 'review').length
  return { entries: finalEntries, dueCount: finalDue, newCount: finalEntries.length - finalDue, newPaused, deferred, capped }
}
