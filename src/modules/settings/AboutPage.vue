<script setup lang="ts">
import AppTopbar from '@/components/AppTopbar.vue'

/** 關於與資料來源（規劃書 §8 授權、Q15）：只列目前實際使用的來源；單字階段加入 JMdict、JmdictFurigana、Tatoeba、Tanos */
const version = __APP_VERSION__
const sources = [
  {
    name: 'KanjiVG',
    by: '© Ulrich Apel',
    use: '假名與漢字的筆畫資料（已轉換為折線取樣）',
    license: 'CC BY-SA 3.0',
    url: 'https://kanjivg.tagaini.net/',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  {
    name: 'Klee One',
    by: '© Fontworks Inc.',
    use: '教科書體字型（假名子集）',
    license: 'SIL Open Font License 1.1',
    url: 'https://fonts.google.com/specimen/Klee+One',
    licenseUrl: 'https://openfontlicense.org/',
  },
]
</script>

<template>
  <div class="app">
    <AppTopbar title="關於" back="/settings" />
    <main class="page" style="gap: var(--sp-5)">
      <section class="stack" style="gap: var(--sp-1)">
        <h2 style="font-size: var(--fs-title)">日語練習帳 <span class="muted num">{{ version }}</span></h2>
        <p class="muted small">個人自用的日語學習 PWA，以手寫練習為核心。不商業化。</p>
      </section>

      <section class="stack">
        <h2 class="section-title">資料來源與授權</h2>
        <ul class="list">
          <li v-for="s in sources" :key="s.name" class="list-row" style="align-items: flex-start">
            <div class="list-row__main stack" style="gap: 2px">
              <div class="list-row__title"><a :href="s.url" target="_blank" rel="noopener">{{ s.name }}</a> <span class="small muted">{{ s.by }}</span></div>
              <div class="list-row__sub">{{ s.use }}</div>
              <div class="small"><a :href="s.licenseUrl" target="_blank" rel="noopener">{{ s.license }}</a></div>
            </div>
          </li>
        </ul>
        <p class="small faint" style="padding: 0 var(--sp-1)">以上資料皆經過篩選與格式轉換；由其轉出的內容包依相同授權釋出。單字與例句（JMdict、JmdictFurigana、Tatoeba、Tanos JLPT 清單）將於單字階段加入並在此標示。</p>
      </section>

      <section class="stack">
        <h2 class="section-title">演算法</h2>
        <ul class="list">
          <li class="list-row"><div class="list-row__main"><div class="list-row__title">FSRS（ts-fsrs）</div><div class="list-row__sub">間隔重複排程</div></div></li>
          <li class="list-row"><div class="list-row__main"><div class="list-row__title">手寫比對</div><div class="list-row__sub">自行實作，做法參考 Hanzi Writer（MIT）</div></div></li>
        </ul>
      </section>
    </main>
  </div>
</template>
