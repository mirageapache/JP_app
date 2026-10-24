import { ref } from 'vue'
/** 測試環境沒有 Service Worker，以假的 useRegisterSW 取代 virtual:pwa-register/vue */
export function useRegisterSW() {
  return { needRefresh: ref(false), offlineReady: ref(false), updateServiceWorker: async () => {} }
}
