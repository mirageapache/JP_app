<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  kApp,
  kBlock,
  kBlockTitle,
  kButton,
  kChip,
  kList,
  kListItem,
  kNavbar,
  kNavbarBackLink,
  kPage,
  kProgressbar,
  kTabbar,
  kTabbarLink,
  kToggle,
} from 'konsta/vue'
import './konsta.css'

/**
 * UI 函式庫試做：Konsta UI（iOS 風格、Tailwind）版的「今日」首頁，對照 docs/ui-mockups/home.html。
 */
const router = useRouter()
const commute = ref(false)
const tab = ref('today')
</script>

<template>
  <kApp theme="ios" class="konsta-trial" safe-areas>
    <kPage class="bg-[#FAF7F2] pb-24">
      <kNavbar title="今日（Konsta UI）" class="bg-[#FAF7F2]">
        <template #left><kNavbarBackLink text="P0" @click="router.push('/p0')" /></template>
      </kNavbar>

      <p class="px-4 pt-2 text-[13px] text-[#5A544B]">10 月 24 日（五）</p>

      <kBlock strong inset class="bg-white border border-[#E3DDD2] rounded-2xl space-y-4">
        <div class="flex items-center gap-5">
          <div class="relative size-[104px] rounded-full grid place-items-center" style="background: conic-gradient(#2b4c7e 40%, #f2eee6 0)">
            <div class="absolute inset-[10px] rounded-full bg-white" />
            <div class="relative text-center">
              <div class="text-[28px] font-bold leading-none">8</div>
              <div class="text-[12px] text-[#7A7368]">/ 20 分鐘</div>
            </div>
          </div>
          <div class="flex-1 space-y-2">
            <div class="flex justify-between"><span class="text-[#5A544B]">待複習</span><strong>23</strong></div>
            <div class="flex justify-between"><span class="text-[#5A544B]">新卡</span><strong>9</strong></div>
            <div class="flex justify-between"><span class="text-[#5A544B]">預估時間</span><strong>約 12 分</strong></div>
          </div>
        </div>
        <kProgressbar :progress="0.4" />
        <kButton large rounded class="text-white">繼續學習</kButton>
      </kBlock>

      <kList strong inset class="rounded-2xl">
        <kListItem title="今天先不手寫" subtitle="手寫題延後到今天稍晚，只出點選題" label>
          <template #after><kToggle :checked="commute" @change="commute = !commute" /></template>
        </kListItem>
      </kList>

      <kBlockTitle>今天的內容</kBlockTitle>
      <kList strong inset class="rounded-2xl">
        <kListItem title="假名" subtitle="複習 14 · 新卡 5（は行）" link />
        <kListItem title="單字" subtitle="複習 9 · 新卡 3" link />
        <kListItem title="文法" subtitle="新卡 1（第 14 課）" link />
      </kList>

      <kList strong inset class="rounded-2xl">
        <kListItem title="連續 12 天" subtitle="最長紀錄 21 天">
          <template #after><kChip outline>統計</kChip></template>
        </kListItem>
      </kList>

      <kBlock>
        <kButton large rounded outline>＋ 今天想多學一點</kButton>
      </kBlock>

      <kTabbar class="fixed bottom-0 left-0 right-0">
        <kTabbarLink :active="tab === 'today'" label="今日" @click="tab = 'today'" />
        <kTabbarLink :active="tab === 'kana'" label="假名" @click="tab = 'kana'" />
        <kTabbarLink :active="tab === 'settings'" label="設定" @click="tab = 'settings'" />
      </kTabbar>
    </kPage>
  </kApp>
</template>
