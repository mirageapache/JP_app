"""python -m pytest tools/kanjivg  （或 python tools/kanjivg/test_build_strokes.py）"""

import math

from build_strokes import extract_stroke_paths, parse_path, polyline_length, resample


def test_parse_relative_cubic_and_smooth():
    # 一筆：M 起點，c 相對三次曲線，s 平滑曲線
    pts = parse_path("M10,10c10,0,20,10,20,20s10,20,20,20")
    assert pts[0] == (10.0, 10.0)
    assert math.isclose(pts[-1][0], 50.0) and math.isclose(pts[-1][1], 50.0)
    assert len(pts) == 1 + 24 * 2


def test_parse_uppercase_absolute():
    pts = parse_path("M0,0C0,10,10,10,10,0L20,0")
    assert pts[-1] == (20.0, 0.0)


def test_resample_is_evenly_spaced():
    pts = [(0.0, 0.0), (100.0, 0.0)]
    out = resample(pts, 5)
    assert out == [(0.0, 0.0), (25.0, 0.0), (50.0, 0.0), (75.0, 0.0), (100.0, 0.0)]


def test_resample_keeps_endpoints_on_curve():
    poly = parse_path("M10,10c10,0,20,10,20,20")
    out = resample(poly, 32)
    assert len(out) == 32
    assert out[0] == poly[0] and out[-1] == poly[-1]
    seg = [math.dist(a, b) for a, b in zip(out, out[1:])]
    assert max(seg) - min(seg) < 0.5
    assert math.isclose(sum(seg), polyline_length(poly), rel_tol=0.02)


def test_extract_stroke_paths_in_order():
    svg = (
        '<path id="kvg:03042-s2" d="M2,2"/>'
        '<path id="kvg:03042-s1" d="M1,1"/>'
        '<path id="kvg:03042-s3" d="M3,3"/>'
    )
    assert extract_stroke_paths(svg) == ["M1,1", "M2,2", "M3,3"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
