import type { HandwritingLog } from '@/core/db'

/**
 * 弱點分數（規劃書 F8、§6.2）：由 handwritingLogs 計算，只用於弱點專練與統計，不影響每日佇列。
 * 分數 0～100，越高越弱：最近 N 次練習的「重寫次數比例」與「跳過／看提示」加權，越近的練習權重越大。
 */
export interface WeakScore {
  cardId: string
  char: string
  score: number
  attempts: number
  lastAt: number
}

const RECENT = 10

export function weaknessScores(logs: HandwritingLog[], minAttempts = 2): WeakScore[] {
  const byCard = new Map<string, HandwritingLog[]>()
  for (const l of logs) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l])
  const out: WeakScore[] = []
  for (const [cardId, list] of byCard) {
    const recent = list.sort((a, b) => b.at - a.at).slice(0, RECENT)
    if (recent.length < minAttempts) continue
    let weighted = 0
    let weightSum = 0
    recent.forEach((l, i) => {
      const w = RECENT - i // 越近權重越大
      const strokes = Math.max(1, l.strokeResults.filter((s) => s.kind === 'pass').length + l.misses)
      let penalty = Math.min(1, l.misses / strokes)
      if (l.hintsUsed > 0) penalty = Math.max(penalty, 0.7)
      if (l.skipped) penalty = 1
      weighted += penalty * w
      weightSum += w
    })
    const score = Math.round((100 * weighted) / weightSum)
    out.push({ cardId, char: cardId.replace(/^kana:/, '').replace(/#.*$/, ''), score, attempts: list.length, lastAt: recent[0]!.at })
  }
  return out.sort((a, b) => b.score - a.score || b.lastAt - a.lastAt)
}
