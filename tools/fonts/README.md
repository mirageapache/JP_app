# 字型子集（Klee One）

設計系統（docs/design-system.md §3.1）指定練習用的大字使用 **Klee One**（教科書體風格，SIL Open Font License 1.1）。
為了離線使用與體積，App 只自帶需要的字元子集，放在 `public/fonts/`：

| 檔案 | 內容 |
|---|---|
| `klee-one-400-kana.woff2` | 全部假名、長音、濁點、常用標點、英數（約 200 字） |
| `klee-one-600-kana.woff2` | 同上，SemiBold |

子集字元清單：`klee-one-subset-text.txt`。

## 重新產生

子集是透過 Google Fonts 的 `text=` 參數取得（不需安裝 fonttools）：

```python
# 伺服器會依 User-Agent 決定格式，需帶 Safari／Chrome 的 UA 才會回 woff2
url = f"https://fonts.googleapis.com/css2?family=Klee+One:wght@{weight}&text={quote(text)}&display=swap"
# 解析回傳 CSS 中 url(...) format('woff2') 的連結並下載
```

P2 加入單字後，把 N5 單字用到的漢字加進 `klee-one-subset-text.txt` 重新產生；或改用 fonttools `pyftsubset` 從 Google Fonts GitHub（`ofl/kleeone`）的完整字型切子集。

字型授權：Klee One © Fontworks Inc.，SIL Open Font License 1.1；App「關於」頁需標示。
