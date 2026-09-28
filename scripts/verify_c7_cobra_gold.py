#!/usr/bin/env python3
"""Guard: c7-cobra-*.png must be the bright-gold C7 crest (not olive hero snake)."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    ROOT / "c7-cobra-512.png",
    ROOT / "c7-cobra-256.png",
    ROOT / "c7-cobra-icon-512.png",
]


def center_top_quartile_rgb(path: Path) -> tuple[float, float, float]:
    im = np.array(Image.open(path).convert("RGB")).astype(float)
    h, w, _ = im.shape
    cy = slice(int(h * 0.35), int(h * 0.65))
    cx = slice(int(w * 0.35), int(w * 0.65))
    c = im[cy, cx]
    lum = c.sum(axis=2)
    lit = lum > 60
    if not lit.any():
        raise SystemExit(f"{path}: center is empty/black")
    thr = float(np.quantile(lum[lit], 0.75))
    top = lum >= thr
    mean = c[top].mean(axis=0)
    return float(mean[0]), float(mean[1]), float(mean[2])


def main() -> int:
    failed = 0
    for path in FILES:
        if not path.exists():
            print(f"FAIL missing {path.name}")
            failed += 1
            continue
        r, g, b = center_top_quartile_rgb(path)
        ok = r > 150 and r > g > b
        status = "PASS" if ok else "FAIL"
        print(f"{status} {path.name}: center top-quartile RGB=({r:.1f},{g:.1f},{b:.1f})")
        if not ok:
            failed += 1
            print("  expected warm gold: R>150 and R>G>B (C7 crest, not olive snake)")
    # Olive archive must NOT match c7-cobra-512 bytes
    olive = ROOT / "brand" / "hero-cobra-olive.png"
    canon = ROOT / "c7-cobra-512.png"
    if olive.exists() and canon.exists() and olive.read_bytes() == canon.read_bytes():
        print("FAIL brand/hero-cobra-olive.png is identical to c7-cobra-512.png")
        failed += 1
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
