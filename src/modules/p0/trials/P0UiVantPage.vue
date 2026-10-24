<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Button as VanButton,
  Cell as VanCell,
  CellGroup as VanCellGroup,
  Circle as VanCircle,
  ConfigProvider as VanConfigProvider,
  NavBar as VanNavBar,
  Switch as VanSwitch,
  Tabbar as VanTabbar,
  TabbarItem as VanTabbarItem,
  Tag as VanTag,
} from 'vant'
import 'vant/lib/index.css'

/**
 * UI 函式庫試做：Vant 4 版的「今日」首頁（對照 docs/ui-mockups/home.html）。
 * 以 ConfigProvider 的 themeVars 套用設計 token，評估客製化難度與操作手感。
 */
const router = useRouter()
const commute = ref(false)
const tab = ref(0)

const themeVars = {
  primaryColor: '#2B4C7E',
  textColor: '#1F1C18',
  textColor2: '#5A544B',
  textColor3: '#7A7368',
  background: '#FAF7F2',
  background2: '#FFFFFF',
  borderColor: '#E3DDD2',
  radiusMd: '12px',
  radiusLg: '16px',
  buttonPrimaryBackground: '#2B4C7E',
  buttonPrimaryBorderColor: '#2B4C7E',
  buttonDefaultHeight: '48px',
  buttonBorderRadius: '12px',
  cellGroupInsetPadding: '0',
  cellGroupInsetBorderRadius: '16px',
  navBarBackground: '#FAF7F2',
  tabbarBackground: '#FFFFFF',
  tabbarItemActiveColor: '#2B4C7E',
  switchOnBackground: '#2E7A53',
  circleColor: '#2B4C7E',
  circleLayerColor: '#F2EEE6',
  tagPrimaryColor: '#2B4C7E',
}
</script>

<template>
  <VanConfigProvider :theme-vars="themeVars" theme-vars-scope="local" class="vant-trial">
    <VanNavBar title="今日（Vant 4）" left-arrow @click-left="router.push('/p0')" />

    <div class="vant-trial__body">
      <p class="vant-trial__date">10 月 24 日（五）</p>

      <div class="vant-trial__card">
        <div class="vant-trial__hero">
          <VanCircle :current-rate="40" :rate="40" :size="104" :stroke-width="90" layer-color="#F2EEE6">
            <div class="vant-trial__ring">
              <div class="vant-trial__ring-n">8</div>
              <div class="vant-trial__ring-l">/ 20 分鐘</div>
            </div>
          </VanCircle>
          <div class="vant-trial__stats">
            <div><span>待複習</span><strong>23</strong></div>
            <div><span>新卡</span><strong>9</strong></div>
            <div><span>預估時間</span><strong>約 12 分</strong></div>
          </div>
        </div>
        <VanButton type="primary" block round>繼續學習</VanButton>
      </div>

      <VanCellGroup inset>
        <VanCell center title="今天先不手寫" label="手寫題延後到今天稍晚，只出點選題">
          <template #right-icon><VanSwitch v-model="commute" size="24px" /></template>
        </VanCell>
      </VanCellGroup>

      <h2 class="vant-trial__h2">今天的內容</h2>
      <VanCellGroup inset>
        <VanCell title="假名" label="複習 14 · 新卡 5（は行）" is-link />
        <VanCell title="單字" label="複習 9 · 新卡 3" is-link />
        <VanCell title="文法" label="新卡 1（第 14 課）" is-link />
      </VanCellGroup>

      <VanCellGroup inset>
        <VanCell center title="連續 12 天" label="最長紀錄 21 天">
          <template #right-icon><VanTag type="primary" plain round>統計</VanTag></template>
        </VanCell>
      </VanCellGroup>

      <VanButton plain block round>＋ 今天想多學一點</VanButton>
    </div>

    <VanTabbar v-model="tab" fixed placeholder safe-area-inset-bottom>
      <VanTabbarItem icon="home-o">今日</VanTabbarItem>
      <VanTabbarItem icon="edit">假名</VanTabbarItem>
      <VanTabbarItem icon="setting-o">設定</VanTabbarItem>
    </VanTabbar>
  </VanConfigProvider>
</template>

<style scoped>
.vant-trial {
  min-height: 100dvh;
  background: #faf7f2;
  color: #1f1c18;
  font-family: var(--font-ui);
}
.vant-trial__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0 24px;
}
.vant-trial__date {
  margin: 0 16px;
  font-size: 13px;
  color: #5a544b;
}
.vant-trial__card {
  margin: 0 16px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e3ddd2;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.vant-trial__hero {
  display: flex;
  align-items: center;
  gap: 20px;
}
.vant-trial__ring {
  text-align: center;
}
.vant-trial__ring-n {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.vant-trial__ring-l {
  font-size: 12px;
  color: #7a7368;
}
.vant-trial__stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vant-trial__stats div {
  display: flex;
  justify-content: space-between;
}
.vant-trial__stats span {
  color: #5a544b;
}
.vant-trial__h2 {
  margin: 8px 20px -8px;
  font-size: 13px;
  font-weight: 600;
  color: #5a544b;
}
.vant-trial :deep(.van-button--plain) {
  margin: 0 16px;
  width: auto;
}
</style>
