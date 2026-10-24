<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { VIEWBOX, type CharTemplate, type Point, type UserStroke } from '@/core/handwriting/types'

/**
 * 田字格書寫區（design-system.md §7）。
 * - 畫布座標直接線性映射到 109×109，描摹／提示／空白共用同一座標系
 * - 已通過的筆畫以標準 path 顯示（墨色、150ms 淡入）；判錯的筆畫以朱色顯示、晃動後淡出
 * - 只負責收集筆畫與顯示，判定由呼叫端（session）決定
 */
const props = withDefaults(
  defineProps<{
    template: CharTemplate | null
    /** 顯示淡色範本字（描摹模式） */
    showGhost?: boolean
    /** 已通過的筆畫索引 */
    accepted?: readonly number[]
    /** 要以提示動畫顯示的筆畫索引（null 不顯示） */
    hintIndex?: number | null
    disabled?: boolean
  }>(),
  { showGhost: false, accepted: () => [], hintIndex: null, disabled: false },
)

const emit = defineEmits<{ stroke: [stroke: UserStroke] }>()

/** 判錯回饋：晃動 200ms，再於 300ms 內淡出（design-system §7.2、§8 --dur-base） */
const SHAKE_MS = 200
const FADE_MS = 300

const box = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let ro: ResizeObserver | undefined

/** 畫布 CSS 尺寸（正方形） */
const size = ref(0)
const scale = computed(() => (size.value > 0 ? size.value / VIEWBOX : 1))

const hintStroke = computed(() =>
  props.hintIndex !== null && props.template ? (props.template.strokes[props.hintIndex] ?? null) : null,
)

interface LiveStroke {
  points: Point[]
  pointerType: UserStroke['pointerType']
  startedAt: number
}
let current: LiveStroke | null = null
let wrongStroke: { points: Point[]; alpha: number } | null = null
const shaking = ref(false)
let wrongTimer: ReturnType<typeof setTimeout> | undefined
let fadeFrame: number | undefined

const cssColor = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

function resize() {
  if (!canvas.value || !box.value) return
  const rect = box.value.getBoundingClientRect()
  size.value = rect.width
  const dpr = window.devicePixelRatio || 1
  canvas.value.width = Math.round(rect.width * dpr)
  canvas.value.height = Math.round(rect.height * dpr)
  ctx = canvas.value.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  redraw()
}

function drawPolyline(points: readonly Point[], color: string, alpha = 1) {
  if (!ctx || points.length === 0) return
  const s = scale.value
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = size.value * 0.045
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const first = points[0]!
  ctx.moveTo(first[0] * s, first[1] * s)
  if (points.length === 1) ctx.lineTo(first[0] * s + 0.01, first[1] * s)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]![0] * s, points[i]![1] * s)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function redraw() {
  if (!ctx) return
  ctx.clearRect(0, 0, size.value, size.value)
  if (wrongStroke) drawPolyline(wrongStroke.points, cssColor('--c-shu', '#C8432B'), wrongStroke.alpha)
  if (current) drawPolyline(current.points, cssColor('--c-ink', '#1F1C18'))
}

function toViewBox(e: PointerEvent): Point {
  const rect = canvas.value!.getBoundingClientRect()
  return [((e.clientX - rect.left) / rect.width) * VIEWBOX, ((e.clientY - rect.top) / rect.height) * VIEWBOX]
}

function pointerType(e: PointerEvent): UserStroke['pointerType'] {
  return e.pointerType === 'pen' ? 'pen' : e.pointerType === 'mouse' ? 'mouse' : 'touch'
}

function onDown(e: PointerEvent) {
  if (props.disabled || current) return
  canvas.value?.setPointerCapture(e.pointerId)
  current = { points: [toViewBox(e)], pointerType: pointerType(e), startedAt: performance.now() }
  redraw()
}

function onMove(e: PointerEvent) {
  if (!current) return
  // 支援時取得完整軌跡（Apple Pencil 240Hz），不支援時退回單一事件
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
  for (const ev of events.length ? events : [e]) current.points.push(toViewBox(ev))
  redraw()
}

function onUp(e: PointerEvent) {
  if (!current) return
  const stroke: UserStroke = {
    points: current.points,
    pointerType: current.pointerType,
    durationMs: performance.now() - current.startedAt,
  }
  current = null
  canvas.value?.releasePointerCapture?.(e.pointerId)
  redraw()
  emit('stroke', stroke)
}

/** iOS 接管手勢（捲動、邊緣返回）時會送 pointercancel：丟棄半截筆畫，不送判定 */
function onCancel() {
  current = null
  redraw()
}

/** 由呼叫端在判錯時呼叫：朱色顯示並晃動，再淡出 */
function flashWrong(points: readonly Point[]) {
  clearTimeout(wrongTimer)
  if (fadeFrame) cancelAnimationFrame(fadeFrame)
  wrongStroke = { points: [...points], alpha: 1 }
  shaking.value = false
  requestAnimationFrame(() => (shaking.value = true))
  redraw()
  wrongTimer = setTimeout(() => {
    shaking.value = false
    const t0 = performance.now()
    const fade = (t: number) => {
      if (!wrongStroke) return
      const k = Math.min(1, (t - t0) / FADE_MS)
      wrongStroke.alpha = 1 - k
      redraw()
      if (k < 1) fadeFrame = requestAnimationFrame(fade)
      else {
        wrongStroke = null
        redraw()
      }
    }
    fadeFrame = requestAnimationFrame(fade)
  }, SHAKE_MS)
}

defineExpose({ flashWrong })

onMounted(() => {
  ro = new ResizeObserver(resize)
  if (box.value) ro.observe(box.value)
  resize()
})
onBeforeUnmount(() => {
  ro?.disconnect()
  clearTimeout(wrongTimer)
  if (fadeFrame) cancelAnimationFrame(fadeFrame)
})
watch(() => props.template, redraw)
</script>

<template>
  <div ref="box" class="writing-box" :class="{ 'is-disabled': disabled, 'is-wrong': shaking }">
    <!-- 描摹範本與已通過的筆畫（SVG，與 KanjiVG 同座標系） -->
    <svg v-if="template" class="layer" :viewBox="`0 0 ${VIEWBOX} ${VIEWBOX}`" aria-hidden="true">
      <g v-if="showGhost" class="ghost-paths">
        <path v-for="(s, i) in template.strokes" :key="'g' + i" :d="s.d" />
      </g>
      <g class="accepted-paths">
        <path v-for="i in accepted" :key="'a' + i" :d="template.strokes[i]?.d" />
      </g>
      <!-- TODO(P1a)：prefers-reduced-motion 時提供暫停（design-system §8） -->
      <g v-if="hintStroke" class="hint">
        <path :key="'h' + hintIndex" class="hint-path" :d="hintStroke.d" />
        <circle :cx="hintStroke.points[0]![0]" :cy="hintStroke.points[0]![1]" r="4" />
      </g>
    </svg>
    <canvas
      ref="canvas"
      lang="ja"
      :aria-label="template ? `書寫區：請寫出 ${template.char}` : '書寫區'"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
    />
  </div>
</template>

<style scoped>
.layer path {
  fill: none;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ghost-paths path {
  stroke: var(--c-ink);
  opacity: 0.12;
}
.accepted-paths path {
  stroke: var(--c-ink);
  animation: accept-in 150ms var(--ease) both;
}
@keyframes accept-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.hint path {
  stroke: var(--c-primary);
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  animation: hint-draw 1s var(--ease) forwards;
}
.hint circle {
  fill: var(--c-primary);
}
@keyframes hint-draw {
  to {
    stroke-dashoffset: 0;
  }
}
.is-disabled canvas {
  pointer-events: none;
}
</style>
