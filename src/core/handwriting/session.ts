import { matchStroke, type MatchOptions } from './matcher'
import type { CharTemplate, UserStroke, Verdict } from './types'

/**
 * 一個字的書寫流程（規劃書 §6.1「判錯後的流程與評分」）：
 * 某一筆判錯 → 該筆消失重寫；同一筆連錯 HINT_AFTER 次顯示提示；全部完成後轉成 FSRS 評分建議。
 * 純邏輯、無 UI，方便測試；UI 由 WritingBox 與頁面負責。
 */

export const HINT_AFTER = 3

export type Rating = 'again' | 'hard' | 'good' | 'easy'

export interface AttemptRecord {
  strokeIndex: number
  verdict: Verdict
  stroke: UserStroke
  at: number
}

export interface SessionState {
  expectedIndex: number
  /** 已通過的筆畫索引（依書寫順序） */
  accepted: number[]
  attempts: AttemptRecord[]
  /** 目前這一筆連續錯了幾次 */
  consecutiveMisses: number
  hintShown: boolean
  hintsUsed: number
  skipped: boolean
  startedAt: number | null
  finishedAt: number | null
}

export function createSession(): SessionState {
  return {
    expectedIndex: 0,
    accepted: [],
    attempts: [],
    consecutiveMisses: 0,
    hintShown: false,
    hintsUsed: 0,
    skipped: false,
    startedAt: null,
    finishedAt: null,
  }
}

export function isFinished(s: SessionState, template: CharTemplate): boolean {
  return s.skipped || s.accepted.length >= template.strokes.length
}

export function remainingIndices(s: SessionState, template: CharTemplate): number[] {
  const out: number[] = []
  for (let i = 0; i < template.strokes.length; i++) if (!s.accepted.includes(i)) out.push(i)
  return out
}

/** 處理一筆；回傳判定結果，並就地更新狀態 */
export function applyStroke(
  s: SessionState,
  template: CharTemplate,
  stroke: UserStroke,
  options: MatchOptions,
  now = Date.now(),
): Verdict {
  if (isFinished(s, template)) throw new Error('已完成')
  // 總時間從第一筆「落筆」算起：第一筆抬筆時間減掉書寫時間
  s.startedAt ??= now - stroke.durationMs
  const verdict = matchStroke(stroke, template, s.expectedIndex, remainingIndices(s, template), options)
  s.attempts.push({ strokeIndex: s.expectedIndex, verdict, stroke, at: now })
  if (verdict.kind === 'pass') {
    s.accepted.push(s.expectedIndex)
    s.expectedIndex += 1
    s.consecutiveMisses = 0
    s.hintShown = false
    if (s.accepted.length >= template.strokes.length) s.finishedAt = now
  } else {
    s.consecutiveMisses += 1
    if (s.consecutiveMisses >= HINT_AFTER && !s.hintShown) {
      s.hintShown = true
      s.hintsUsed += 1
    }
  }
  return verdict
}

export function skip(s: SessionState, now = Date.now()): void {
  s.skipped = true
  s.finishedAt = now
}

export interface SessionSummary {
  strokeCount: number
  misses: number
  hintsUsed: number
  skipped: boolean
  durationMs: number
  rating: Rating
}

/**
 * 轉成 FSRS 評分建議（規劃書 §6.1 表）：
 * 全部一次通過且總時間低於 fastMs → 簡單；全部一次通過 → 良好；
 * 重寫 ≤ 2 次 → 困難；重寫 > 2、看過提示或放棄 → 重來
 */
export function summarize(s: SessionState, template: CharTemplate, fastMs: number): SessionSummary {
  const misses = s.attempts.filter((a) => a.verdict.kind !== 'pass').length
  const durationMs = s.startedAt !== null && s.finishedAt !== null ? s.finishedAt - s.startedAt : 0
  let rating: Rating
  if (s.skipped || s.hintsUsed > 0 || misses > 2) rating = 'again'
  else if (misses > 0) rating = 'hard'
  else if (durationMs > 0 && durationMs < fastMs) rating = 'easy'
  else rating = 'good'
  return { strokeCount: template.strokes.length, misses, hintsUsed: s.hintsUsed, skipped: s.skipped, durationMs, rating }
}
