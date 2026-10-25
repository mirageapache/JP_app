<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { VIEWBOX, type CharTemplate } from '@/core/handwriting/types'

/**
 * 筆順動畫（design-system.md §7.3）：每一筆依序以 stroke-dashoffset 描出，每筆 500ms、間隔 150ms；
 * 以 requestAnimationFrame 繪製，不受 prefers-reduced-motion 停用 CSS 動畫影響（它是內容，不是裝飾）。
 */
const props = withDefaults(defineProps<{ template: CharTemplate | null; autoplay?: boolean; showNumbers?: boolean }>(), {
  autoplay: true,
  showNumbers: true,
})

const STROKE_MS = 500
const GAP_MS = 150

const svg = ref<SVGSVGElement>()
const playing = ref(false)
let frame: number | undefined
let timer: ReturnType<typeof setTimeout> | undefined

function paths(): SVGPathElement[] {
  return svg.value ? [...svg.value.querySelectorAll<SVGPathElement>('path.s')] : []
}

function stop() {
  if (frame) cancelAnimationFrame(frame)
  clearTimeout(timer)
  frame = undefined
  playing.value = false
}

function showAll() {
  for (const p of paths()) {
    p.style.strokeDasharray = ''
    p.style.strokeDashoffset = ''
    p.classList.remove('is-drawing')
  }
}

function play() {
  stop()
  const ps = paths()
  if (!ps.length) return
  playing.value = true
  for (const p of ps) {
    const len = p.getTotalLength()
    p.style.strokeDasharray = String(len)
    p.style.strokeDashoffset = String(len)
    p.classList.remove('is-drawing')
  }
  let i = 0
  const next = () => {
    const p = ps[i]
    if (!p) {
      playing.value = false
      return
    }
    const len = p.getTotalLength()
    const t0 = performance.now()
    p.classList.add('is-drawing')
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / STROKE_MS)
      p.style.strokeDashoffset = String(len * (1 - k))
      if (k < 1) frame = requestAnimationFrame(step)
      else {
        p.classList.remove('is-drawing')
        i++
        timer = setTimeout(next, GAP_MS)
      }
    }
    frame = requestAnimationFrame(step)
  }
  next()
}

defineExpose({ play, stop, showAll })

watch(
  () => props.template,
  async () => {
    stop()
    await Promise.resolve()
    if (props.template && props.autoplay) play()
  },
  { flush: 'post', immediate: true },
)
onBeforeUnmount(stop)
</script>

<template>
  <div class="order-box" :class="{ 'is-playing': playing }">
    <svg v-if="template" ref="svg" :viewBox="`0 0 ${VIEWBOX} ${VIEWBOX}`" class="stroke-order" :aria-label="`${template.char} 的筆順動畫`">
      <path v-for="(s, i) in template.strokes" :key="template.code + i" class="s" :d="s.d" />
      <template v-if="showNumbers">
        <text v-for="(s, i) in template.strokes" :key="'n' + i" :x="s.points[0]![0] - 6" :y="s.points[0]![1] - 2">{{ i + 1 }}</text>
      </template>
    </svg>
  </div>
</template>

<style scoped>
.order-box {
  position: relative;
  aspect-ratio: 1;
  border: 1.5px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-surface);
}
.order-box::before,
.order-box::after {
  content: '';
  position: absolute;
  pointer-events: none;
}
.order-box::before {
  left: 50%;
  top: 0;
  bottom: 0;
  border-left: 1px dashed var(--c-grid);
}
.order-box::after {
  top: 50%;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--c-grid);
}
.order-box svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
