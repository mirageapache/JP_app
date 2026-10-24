/**
 * 開發用截圖工具：以本機 Chrome 模擬 iPhone 尺寸擷取頁面。
 *   node scripts/screenshot.mjs <url> <out.png> [--dark] [--wait=ms] [--full]
 * 需先啟動 `npm run dev` 或 `npm run preview`。
 */
import puppeteer from 'puppeteer-core'

const [url, out, ...flags] = process.argv.slice(2)
if (!url || !out) {
  console.error('用法：node scripts/screenshot.mjs <url> <out.png> [--dark] [--wait=ms] [--full]')
  process.exit(1)
}
const dark = flags.includes('--dark')
const full = flags.includes('--full')
const wait = Number(flags.find((f) => f.startsWith('--wait='))?.split('=')[1] ?? 800)

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean)

const browser = await puppeteer.launch({ executablePath: candidates[0], headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }])
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, wait))
  await page.screenshot({ path: out, fullPage: full })
  console.log(`saved ${out}`)
  if (errors.length) console.log(errors.join('\n'))
} finally {
  await browser.close()
}
