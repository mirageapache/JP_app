/**
 * 易混淆對照（規劃書 F8、§6.4）：外形相近、初學者常搞混的假名組合。
 * 每組附一句辨別要點，供對照練習頁顯示。
 */
export interface ConfusableGroup {
  id: string
  chars: string[]
  /** 辨別要點（繁體中文） */
  tip: string
}

export const CONFUSABLES: ConfusableGroup[] = [
  { id: 'nu-me', chars: ['ぬ', 'め'], tip: 'ぬ 最後多一個小圈；め 沒有圈，直接收筆。' },
  { id: 'ne-re-wa', chars: ['ね', 'れ', 'わ'], tip: '三個都是「豎 + 右半」：ね 有圈、れ 右邊往外甩、わ 右邊圓滑收回。' },
  { id: 'ru-ro', chars: ['る', 'ろ'], tip: 'る 結尾有小圈；ろ 沒有。' },
  { id: 'sa-ki', chars: ['さ', 'き'], tip: 'き 比 さ 多一橫（上方兩橫）。' },
  { id: 'ha-ho', chars: ['は', 'ほ'], tip: 'ほ 右邊多一橫。' },
  { id: 'ma-mo', chars: ['ま', 'も'], tip: 'ま 先寫兩橫再寫豎鉤；も 先寫豎鉤再寫兩橫。' },
  { id: 'a-o', chars: ['あ', 'お'], tip: 'あ 的第三筆繞大圈；お 右上多一點。' },
  { id: 'i-ri', chars: ['い', 'り'], tip: 'い 兩筆分開、第二筆短；り 第二筆長且往下延伸。' },
  { id: 'shi-tsu', chars: ['シ', 'ツ'], tip: 'シ 的點是橫向排列、最後一筆由下往上；ツ 的點是直向排列、最後一筆由上往下。' },
  { id: 'so-n', chars: ['ソ', 'ン'], tip: 'ソ 第二筆由上往下撇；ン 第二筆由下往上挑。' },
  { id: 'ku-ke', chars: ['ク', 'ケ'], tip: 'ケ 比 ク 多一橫。' },
  { id: 'ko-yu', chars: ['コ', 'ユ'], tip: 'コ 是方框少左邊；ユ 下方有一橫延伸出去。' },
  { id: 'no-nu-me', chars: ['ノ', 'メ', 'ヌ'], tip: 'ノ 一筆；メ 兩筆交叉；ヌ 在 ノ 上加一短筆。' },
  { id: 'wa-u-fu', chars: ['ワ', 'ウ', 'フ'], tip: 'ウ 上方有一點；ワ 沒有點；フ 只有一筆。' },
]
