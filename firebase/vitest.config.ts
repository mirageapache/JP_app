import { defineConfig } from 'vitest/config'

/** 安全規則測試專用設定：Node 環境、只跑 firebase/rules.test.ts（需先啟動 Firestore Emulator） */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['firebase/rules.test.ts'],
    testTimeout: 20000,
  },
})
