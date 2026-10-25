<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import JaText from '@/components/JaText.vue'
import StrokeOrderAnimation from '@/components/StrokeOrderAnimation.vue'
import { CONFUSABLES, type ConfusableGroup } from '@/core/content/confusables'
import { loadCharTemplate } from '@/core/handwriting/templates'
import type { CharTemplate } from '@/core/handwriting/types'
import { speakJa } from '@/core/tts'

/** 易混淆對照（規劃書 F8）：並排顯示筆順與辨別要點，點字進入練習 */
const expanded = ref<string | null>(null)
const templates = shallowRef<Map<string, CharTemplate>>(new Map())

async function toggle(g: ConfusableGroup) {
  expanded.value = expanded.value === g.id ? null : g.id
  if (expanded.value) {
    const m = new Map(templates.value)
    for (const ch of g.chars) if (!m.has(ch)) m.set(ch, await loadCharTemplate(ch))
    templates.value = m
  }
}

function speak(ch: string) {
  void speakJa(ch).catch(() => {})
}

onMounted(() => {
  const first = CONFUSABLES[0]
  if (first) void toggle(first)
})
</script>

<template>
  <div class="app">
    <AppTopbar title="易混淆對照" back="/kana" />
    <main class="page" style="gap: var(--sp-3)">
      <p class="small muted">外形相近的假名放在一起看，記住差在哪裡。點任一個字可以進入筆順與自由練習。</p>
      <ul class="list">
        <li v-for="g in CONFUSABLES" :key="g.id">
          <button class="list-row" type="button" :aria-expanded="expanded === g.id" @click="toggle(g)">
            <div class="list-row__main row" style="gap: var(--sp-3)">
              <JaText v-for="ch in g.chars" :key="ch" :text="ch" display style="font-size: 1.75rem; line-height: 1" />
            </div>
            <AppIcon name="chev-r" size="sm" class="chev" :style="{ transform: expanded === g.id ? 'rotate(90deg)' : '' }" />
          </button>
          <div v-if="expanded === g.id" class="pair">
            <div class="pair__grid" :style="{ gridTemplateColumns: `repeat(${g.chars.length}, 1fr)` }">
              <div v-for="ch in g.chars" :key="ch" class="stack" style="gap: var(--sp-2); align-items: center">
                <StrokeOrderAnimation :template="templates.get(ch) ?? null" style="width: 100%" />
                <div class="row" style="gap: var(--sp-1)">
                  <RouterLink class="btn btn--secondary btn--sm" :to="`/kana/${encodeURIComponent(ch)}`" lang="ja">{{ ch }} 練習</RouterLink>
                  <button class="icon-btn" type="button" style="width: 36px; height: 36px" :aria-label="`播放 ${ch}`" @click="speak(ch)"><AppIcon name="volume" size="sm" /></button>
                </div>
              </div>
            </div>
            <p class="banner" style="margin-top: var(--sp-3)"><AppIcon name="bulb" size="sm" /><span>{{ g.tip }}</span></p>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.pair {
  padding: 0 var(--sp-4) var(--sp-4);
  border-top: 1px dashed var(--c-line);
}
.pair__grid {
  display: grid;
  gap: var(--sp-3);
  padding-top: var(--sp-3);
}
</style>
