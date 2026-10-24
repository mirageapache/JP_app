# tools/ 內容建置腳本

純 Python 3 標準函式庫，不需要安裝套件。下載的原始資料快取在 `tools/data/raw/`（不納入版本控制），可重複執行。

## kanjivg/build_strokes.py — 筆畫資料

```bash
python tools/kanjivg/build_strokes.py --all-kana          # 全部假名 → public/content/strokes/
python tools/kanjivg/build_strokes.py --chars "日本語"     # 指定字（P4 漢字時使用）
python tools/kanjivg/test_build_strokes.py                # 單元測試
```

輸出：`public/content/strokes/<unicode>.json`（每筆的原始 path、長度、32 個等距取樣點，座標 109×109）與 `index.json`（字 → 檔名、筆畫數）。

### P0 檢查結果（2026-10-25）

- KanjiVG 有 **184 個假名檔**：平假名、片假名、濁音／半濁音（が、ぱ 是獨立檔）、小寫假名（ゃ、っ）、濁點記號（゛゜）都有，**不需要自己組合**
- 沒有任何假名提供變體寫法（檔名無 `-Kaisho` 等後綴）
- 規劃書 §12 候選變體的 KanjiVG 寫法：

  | 字 | KanjiVG 筆畫數 | 說明 |
  |---|---|---|
  | き | 4 | 下方弧線分開（手寫式） |
  | さ | 3 | 下方弧線分開（手寫式） |
  | そ | 1 | 一筆寫法 |
  | り | 2 | 兩筆寫法 |
  | ふ | 4 | 點 → 中間 → 左點 → 右點 |

  KanjiVG 的假名本來就是手寫體字形，き、さ 不需要補「相連」版本；需要手動補充的只有「そ 兩筆」「り 一筆」這類確實常見的替代寫法，P1a 實際書寫後再決定。
- path 只用 `M c C s S l L z` 指令，腳本內建解析器即可，不需 svgpathtools
