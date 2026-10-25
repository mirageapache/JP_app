<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import WritingBox from '@/components/WritingBox.vue'
import { copyText, useToast } from '@/core/ui/useToast'
import {
  BASE_THRESHOLDS,
  applyStroke,
  createSession,
  isFinished,
  loadCharTemplate,
  skip as skipSession,
  summarize,
  type CharTemplate,
  type Difficulty,
  type SessionState,
  type Thresholds,
  type UserStroke,
  type Verdict,
} from '@/core/handwriting'

/** P0 手寫原型：驗證書寫流暢度與逐筆判定，並提供門檻調整與樣本匯出 */

/** 規劃書 §10 建議 5～10 個假名；多放幾個片假名是為了測 ン／ソ、シ／ツ 這類易混淆字的判定 */
const CHARS = ['あ', 'き', 'さ', 'そ', 'り', 'ふ', 'ぬ', 'ぱ', 'が', 'ゃ', 'っ', 'ン', 'ソ', 'シ', 'ツ']
/** 「簡單」的時間門檻；規劃書寫「低於該字的平均時間」，P0 尚無統計，先用常數 */
const FAST_MS = 4000

type FeedbackKind = 'hint' | 'ok' | 'shu'
interface Sample {
  char: string
  difficulty: Difficulty
  stroke: UserStroke
  verdict: Verdict
  at: number
}

const char = ref('あ')
const difficulty = ref<Difficulty>('blank')
const template = ref<CharTemplate | null>(null)
const loadError = ref('')
const session = ref<SessionState>(createSession())
const box = ref<InstanceType<typeof WritingBox>>()
const thresholds = reactive<Thresholds>({ ...BASE_THRESHOLDS })
const showTuning = ref(false)
const status = ref<{ kind: FeedbackKind; text: string }>({ kind: 'hint', text: '' })
const log = ref<{ stroke: number; verdict: Verdict; pointerType: UserStroke['pointerType']; ms: number }[]>([])
const samples = shallowRef<Sample[]>([])
const { toast, show: showToast } = useToast()

/** 筆跡延遲量測：pointermove 事件間隔 */
const moveStats = reactive({ count: 0, maxGapMs: 0, avgGapMs: 0 })
let lastMove = 0

const finished = computed(() => template.value !== null && isFinished(session.value, template.value))
const summary = computed(() => (finished.value && template.value ? summarize(session.value, template.value, FAST_MS) : null))
const hintIndex = computed(() => (session.value.hintShown && !finished.value ? session.value.expectedIndex : null))

/** 判定結果的文案；TODO(P1a)：改成說明「怎麼做」（design-system §9），例如「方向反了，從左上往右下寫」 */
const VERDICT_TEXT: Record<Verdict['kind'], string> = {
  pass: '通過',
  position: '位置偏了',
  direction: '方向反了',
  order: '順序錯誤',
  connected: '好像把兩筆連在一起了',
  shape: '形狀不像',
}
const RATING_TEXT = { again: '重來', hard: '困難', good: '良好', easy: '簡單' } as const

async function load() {
  loadError.value = ''
  template.value = null
  try {
    template.value = await loadCharTemplate(char.value)
    reset()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

function reset() {
  session.value = createSession()
  log.value = []
  setStatus('hint', `第 1 / ${template.value?.strokes.length ?? '?'} 筆`)
}

function setStatus(kind: FeedbackKind, text: string) {
  status.value = { kind, text }
}

function onStroke(stroke: UserStroke) {
  if (!template.value || finished.value) return
  const t0 = performance.now()
  const verdict = applyStroke(session.value, template.value, stroke, { difficulty: difficulty.value, baseThresholds: { ...thresholds } })
  const ms = performance.now() - t0
  log.value.unshift({ stroke: session.value.attempts.at(-1)!.strokeIndex + 1, verdict, pointerType: stroke.pointerType, ms })
  samples.value.push({ char: char.value, difficulty: difficulty.value, stroke, verdict, at: Date.now() })
  triggerRef(samples)

  if (verdict.kind === 'pass') {
    if (finished.value) setStatus('ok', '寫對了')
    else setStatus('ok', `第 ${session.value.expectedIndex + 1} / ${template.value.strokes.length} 筆`)
  } else {
    box.value?.flashWrong(stroke.points)
    const extra = verdict.kind === 'order' ? `（這是第 ${(verdict.matchedIndex ?? 0) + 1} 筆，請先寫第 ${session.value.expectedIndex + 1} 筆）` : ''
    const hint = session.value.hintShown ? '，看一下提示再寫' : ''
    setStatus('shu', `${VERDICT_TEXT[verdict.kind]}${extra}${hint}`)
  }
}

function skip() {
  if (!template.value || finished.value) return
  skipSession(session.value)
  setStatus('shu', '已跳過')
}

function onMoveSample(e: PointerEvent) {
  const now = e.timeStamp
  if (lastMove) {
    const gap = now - lastMove
    moveStats.count++
    moveStats.maxGapMs = Math.max(moveStats.maxGapMs, gap)
    moveStats.avgGapMs += (gap - moveStats.avgGapMs) / moveStats.count
  }
  lastMove = now
}
function onMoveEnd() {
  lastMove = 0
}

async function copySamples() {
  const payload = {
    app: __APP_VERSION__,
    userAgent: navigator.userAgent,
    thresholds: { ...thresholds },
    samples: samples.value.map((s) => ({
      ...s,
      stroke: { ...s.stroke, points: s.stroke.points.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]) },
      verdict: { kind: s.verdict.kind, matchedIndex: s.verdict.matchedIndex, metrics: s.verdict.metrics },
    })),
  }
  showToast((await copyText(JSON.stringify(payload))) ? `已複製 ${samples.value.length} 筆樣本` : '無法存取剪貼簿')
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(1) : '∞'
}

watch(char, load)
onMounted(load)
</script>

<template>
  <div class="app">
    <AppTopbar title="手寫原型" back="/p0">
      <template #actions>
        <button class="icon-btn" type="button" aria-label="門檻調整" :aria-pressed="showTuning" @click="showTuning = !showTuning">
          <AppIcon name="sliders" />
        </button>
      </template>
    </AppTopbar>

    <main class="page" style="gap: var(--sp-3)">
      <div class="chips" aria-label="選擇假名">
        <button
          v-for="c in CHARS"
          :key="c"
          class="chip ja-display"
          lang="ja"
          type="button"
          style="font-size: 1.125rem; min-height: 44px; min-width: 44px"
          :aria-pressed="c === char"
          @click="char = c"
        >
          {{ c }}
        </button>
      </div>

      <div class="row row--between">
        <div class="segmented" style="width: 150px">
          <button type="button" :aria-pressed="difficulty === 'trace'" @click="difficulty = 'trace'">描摹</button>
          <button type="button" :aria-pressed="difficulty === 'blank'" @click="difficulty = 'blank'">空白</button>
        </div>
        <div class="row" style="gap: var(--sp-1)">
          <span class="ja-display" lang="ja" style="font-size: 1.75rem; line-height: 1">{{ char }}</span>
          <span v-if="template" class="small faint num">{{ template.strokes.length }} 筆</span>
        </div>
      </div>

      <p v-if="loadError" class="banner banner--shu"><AppIcon name="alert" size="sm" />{{ loadError }}</p>

      <div @pointermove="onMoveSample" @pointerup="onMoveEnd" @pointercancel="onMoveEnd">
        <WritingBox
          ref="box"
          :template="template"
          :show-ghost="difficulty === 'trace'"
          :accepted="session.accepted"
          :hint-index="hintIndex"
          :disabled="finished"
          @stroke="onStroke"
        />
      </div>

      <div class="feedback" :class="`feedback--${status.kind}`" aria-live="polite">
        <AppIcon v-if="status.kind === 'ok'" name="check" size="sm" />
        <AppIcon v-else-if="status.kind === 'shu'" name="x" size="sm" />
        {{ status.text }}
      </div>

      <div v-if="summary" class="card stack" style="gap: var(--sp-2)">
        <div class="row row--between">
          <strong>完成</strong>
          <span class="badge badge--primary">建議評分：{{ RATING_TEXT[summary.rating] }}</span>
        </div>
        <div class="small muted num">
          重寫 {{ summary.misses }} 次 · 提示 {{ summary.hintsUsed }} 次 · {{ (summary.durationMs / 1000).toFixed(1) }} 秒
          {{ summary.skipped ? '· 已跳過' : '' }}
        </div>
        <button class="btn btn--primary btn--block" type="button" @click="reset">再寫一次</button>
      </div>

      <div v-else class="row" style="justify-content: space-between">
        <button class="btn btn--secondary btn--sm" type="button" @click="reset"><AppIcon name="undo" size="sm" />重寫</button>
        <button class="btn btn--ghost btn--sm" type="button" @click="skip"><AppIcon name="skip" size="sm" />跳過</button>
      </div>

      <!-- 門檻調整（調校用） -->
      <section v-if="showTuning" class="card stack" style="gap: var(--sp-3)">
        <h2 class="section-title" style="padding: 0">判定門檻（109 座標單位，未乘係數）</h2>
        <label v-for="k in (['avgDistance', 'startDistance', 'endDistance', 'dotLength'] as const)" :key="k" class="stack" style="gap: 2px">
          <span class="row row--between small"><span>{{ k }}</span><span class="num muted">{{ thresholds[k] }}</span></span>
          <input v-model.number="thresholds[k]" type="range" min="2" max="60" step="1" />
        </label>
        <label class="stack" style="gap: 2px">
          <span class="row row--between small"><span>shape（正規化形狀，無單位）</span><span class="num muted">{{ thresholds.shape }}</span></span>
          <input v-model.number="thresholds.shape" type="range" min="0.2" max="2" step="0.05" />
        </label>
        <label class="stack" style="gap: 2px">
          <span class="row row--between small"><span>directionMin（方向相似度下限）</span><span class="num muted">{{ thresholds.directionMin }}</span></span>
          <input v-model.number="thresholds.directionMin" type="range" min="-1" max="1" step="0.05" />
        </label>
        <label class="stack" style="gap: 2px">
          <span class="row row--between small"><span>lengthRatio 範圍</span><span class="num muted">{{ thresholds.lengthRatioMin }} – {{ thresholds.lengthRatioMax }}</span></span>
          <input v-model.number="thresholds.lengthRatioMin" type="range" min="0.1" max="1" step="0.05" />
          <input v-model.number="thresholds.lengthRatioMax" type="range" min="1" max="3" step="0.05" />
        </label>
        <p class="caption faint">實際門檻 = 基準 × 難度係數（描摹 1.3）× 輸入係數（手指 1.3、滑鼠 1.15、Pencil 1）</p>
      </section>

      <!-- 量測與紀錄 -->
      <section class="card stack" style="gap: var(--sp-2)">
        <div class="row row--between small">
          <span class="muted">pointermove 間隔</span>
          <span class="num">平均 {{ fmt(moveStats.avgGapMs) }} ms · 最大 {{ fmt(moveStats.maxGapMs) }} ms · {{ moveStats.count }} 次</span>
        </div>
        <div class="row row--between small">
          <span class="muted">樣本</span>
          <span class="num">{{ samples.length }} 筆</span>
        </div>
        <button class="btn btn--secondary btn--sm" type="button" @click="copySamples"><AppIcon name="copy" size="sm" />複製樣本 JSON</button>
      </section>

      <ul v-if="log.length" class="list">
        <li v-for="(l, i) in log" :key="i" class="list-row" style="min-height: 44px">
          <span class="badge" :class="l.verdict.kind === 'pass' ? 'badge--ok' : 'badge--shu'">第 {{ l.stroke }} 筆 {{ VERDICT_TEXT[l.verdict.kind] }}</span>
          <div class="list-row__main caption faint num">
            avg {{ fmt(l.verdict.metrics.avgDistance) }} · rev {{ fmt(l.verdict.metrics.avgDistanceReversed) }} · shape {{ l.verdict.metrics.shape.toFixed(2) }} · fr {{ fmt(l.verdict.metrics.frechet) }} · s {{ fmt(l.verdict.metrics.startDistance) }} · e {{ fmt(l.verdict.metrics.endDistance) }} · len {{ l.verdict.metrics.lengthRatio.toFixed(2) }} · {{ l.pointerType }} · {{ l.ms.toFixed(1) }}ms
          </div>
        </li>
      </ul>

      <p class="caption faint">驗證重點：書寫是否流暢（pointermove 間隔應 ≤ 17 ms）、正確書寫不被誤判、反向與順序錯誤能被抓出、畫布不觸發返回手勢。手指與 Apple Pencil 各測一次。</p>
    </main>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>
