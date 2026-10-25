"""假名內容包建置腳本 → public/content/kana.json（規劃書 §5.2）

用法：
  python tools/kana/build_kana.py

內容：平假名與片假名的清音、濁音、半濁音、拗音、小寫假名，含行別、母音、羅馬字、
學習順序（規劃書 §6.2：依行 → 濁音 → 半濁音 → 拗音；平假名在前、片假名在後）、
筆畫數（取自 public/content/strokes/index.json），以及筆畫版本預留欄位。
拗音沒有手寫題（規劃書 §5.1），只建立讀音技能；小寫假名為獨立項目。
需先執行 tools/kanjivg/build_strokes.py。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STROKE_INDEX = ROOT / "public" / "content" / "strokes" / "index.json"
OUT = ROOT / "public" / "content" / "kana.json"

VOWELS = ["a", "i", "u", "e", "o"]

# (行名, 五個假名或 None, 五個羅馬字)
SEION = [
    ("あ行", "あいうえお", ["a", "i", "u", "e", "o"]),
    ("か行", "かきくけこ", ["ka", "ki", "ku", "ke", "ko"]),
    ("さ行", "さしすせそ", ["sa", "shi", "su", "se", "so"]),
    ("た行", "たちつてと", ["ta", "chi", "tsu", "te", "to"]),
    ("な行", "なにぬねの", ["na", "ni", "nu", "ne", "no"]),
    ("は行", "はひふへほ", ["ha", "hi", "fu", "he", "ho"]),
    ("ま行", "まみむめも", ["ma", "mi", "mu", "me", "mo"]),
    ("や行", "や・ゆ・よ", ["ya", None, "yu", None, "yo"]),
    ("ら行", "らりるれろ", ["ra", "ri", "ru", "re", "ro"]),
    ("わ行", "わ・・・を", ["wa", None, None, None, "wo"]),
    ("ん", "ん・・・・", ["n", None, None, None, None]),
]
DAKUON = [
    ("が行", "がぎぐげご", ["ga", "gi", "gu", "ge", "go"]),
    ("ざ行", "ざじずぜぞ", ["za", "ji", "zu", "ze", "zo"]),
    ("だ行", "だぢづでど", ["da", "ji", "zu", "de", "do"]),
    ("ば行", "ばびぶべぼ", ["ba", "bi", "bu", "be", "bo"]),
]
HANDAKUON = [("ぱ行", "ぱぴぷぺぽ", ["pa", "pi", "pu", "pe", "po"])]
# 拗音：(行名, 三個組合, 羅馬字)
YOUON = [
    ("きゃ行", ["きゃ", "きゅ", "きょ"], ["kya", "kyu", "kyo"]),
    ("しゃ行", ["しゃ", "しゅ", "しょ"], ["sha", "shu", "sho"]),
    ("ちゃ行", ["ちゃ", "ちゅ", "ちょ"], ["cha", "chu", "cho"]),
    ("にゃ行", ["にゃ", "にゅ", "にょ"], ["nya", "nyu", "nyo"]),
    ("ひゃ行", ["ひゃ", "ひゅ", "ひょ"], ["hya", "hyu", "hyo"]),
    ("みゃ行", ["みゃ", "みゅ", "みょ"], ["mya", "myu", "myo"]),
    ("りゃ行", ["りゃ", "りゅ", "りょ"], ["rya", "ryu", "ryo"]),
    ("ぎゃ行", ["ぎゃ", "ぎゅ", "ぎょ"], ["gya", "gyu", "gyo"]),
    ("じゃ行", ["じゃ", "じゅ", "じょ"], ["ja", "ju", "jo"]),
    ("びゃ行", ["びゃ", "びゅ", "びょ"], ["bya", "byu", "byo"]),
    ("ぴゃ行", ["ぴゃ", "ぴゅ", "ぴょ"], ["pya", "pyu", "pyo"]),
]
SMALL = [("小寫", ["ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゃ", "ゅ", "ょ", "っ"], ["a", "i", "u", "e", "o", "ya", "yu", "yo", "tsu"])]

# 規劃書 §12：常見的其他寫法，KanjiVG 收錄的為預設版本；替代版本的筆畫資料於 P1a 實際書寫後手動補充
STROKE_VARIANTS = {
    "そ": [{"id": "kanjivg", "label": "一筆寫法", "default": True}, {"id": "two", "label": "兩筆寫法", "strokes": None}],
    "り": [{"id": "kanjivg", "label": "兩筆寫法", "default": True}, {"id": "one", "label": "一筆寫法", "strokes": None}],
}


def to_katakana(s: str) -> str:
    return "".join(chr(ord(c) + 0x60) if 0x3041 <= ord(c) <= 0x3096 else c for c in s)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    stroke_index = json.loads(STROKE_INDEX.read_text(encoding="utf-8"))["chars"]
    items: list[dict] = []
    order = 0

    def add(ch: str, *, script: str, group: str, row: str, vowel: str | None, romaji: str, column: int | None) -> None:
        nonlocal order
        order += 1
        entry = stroke_index.get(ch)
        item = {
            "id": f"kana:{ch}",
            "char": ch,
            "script": script,
            "group": group,
            "row": row,
            "vowel": vowel,
            "column": column,
            "romaji": romaji,
            "order": order,
            "strokeCount": entry["strokeCount"] if entry else None,
            "skills": ["read", "write"] if entry else ["read"],
        }
        if ch in STROKE_VARIANTS and script == "hiragana":
            item["strokeVariants"] = STROKE_VARIANTS[ch]
        items.append(item)

    for script in ("hiragana", "katakana"):
        conv = (lambda s: s) if script == "hiragana" else to_katakana
        for group, rows in (("seion", SEION), ("dakuon", DAKUON), ("handakuon", HANDAKUON)):
            for row, chars, romajis in rows:
                for col, (ch, rj) in enumerate(zip(chars, romajis)):
                    if ch == "・":
                        continue
                    add(conv(ch), script=script, group=group, row=conv(row) if script == "katakana" else row, vowel=VOWELS[col], romaji=rj, column=col)
        for row, combos, romajis in YOUON:
            for col, (ch, rj) in enumerate(zip(combos, romajis)):
                add(conv(ch), script=script, group="youon", row=conv(row) if script == "katakana" else row, vowel=["a", "u", "o"][col], romaji=rj, column=col)
        for row, chars, romajis in SMALL:
            for ch, rj in zip(chars, romajis):
                add(conv(ch), script=script, group="small", row=row, vowel=None, romaji=rj, column=None)

    rows_meta = {
        "seion": [r for r, _, _ in SEION],
        "dakuon": [r for r, _, _ in DAKUON],
        "handakuon": [r for r, _, _ in HANDAKUON],
        "youon": [r for r, _, _ in YOUON],
    }
    OUT.write_text(
        json.dumps(
            {
                "version": 1,
                "vowels": VOWELS,
                "rows": rows_meta,
                "items": items,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    missing = [i["char"] for i in items if i["strokeCount"] is None and i["group"] != "youon"]
    print(f"輸出 {len(items)} 個假名到 {OUT}")
    if missing:
        print(f"沒有筆畫資料（非拗音）：{''.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
