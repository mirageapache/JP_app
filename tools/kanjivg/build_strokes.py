"""KanjiVG → 筆畫 JSON 建置腳本（規劃書 §6.1「資料準備」）

用法：
  python tools/kanjivg/build_strokes.py --all-kana
  python tools/kanjivg/build_strokes.py --chars "あいうえお" --out public/content/strokes

流程：
  1. 從 GitHub 下載 KanjiVG 的 SVG（快取在 tools/data/raw/kanjivg/，可重複執行）
  2. 解析每一筆畫的 path（KanjiVG 只用 M / c / C / s / S / l / L / z）
  3. 以弧長等距重取樣成固定點數（預設 32），座標系維持 109×109
  4. 輸出 strokes/<code>.json 與 strokes/index.json

輸出資料授權：KanjiVG（© Ulrich Apel），CC BY-SA 3.0。
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.request
from pathlib import Path

RAW_URL = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/{code}.svg"
ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "tools" / "data" / "raw" / "kanjivg"
DEFAULT_OUT = ROOT / "public" / "content" / "strokes"
VIEWBOX = 109
DEFAULT_POINTS = 32

# 平假名 ぁ(3041)～ゖ(3096) 與 片假名 ァ(30A1)～ヺ(30FA)，另含 ゛゜(309B/309C)
HIRAGANA = [chr(c) for c in range(0x3041, 0x3097)]
KATAKANA = [chr(c) for c in range(0x30A1, 0x30FB)]
MARKS = ["゛", "゜"]

Point = tuple[float, float]


def code_of(ch: str) -> str:
    return f"{ord(ch):05x}"


def fetch_svg(code: str) -> str | None:
    """下載 SVG；404 回傳 None。有快取時直接讀快取。"""
    cached = CACHE_DIR / f"{code}.svg"
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    try:
        with urllib.request.urlopen(RAW_URL.format(code=code), timeout=30) as res:
            text = res.read().decode("utf-8")
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        if e.code == 404:
            return None
        raise
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_text(text, encoding="utf-8")
    return text


_PATH_RE = re.compile(r'<path[^>]*id="kvg:([0-9a-f]+)-s(\d+)"[^>]*d="([^"]+)"')


def extract_stroke_paths(svg: str) -> list[str]:
    """依筆畫編號順序取出每一筆的 d 屬性。"""
    found = [(int(n), d) for _code, n, d in _PATH_RE.findall(svg)]
    found.sort()
    return [d for _n, d in found]


_TOKEN_RE = re.compile(r"[MmCcSsLlZz]|-?\d*\.?\d+(?:e-?\d+)?")


def parse_path(d: str, segments_per_curve: int = 24) -> list[Point]:
    """把 SVG path 轉成折線（只支援 KanjiVG 用到的指令）。"""
    tokens = _TOKEN_RE.findall(d)
    pts: list[Point] = []
    i = 0
    cmd = ""
    cur: Point = (0.0, 0.0)
    start: Point = (0.0, 0.0)
    prev_ctrl: Point | None = None

    def num() -> float:
        nonlocal i
        v = float(tokens[i])
        i += 1
        return v

    def cubic(p0: Point, c1: Point, c2: Point, p1: Point) -> None:
        for k in range(1, segments_per_curve + 1):
            t = k / segments_per_curve
            mt = 1 - t
            x = mt**3 * p0[0] + 3 * mt**2 * t * c1[0] + 3 * mt * t**2 * c2[0] + t**3 * p1[0]
            y = mt**3 * p0[1] + 3 * mt**2 * t * c1[1] + 3 * mt * t**2 * c2[1] + t**3 * p1[1]
            pts.append((x, y))

    while i < len(tokens):
        tok = tokens[i]
        if re.fullmatch(r"[MmCcSsLlZz]", tok):
            cmd = tok
            i += 1
            if cmd in "Zz":
                pts.append(start)
                cur = start
                prev_ctrl = None
                continue
        rel = cmd.islower()
        base = cur if rel else (0.0, 0.0)
        if cmd in "Mm":
            cur = (base[0] + num(), base[1] + num())
            start = cur
            pts.append(cur)
            prev_ctrl = None
            cmd = "l" if rel else "L"  # 後續隱含的座標視為 lineto
        elif cmd in "Ll":
            cur = (base[0] + num(), base[1] + num())
            pts.append(cur)
            prev_ctrl = None
        elif cmd in "Cc":
            c1 = (base[0] + num(), base[1] + num())
            c2 = (base[0] + num(), base[1] + num())
            p1 = (base[0] + num(), base[1] + num())
            cubic(cur, c1, c2, p1)
            prev_ctrl, cur = c2, p1
        elif cmd in "Ss":
            c1 = (2 * cur[0] - prev_ctrl[0], 2 * cur[1] - prev_ctrl[1]) if prev_ctrl else cur
            c2 = (base[0] + num(), base[1] + num())
            p1 = (base[0] + num(), base[1] + num())
            cubic(cur, c1, c2, p1)
            prev_ctrl, cur = c2, p1
        else:
            raise ValueError(f"不支援的 path 指令：{cmd!r} in {d[:40]}")
    return pts


def polyline_length(pts: list[Point]) -> float:
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def resample(pts: list[Point], n: int) -> list[Point]:
    """弧長等距重取樣成 n 點（含首尾）。"""
    if len(pts) == 1:
        return [pts[0]] * n
    total = polyline_length(pts)
    if total == 0:
        return [pts[0]] * n
    step = total / (n - 1)
    out: list[Point] = [pts[0]]
    acc = 0.0
    prev = pts[0]
    for p in pts[1:]:
        seg = math.dist(prev, p)
        while seg > 0 and acc + seg >= step * len(out) - 1e-9 and len(out) < n - 1:
            t = (step * len(out) - acc) / seg
            out.append((prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t))
        acc += seg
        prev = p
    while len(out) < n:
        out.append(pts[-1])
    return out


def build_char(ch: str, n_points: int) -> dict | None:
    code = code_of(ch)
    svg = fetch_svg(code)
    if svg is None:
        return None
    strokes = []
    for d in extract_stroke_paths(svg):
        poly = parse_path(d)
        strokes.append(
            {
                "d": d,
                "length": round(polyline_length(poly), 2),
                "points": [[round(x, 2), round(y, 2)] for x, y in resample(poly, n_points)],
            }
        )
    if not strokes:
        return None
    return {
        "char": ch,
        "code": code,
        "viewBox": VIEWBOX,
        "pointsPerStroke": n_points,
        "strokes": strokes,
        "source": "KanjiVG",
        "license": "CC BY-SA 3.0",
        "attribution": "KanjiVG (c) Ulrich Apel, http://kanjivg.tagaini.net",
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chars", default="", help="要處理的字（直接貼字串）")
    ap.add_argument("--all-kana", action="store_true", help="全部平假名、片假名與濁點")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--points", type=int, default=DEFAULT_POINTS)
    args = ap.parse_args()

    chars: list[str] = list(dict.fromkeys(args.chars))
    if args.all_kana:
        chars = list(dict.fromkeys(chars + HIRAGANA + KATAKANA + MARKS))
    if not chars:
        ap.error("請指定 --chars 或 --all-kana")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}
    missing: list[str] = []
    for ch in chars:
        data = build_char(ch, args.points)
        if data is None:
            missing.append(ch)
            continue
        (out_dir / f"{data['code']}.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        index[ch] = {"code": data["code"], "strokeCount": len(data["strokes"])}

    (out_dir / "index.json").write_text(
        json.dumps(
            {
                "source": "KanjiVG",
                "license": "CC BY-SA 3.0",
                "attribution": "KanjiVG (c) Ulrich Apel, http://kanjivg.tagaini.net",
                "viewBox": VIEWBOX,
                "pointsPerStroke": args.points,
                "chars": index,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    print(f"輸出 {len(index)} 個字到 {out_dir}")
    if missing:
        print(f"KanjiVG 沒有的字（{len(missing)}）：{''.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
