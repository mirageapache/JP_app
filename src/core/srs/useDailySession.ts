import { computed, ref, shallowRef } from 'vue'
import { loadKanaPack, type KanaItem } from '@/core/content/kana'
import { db } from '@/core/db'
import { loadSettings, setSetting, settings } from '@/core/settings'
import { dayKey } from './day'
import { buildDailyQueue, type DailyQueue, type QueueEntry } from './queue'
import { countNewItemsIntroducedToday, recordReview, todayStats } from './repository'
import type { Rating } from './types'

/**
 * 每日學習流程（規劃書 §6.2）：建立今天的佇列、逐張出題、記錄評分與時間。
 * 佇列在開始時建立一次；答「重來」的卡會在這一輪結尾再出現一次（直到通過）。
 */

export interface SessionCounters {
  done: number
  total: number
  correctFirstTry: number
  startedAt: number | null
  elapsedMs: number
}

/** 目前開放學習的項目：P1b 平假名；P1.5 起加入片假名（依學習順序，拗音沒有手寫題但有辨識題） */
export function schedulableItems(items: KanaItem[]): KanaItem[] {
  return items.filter((i) => i.script === 'hiragana' || i.script === 'katakana')
}

export function useDailySession() {
  const queue = shallowRef<DailyQueue | null>(null)
  const items = shallowRef<Map<string, KanaItem>>(new Map())
  const pending = ref<QueueEntry[]>([])
  const retry = ref<QueueEntry[]>([])
  const current = ref<QueueEntry | null>(null)
  const counters = ref<SessionCounters>({ done: 0, total: 0, correctFirstTry: 0, startedAt: null, elapsedMs: 0 })
  const today = ref({ durationMs: 0, reviews: 0 })
  const wrongItems = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  /** 評分寫入中，避免連點重複記錄 */
  const answering = ref(false)
  let cardShownAt = 0

  /** 最近一次建立佇列時的日期鍵。computed 不會因時間流逝重算，所以每次 buildQueue 都更新它，跨午夜後停在首頁再開始也不會沿用昨天的通勤模式與加碼 */
  const todayKey = ref(dayKey(Date.now()))
  const commuteMode = computed(() => settings.commuteDate === todayKey.value)
  const extraNew = computed(() => (settings.extraNew?.date === todayKey.value ? settings.extraNew.count : 0))
  const finished = computed(() => current.value === null && pending.value.length === 0 && retry.value.length === 0 && queue.value !== null)
  const progress = computed(() => (counters.value.total ? counters.value.done / counters.value.total : 0))

  async function buildQueue(): Promise<DailyQueue> {
    await loadSettings()
    const pack = await loadKanaPack()
    const list = schedulableItems(pack.items)
    items.value = new Map(list.map((i) => [i.id, i]))
    const now = Date.now()
    todayKey.value = dayKey(now)
    const [cards, introduced, stats] = await Promise.all([db.cards.toArray(), countNewItemsIntroducedToday(now), todayStats(now)])
    today.value = stats
    const q = buildDailyQueue({
      cards,
      items: list,
      now,
      newItemsIntroducedToday: introduced,
      dailyNewItems: settings.dailyNewKana,
      extraNewItems: extraNew.value,
      newPauseThreshold: settings.newPauseThreshold,
      maxCards: settings.dailyMaxCards,
      commuteMode: commuteMode.value,
    })
    queue.value = q
    return q
  }

  /** 只計算今天的狀態（首頁用），不開始作答 */
  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      await buildQueue()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function start() {
    error.value = ''
    let q: DailyQueue
    try {
      q = await buildQueue()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    pending.value = [...q.entries]
    retry.value = []
    counters.value = { done: 0, total: q.entries.length, correctFirstTry: 0, startedAt: Date.now(), elapsedMs: 0 }
    wrongItems.value = []
    next()
  }

  function next() {
    if (pending.value.length === 0 && retry.value.length) {
      pending.value = retry.value
      retry.value = []
    }
    // 複製一份：重試的卡若是同一個物件，Vue 會判定 current 沒有變化而不觸發 watch
    const nextEntry = pending.value.shift()
    current.value = nextEntry ? { ...nextEntry } : null
    cardShownAt = performance.now()
  }

  /** 記錄目前這張卡的評分並前進 */
  async function answer(rating: Rating, firstTry: boolean) {
    const entry = current.value
    if (!entry || answering.value) return
    answering.value = true
    try {
      const durationMs = performance.now() - cardShownAt
      await recordReview(entry.cardId, rating, durationMs)
      counters.value.elapsedMs += durationMs
      if (rating === 1) {
        retry.value.push({ ...entry })
        if (!wrongItems.value.includes(entry.itemId)) wrongItems.value.push(entry.itemId)
      } else {
        counters.value.done++
        if (firstTry) counters.value.correctFirstTry++
      }
      next()
    } finally {
      answering.value = false
    }
  }

  function itemOf(entry: QueueEntry): KanaItem | undefined {
    return items.value.get(entry.itemId)
  }

  async function setCommuteMode(on: boolean) {
    await setSetting('commuteDate', on ? dayKey(Date.now()) : null)
  }

  async function addExtraNew(count: number) {
    const date = dayKey(Date.now())
    await setSetting('extraNew', { date, count: extraNew.value + count })
  }

  return {
    queue,
    items,
    current,
    counters,
    today,
    wrongItems,
    loading,
    error,
    answering,
    finished,
    progress,
    commuteMode,
    extraNew,
    refresh,
    start,
    answer,
    itemOf,
    setCommuteMode,
    addExtraNew,
  }
}
