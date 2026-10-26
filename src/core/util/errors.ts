/** 把任何 catch 到的東西轉成可顯示的訊息 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
