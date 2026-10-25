import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { db } from '@/core/db'
import { resetSettingsCache, setSetting } from '@/core/settings'
import a from '../../../public/content/strokes/03042.json'
import type { CharTemplate, Point, UserStroke } from './types'
import { useWritingPractice } from './useWritingPractice'

const あ = a as unknown as CharTemplate

vi.mock('./templates', () => ({ loadCharTemplate: async () => あ }))

function stroke(points: readonly Point[]): UserStroke {
  return { points, pointerType: 'pen', durationMs: 400 }
}

async function flush() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 10))
}

describe('useWritingPractice', () => {
  beforeEach(async () => {
    await db.handwritingLogs.clear()
    await db.strokeSamples.clear()
    await db.settings.clear()
    resetSettingsCache()
  })

  it('寫完一個字會寫入 handwritingLogs，不寫 strokeSamples', async () => {
    const scope = effectScope()
    const p = scope.run(() =>
      useWritingPractice({ char: ref('あ'), cardId: ref('kana:あ#write'), difficulty: ref('blank'), mode: 'free' }),
    )!
    await flush()
    expect(p.template.value?.char).toBe('あ')

    await p.onStroke(stroke([...あ.strokes[0]!.points].reverse())) // 反向
    expect(p.feedback.value.kind).toBe('shu')
    expect(p.lastWrongPoints.value).not.toBeNull()
    for (const s of あ.strokes) await p.onStroke(stroke(s.points))
    expect(p.finished.value).toBe(true)
    expect(p.summary.value?.rating).toBe('hard')

    const logs = await db.handwritingLogs.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ cardId: 'kana:あ#write', misses: 1, mode: 'free', syncedAt: null, pointerType: 'pen' })
    expect(logs[0]!.strokeResults).toHaveLength(4)
    expect(await db.strokeSamples.count()).toBe(0)
    scope.stop()
  })

  it('調校模式開啟時每一筆都保存筆跡樣本，並可標記判定有誤', async () => {
    await setSetting('tuningMode', true)
    const scope = effectScope()
    const p = scope.run(() =>
      useWritingPractice({ char: ref('あ'), cardId: ref('kana:あ#write'), difficulty: ref('trace') }),
    )!
    await flush()
    await p.onStroke(stroke(あ.strokes[0]!.points))
    await flush()
    expect(await db.strokeSamples.count()).toBe(1)
    await p.flagLastSampleWrong()
    const s = await db.strokeSamples.toArray()
    expect(s[0]?.judgedCorrect).toBe(false)
    expect(s[0]?.verdict.kind).toBe('pass')
    scope.stop()
  })

  it('跳過也會寫入紀錄，評分為重來', async () => {
    const scope = effectScope()
    const p = scope.run(() => useWritingPractice({ char: ref('あ'), cardId: ref('kana:あ#write'), difficulty: ref('blank') }))!
    await flush()
    await p.skip()
    const logs = await db.handwritingLogs.toArray()
    expect(logs[0]?.skipped).toBe(true)
    expect(p.summary.value?.rating).toBe('again')
    scope.stop()
  })
})
