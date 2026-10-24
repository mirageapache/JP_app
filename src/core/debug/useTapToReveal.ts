/** 連點 N 次觸發（例如連點版本號 5 次開啟除錯面板）；超過間隔就重數 */
export function useTapToReveal(times: number, onReveal: () => void, intervalMs = 1500) {
  let count = 0
  let last = 0

  function tap() {
    const now = Date.now()
    count = now - last > intervalMs ? 1 : count + 1
    last = now
    if (count >= times) {
      count = 0
      onReveal()
    }
  }

  return { tap }
}
