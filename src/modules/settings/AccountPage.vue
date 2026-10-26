<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import AppTopbar from '@/components/AppTopbar.vue'
import ConfirmSheet from '@/components/ConfirmSheet.vue'
import { deleteAccount, describeAuthError, reauthenticate, sendPasswordReset, signInWithEmail, signOut, signUpWithEmail } from '@/core/sync/auth'
import { deleteCloudData, ensureAuthListener, refreshPending, requestSync, syncState } from '@/core/sync/useSync'
import { useToast } from '@/core/ui/useToast'

/** 帳號與同步（規劃書 §7.2、§7.5）：電子郵件登入、同步狀態、登出、刪除帳號與雲端資料 */
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const confirm = ref<'delete' | null>(null)
const confirmPassword = ref('')
const { show } = useToast()

const lastSyncText = computed(() => (syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString('zh-TW', { hour12: false }) : '尚未同步'))

async function run(fn: () => Promise<unknown>, successMsg?: string) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    if (successMsg) show(successMsg)
  } catch (e) {
    error.value = describeAuthError(e)
  } finally {
    busy.value = false
  }
}

const doSignIn = () =>
  run(async () => {
    await ensureAuthListener() // 先掛監聽，登入成功的狀態才會被接住並觸發同步
    await signInWithEmail(email.value.trim(), password.value)
    password.value = ''
    const r = await requestSync()
    if (r && r.pulled > 0) show(`已從雲端還原 ${r.pulled} 筆紀錄`)
    else if (r && r.settingsPulled > 0) show('已登入，設定已從雲端同步')
    else show('已登入，紀錄會自動同步')
  })
const doSignUp = () =>
  run(async () => {
    await ensureAuthListener()
    await signUpWithEmail(email.value.trim(), password.value)
    password.value = ''
    await requestSync()
  }, '帳號已建立，紀錄會自動同步')
const doReset = () =>
  run(async () => {
    await ensureAuthListener()
    await sendPasswordReset(email.value.trim())
  }, '已寄出重設密碼的信')
const doSignOut = () => run(() => signOut(), '已登出，本機紀錄保留')
const doSync = () =>
  run(async () => {
    const r = await requestSync()
    if (!r) throw new Error(syncState.lastError ?? '同步失敗')
    show(`已同步：上傳 ${r.pushed}、下載 ${r.pulled}`)
  })

async function doDelete() {
  const pw = confirmPassword.value
  confirm.value = null
  confirmPassword.value = ''
  await run(async () => {
    // 先重新驗證，確定能刪帳號，再清雲端；否則雲端清空後帳號仍在，下次同步會把本機資料重傳
    await reauthenticate(pw)
    await deleteCloudData()
    await deleteAccount()
  }, '已刪除帳號與雲端資料；本機紀錄保留')
}

onMounted(refreshPending)
</script>

<template>
  <div class="app">
    <AppTopbar title="帳號與同步" back="/settings" />
    <main class="page" style="gap: var(--sp-5)">
      <div v-if="!syncState.configured" class="banner banner--warn">
        <AppIcon name="alert" size="sm" />
        <div><strong>尚未設定 Firebase</strong>這個版本沒有雲端同步功能，請使用「備份與還原」。</div>
      </div>

      <template v-else>
        <!-- 已登入 -->
        <section v-if="syncState.user" class="stack" style="gap: var(--sp-3)">
          <div class="card row" style="gap: var(--sp-3)">
            <AppIcon name="user" />
            <div class="grow">
              <div style="font-weight: 600">{{ syncState.user.email ?? '（無電子郵件）' }}</div>
              <div class="small faint">學習紀錄會自動同步到這個帳號</div>
            </div>
          </div>
          <ul class="list">
            <li class="list-row">
              <AppIcon :name="syncState.status === 'error' ? 'alert' : 'cloud-check'" :style="{ color: syncState.status === 'error' ? 'var(--c-shu)' : 'var(--c-ok)' }" />
              <div class="list-row__main">
                <div class="list-row__title">{{ syncState.status === 'syncing' ? '同步中…' : syncState.status === 'error' ? '上次同步失敗' : '已同步' }}</div>
                <div class="list-row__sub num">{{ lastSyncText }} · 待上傳 {{ syncState.pending }} 筆</div>
              </div>
              <button class="btn btn--secondary btn--sm" type="button" :disabled="busy || syncState.status === 'syncing'" @click="doSync"><AppIcon name="refresh" size="sm" />立即同步</button>
            </li>
            <li v-if="syncState.lastError" class="list-row small" style="color: var(--c-shu)">{{ syncState.lastError }}</li>
          </ul>
          <ul class="list">
            <li><button class="list-row" type="button" :disabled="busy" @click="doSignOut"><AppIcon name="logout" /><div class="list-row__main">登出</div></button></li>
            <li><button class="list-row" type="button" style="color: var(--c-shu)" :disabled="busy" @click="confirm = 'delete'"><AppIcon name="trash" /><div class="list-row__main">刪除帳號與雲端資料</div></button></li>
          </ul>
          <p class="list-note">登出或刪除帳號都不會刪除這台裝置上的紀錄。</p>
        </section>

        <!-- 未登入 -->
        <section v-else-if="syncState.user === null" class="stack" style="gap: var(--sp-4)">
          <div class="stack" style="gap: var(--sp-1)">
            <h2 style="font-size: var(--fs-title)">同步你的學習紀錄</h2>
            <p class="muted small">登入後紀錄會自動備份到雲端，換手機或資料被清除時都能還原。不登入也能使用。</p>
          </div>
          <form class="card stack" style="gap: var(--sp-3)" @submit.prevent="doSignIn">
            <div class="field">
              <label for="email">電子郵件</label>
              <div class="input"><AppIcon name="mail" size="sm" /><input id="email" v-model="email" type="email" autocomplete="email" inputmode="email" required /></div>
            </div>
            <div class="field">
              <label for="pw">密碼</label>
              <div class="input"><AppIcon name="lock" size="sm" /><input id="pw" v-model="password" type="password" autocomplete="current-password" minlength="6" required /></div>
            </div>
            <button class="btn btn--primary btn--lg btn--block" type="submit" :disabled="busy">登入</button>
            <div class="row row--between">
              <button class="btn btn--ghost btn--sm" type="button" :disabled="busy" @click="doSignUp">建立帳號</button>
              <button class="btn btn--ghost btn--sm" type="button" :disabled="busy || !email" @click="doReset">忘記密碼</button>
            </div>
          </form>
        </section>
        <p v-else class="small muted">正在確認登入狀態…</p>

        <p v-if="error" class="banner banner--shu"><AppIcon name="alert" size="sm" />{{ error }}</p>
      </template>
    </main>

    <ConfirmSheet :open="confirm === 'delete'" title="刪除帳號與雲端資料" @close="confirm = null">
      <p class="muted">雲端上的所有紀錄與設定會被刪除，無法復原；這台裝置上的紀錄會保留。請輸入密碼確認。</p>
      <div class="input"><AppIcon name="lock" size="sm" /><input v-model="confirmPassword" type="password" autocomplete="current-password" placeholder="密碼" aria-label="密碼" /></div>
      <button class="btn btn--danger-fill btn--block btn--lg" type="button" :disabled="confirmPassword.length < 6 || busy" @click="doDelete">確認刪除</button>
      <button class="btn btn--secondary btn--block" type="button" @click="confirm = null">取消</button>
    </ConfirmSheet>
  </div>
</template>
