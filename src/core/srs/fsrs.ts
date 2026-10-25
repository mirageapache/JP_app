import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade } from 'ts-fsrs'
import { addDays } from './day'
import type { CardEventRecord, CardRecord, CardState, CardType, MarkKnownPayload, Rating, ReviewLogRecord, Skill } from './types'

/**
 * FSRS 封裝（規劃書 §6.2）。
 * - 參數固定不開 fuzz，重放紀錄時結果一致；參數版本記在 reviewLogs.paramsVersion 與 paramsChanged 事件
 * - 卡片狀態一律可由 reviewLogs + cardEvents 重建（rebuildCard）
 */

export const PARAMS_VERSION = 'fsrs-default-v1'

const PARAMS_BY_VERSION: Record<string, ReturnType<typeof generatorParameters>> = {
  [PARAMS_VERSION]: generatorParameters({ enable_fuzz: false, enable_short_term: true }),
}

/** 「偶爾複習」模式的初始穩定度（天）；規劃書 §6.2，待 P1b 實測調整 */
export const OCCASIONAL_STABILITY_DAYS = 90

function schedulerFor(version: string) {
  const params = PARAMS_BY_VERSION[version] ?? PARAMS_BY_VERSION[PARAMS_VERSION]!
  return fsrs(params)
}

export function parseCardId(cardId: string): { itemId: string; type: CardType; skill: Skill } {
  const hash = cardId.lastIndexOf('#')
  const itemId = cardId.slice(0, hash)
  const skill = cardId.slice(hash + 1) as Skill
  const type = itemId.split(':')[0] as CardType
  return { itemId, type, skill }
}

export function emptyCardRecord(cardId: string, now: number): CardRecord {
  const { itemId, type, skill } = parseCardId(cardId)
  const c = createEmptyCard(new Date(now))
  return { id: cardId, itemId, type, skill, ...fromFsrsCard(c), suspended: false, updatedAt: now }
}

function fromFsrsCard(c: Card): Pick<
  CardRecord,
  'due' | 'stability' | 'difficulty' | 'elapsedDays' | 'scheduledDays' | 'learningSteps' | 'reps' | 'lapses' | 'state' | 'lastReview'
> {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardState,
    lastReview: c.last_review ? c.last_review.getTime() : null,
  }
}

export function toFsrsCard(r: CardRecord): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsedDays,
    scheduled_days: r.scheduledDays,
    learning_steps: r.learningSteps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.lastReview === null ? undefined : new Date(r.lastReview),
  }
}

/** 評分後的下一個狀態（不寫入資料庫） */
export function applyRating(card: CardRecord, rating: Rating, now: number, paramsVersion = PARAMS_VERSION): CardRecord {
  const f = schedulerFor(paramsVersion)
  const next = f.next(toFsrsCard(card), new Date(now), rating as Grade)
  return { ...card, ...fromFsrsCard(next.card), updatedAt: now }
}

/** 評分列上顯示的下次間隔文字 */
export function previewIntervals(card: CardRecord, now: number, paramsVersion = PARAMS_VERSION): Record<Rating, string> {
  const f = schedulerFor(paramsVersion)
  const preview = f.repeat(toFsrsCard(card), new Date(now))
  const text = (dueMs: number) => {
    const min = Math.max(1, Math.round((dueMs - now) / 60000))
    if (min < 60) return `${min} 分`
    const hours = Math.round(min / 60)
    if (hours < 24) return `${hours} 小時`
    const days = Math.round(hours / 24)
    return days < 30 ? `${days} 天` : `${Math.round(days / 30)} 個月`
  }
  return {
    1: text(preview[1].card.due.getTime()),
    2: text(preview[2].card.due.getTime()),
    3: text(preview[3].card.due.getTime()),
    4: text(preview[4].card.due.getTime()),
  }
}

/** 「偶爾複習」：視為已熟、約 OCCASIONAL_STABILITY_DAYS 天後再出現 */
function occasionalCard(card: CardRecord, now: number): CardRecord {
  return {
    ...card,
    state: 2,
    stability: OCCASIONAL_STABILITY_DAYS,
    difficulty: card.difficulty || 5,
    reps: card.reps + 1,
    scheduledDays: OCCASIONAL_STABILITY_DAYS,
    due: addDays(now, OCCASIONAL_STABILITY_DAYS),
    lastReview: now,
    suspended: false,
    updatedAt: now,
  }
}

/**
 * 由紀錄重建卡片：依時間順序重放 reviewLogs 與 cardEvents。
 * 這是 cards 表的唯一真相來源（設計原則 2）。
 */
export function rebuildCard(cardId: string, reviews: ReviewLogRecord[], events: CardEventRecord[], now = Date.now()): CardRecord {
  type Step = { at: number; seq: number; review?: ReviewLogRecord; event?: CardEventRecord }
  const steps: Step[] = [
    ...reviews.map((r, i) => ({ at: r.reviewedAt, seq: i, review: r })),
    ...events.filter((e) => e.cardId === cardId || e.type === 'paramsChanged').map((e, i) => ({ at: e.at, seq: i, event: e })),
  ].sort((a, b) => a.at - b.at || a.seq - b.seq)

  const firstAt = steps[0]?.at ?? now
  let card = emptyCardRecord(cardId, firstAt)
  let paramsVersion = PARAMS_VERSION

  for (const s of steps) {
    if (s.review) {
      card = applyRating(card, s.review.rating, s.review.reviewedAt, s.review.paramsVersion || paramsVersion)
      continue
    }
    const e = s.event!
    switch (e.type) {
      case 'paramsChanged':
        paramsVersion = (e.payload as { paramsVersion?: string } | undefined)?.paramsVersion ?? paramsVersion
        break
      case 'markKnown':
        card =
          (e.payload as MarkKnownPayload | undefined)?.mode === 'occasional'
            ? occasionalCard(card, e.at)
            : { ...card, suspended: true, updatedAt: e.at }
        break
      case 'suspend':
        card = { ...card, suspended: true, updatedAt: e.at }
        break
      case 'unsuspend':
        card = { ...card, suspended: false, updatedAt: e.at }
        break
      case 'reset':
        card = { ...emptyCardRecord(cardId, e.at), updatedAt: e.at }
        break
    }
  }
  return card
}

/** 手寫結果轉 FSRS 評分（規劃書 §6.1 表）：由 session.summarize 的 rating 字串轉成數字 */
export function ratingFromName(name: 'again' | 'hard' | 'good' | 'easy'): Rating {
  return ({ again: 1, hard: 2, good: 3, easy: 4 } as const)[name]
}
