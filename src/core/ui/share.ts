/**
 * 匯出檔案：iPhone 走分享面板（可「儲存到檔案」），桌面瀏覽器直接下載。
 * 'cancelled' = 使用者在分享面板按了取消，不視為失敗、也不要再下載一次。
 */
export async function shareFile(file: File, title: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file], title })
    return 'shared'
  } catch (e) {
    return (e as { name?: string }).name === 'AbortError' ? 'cancelled' : 'unsupported'
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
