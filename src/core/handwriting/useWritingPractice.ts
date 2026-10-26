import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { db, type HandwritingLog, type StrokeSample } from '@/core/db'
import { loadSettings, settings } from '@/core/settings'
import { HINT_AFTER, applyStroke, createSession, isFinished, skip as skipSession, summarize, type AttemptRecord, type SessionState } from './session'
import { loadCharTemplate } from './templates'
import type { CharTemplate, Difficulty, UserStroke, Verdict } from './types'
import { errorMessage } from '@/core/util/errors'

/** 「簡單」的時間門檻（規劃書 §6.1：低於該字的平均時間）：該字紀錄不足 MIN_LOGS_FOR_AVERAGE 筆前先用這個常數 */
export const FAST_MS = 4000
export const MIN_LOGS_FOR_AVERAGE = 3

export const VERDICT_TEXT: Record<Verdict['kind'], string> = {
  pass: '通過',
  position: '位置偏了',
  direction: '方向反了',
  order: '順序錯誤',
  connected: '好像把兩筆連在一起了',
  shape: '形狀不像',
}

export interface PracticeFeedback {
  kind: 'hint' | 'ok' | 'shu'
  text: string
}

/**
 * 一個字的手寫練習流程（給假名詳細頁與每日佇列共用）：
 * 載入筆畫資料 → 逐筆判定 → 完成後寫入 handwritingLogs；調校模式開啟時另存筆跡到 strokeSamples。
 */
export function useWritingPractice(options: {
  char: Ref<string>
  cardId: Ref<string>
  difficulty: Ref<Difficulty>
  /** 使用者選擇的筆畫版本；目前所有字只有 KanjiVG 資料，實際判定與紀錄一律為 'kanjivg' */
  variantId?: Ref<string>
  mode?: HandwritingLog['mode']
  /** false 時不載入筆畫資料（例如拗音沒有手寫題） */
  enabled?: Ref<boolean>
}) {
  /** 實際用來判定的版本：待替代版本的筆畫資料加入後，改依 options.variantId 載入對應資料 */
  const EFFECTIVE_VARIANT = 'kanjivg'
  let loadToken = 0
  /** 每一筆判定當下的難度（中途可切換描摹／空白） */
  const attemptDifficulty = new WeakMap<AttemptRecord, Difficulty>()
  const template = shallowRef<CharTemplate | null>(null)
  const loadError = ref('')
  const session = ref<SessionState>(createSession())
  const feedback = ref<PracticeFeedback>({ kind: 'hint', text: '' })
  const lastVerdict = shallowRef<Verdict | null>(null)
  const lastWrongPoints = shallowRef<UserStroke['points'] | null>(null)
  const saved = ref(false)
  const fastMs = ref(FAST_MS)

  const finished = computed(() => template.value !== null && isFinished(session.value, template.value))
  const summary = computed(() => (finished.value && template.value ? summarize(session.value, template.value, fastMs.value) : null))
  const hintIndex = computed(() => (session.value.hintShown && !finished.value ? session.value.expectedIndex : null))
  /** 提示模式：永遠顯示下一筆的起點與方向 */
  const guideIndex = computed(() => (options.difficulty.value === 'hint' && !finished.value ? session.value.expectedIndex : null))
  const strokeCount = computed(() => template.value?.strokes.length ?? 0)

  function setFeedback(kind: PracticeFeedback['kind'], text: string) {
    feedback.value = { kind, text }
  }

  async function load() {
    const token = ++loadToken
    loadError.value = ''
    template.value = null
    if (options.enabled && !options.enabled.value) return
    try {
      await loadSettings()
      const [t, avg] = await Promise.all([loadCharTemplate(options.char.value), averageDuration(options.cardId.value)])
      if (token !== loadToken) return // 字已切換，丟棄較慢的舊回應
      template.value = t
      fastMs.value = avg ?? FAST_MS
      reset()
    } catch (e) {
      if (token === loadToken) loadError.value = errorMessage(e)
    }
  }

  /** 這個字過去完整寫完（未跳過）的平均時間；紀錄太少回傳 null */
  async function averageDuration(cardId: string): Promise<number | null> {
    const logs = await db.handwritingLogs.where('cardId').equals(cardId).toArray()
    const durations = logs.filter((l) => !l.skipped && l.durationMs > 0).map((l) => l.durationMs)
    if (durations.length < MIN_LOGS_FOR_AVERAGE) return null
    return durations.reduce((a, b) => a + b, 0) / durations.length
  }

  function reset() {
    session.value = createSession()
    lastVerdict.value = null
    lastWrongPoints.value = null
    saved.value = false
    setFeedback('hint', `第 1 / ${strokeCount.value} 筆`)
  }

  async function onStroke(stroke: UserStroke) {
    if (!template.value || finished.value) return
    const strokeIndex = session.value.expectedIndex
    const verdict = applyStroke(session.value, template.value, stroke, { difficulty: options.difficulty.value })
    attemptDifficulty.set(session.value.attempts.at(-1)!, options.difficulty.value)
    lastVerdict.value = verdict

    if (settings.tuningMode) void saveSample(stroke, strokeIndex, verdict)

    if (verdict.kind === 'pass') {
      lastWrongPoints.value = null
      if (finished.value) {
        setFeedback('ok', '寫對了')
        await saveLog()
      } else setFeedback('ok', `第 ${session.value.expectedIndex + 1} / ${strokeCount.value} 筆`)
      return
    }

    lastWrongPoints.value = stroke.points
    const extra =
      verdict.kind === 'order'
        ? `（這是第 ${(verdict.matchedIndex ?? 0) + 1} 筆，請先寫第 ${strokeIndex + 1} 筆）`
        : verdict.kind === 'connected'
          ? `（第 ${strokeIndex + 1} 筆寫完要抬筆）`
          : ''
    const hint = session.value.hintShown ? '，看一下提示再寫' : session.value.consecutiveMisses === HINT_AFTER - 1 ? '，再錯一次會顯示提示' : ''
    setFeedback('shu', `${VERDICT_TEXT[verdict.kind]}${extra}${hint}`)
  }

  async function skip() {
    if (!template.value || finished.value) return
    skipSession(session.value)
    setFeedback('shu', '已跳過')
    await saveLog()
  }

  async function saveLog() {
    if (saved.value || !template.value || !summary.value) return
    saved.value = true
    const s = session.value
    const attempts = s.attempts
    const score = Math.round((100 * s.accepted.length) / Math.max(1, template.value.strokes.length + summary.value.misses))
    const first = attempts[0]
    const log: HandwritingLog = {
      uuid: crypto.randomUUID(),
      cardId: options.cardId.value,
      variantId: EFFECTIVE_VARIANT,
      difficulty: first ? (attemptDifficulty.get(first) ?? options.difficulty.value) : options.difficulty.value,
      pointerType: attempts.at(-1)?.stroke.pointerType ?? null,
      score,
      strokeResults: attempts.map((a) => ({
        strokeIndex: a.strokeIndex,
        kind: a.verdict.kind,
        difficulty: attemptDifficulty.get(a) ?? options.difficulty.value,
      })),
      misses: summary.value.misses,
      hintsUsed: summary.value.hintsUsed,
      skipped: summary.value.skipped,
      durationMs: summary.value.durationMs,
      mode: options.mode ?? 'free',
      at: Date.now(),
      syncedAt: null,
    }
    await db.handwritingLogs.add(log)
  }

  /** 最後一筆存進去的樣本；where('cardId').last() 的順序是 uuid 不是時間，同字多樣本會標到錯的 */
  let lastSampleUuid: string | null = null

  async function saveSample(stroke: UserStroke, strokeIndex: number, verdict: Verdict) {
    const sample: StrokeSample = {
      uuid: crypto.randomUUID(),
      cardId: options.cardId.value,
      variantId: EFFECTIVE_VARIANT,
      strokeIndex,
      difficulty: options.difficulty.value,
      pointerType: stroke.pointerType,
      points: stroke.points.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]),
      durationMs: Math.round(stroke.durationMs),
      verdict: { kind: verdict.kind, matchedIndex: verdict.matchedIndex, metrics: verdict.metrics },
      judgedCorrect: null,
      recordedAt: Date.now(),
    }
    await db.strokeSamples.add(sample)
    lastSampleUuid = sample.uuid
  }

  /** 調校模式：標記最後一筆的判定有誤；回傳是否有樣本可標記 */
  async function flagLastSampleWrong(): Promise<boolean> {
    if (!lastSampleUuid) return false
    const n = await db.strokeSamples.update(lastSampleUuid, { judgedCorrect: false })
    return n > 0
  }

  watch([options.char, () => options.enabled?.value ?? true], load, { immediate: true })

  return {
    template,
    loadError,
    session,
    feedback,
    lastVerdict,
    lastWrongPoints,
    finished,
    summary,
    hintIndex,
    guideIndex,
    strokeCount,
    onStroke,
    skip,
    reset,
    flagLastSampleWrong,
  }
}
