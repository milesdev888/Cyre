#!/usr/bin/env python3
"""Build c7-cobra-*-transparent.png from the canonical black-field crest.

Removes the square black field (and interior black negative space) while
keeping the gold cobra, C7 monogram, and engraved ring. Fringe pixels are
despilled toward nearest solid gold so edges do not carry a black halo.
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "c7-cobra-512.png"
INF = 10**9


def flood(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y, x in [
        (0, 0),
        (0, w - 1),
        (h - 1, 0),
        (h - 1, w - 1),
        (0, w // 2),
        (h - 1, w // 2),
        (h // 2, 0),
        (h // 2, w - 1),
    ]:
        if mask[y, x] and not vis[y, x]:
            vis[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not vis[ny, nx] and mask[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))
    return vis


def nearest_core_maps(core: np.ndarray, max_dist: int = 4):
    h, w = core.shape
    dist = np.full((h, w), INF, dtype=np.int32)
    iy = np.zeros((h, w), dtype=np.int32)
    ix = np.zeros((h, w), dtype=np.int32)
    q: deque[tuple[int, int]] = deque()
    ys, xs = np.where(core)
    for y, x in zip(ys.tolist(), xs.tolist()):
        dist[y, x] = 0
        iy[y, x] = y
        ix[y, x] = x
        q.append((y, x))
    while q:
        y, x = q.popleft()
        d = dist[y, x]
        if d >= max_dist:
            continue
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and dist[ny, nx] > d + 1:
                dist[ny, nx] = d + 1
                iy[ny, nx] = iy[y, x]
                ix[ny, nx] = ix[y, x]
                q.append((ny, nx))
    return dist, iy, ix


def make_transparent(src: Image.Image) -> Image.Image:
    arr = np.array(src.convert("RGBA"))
    rgb = arr[:, :, :3].astype(np.float64)
    h, w = rgb.shape[:2]
    R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx = np.maximum(np.maximum(R, G), B)

    exterior = flood(mx <= 12)
    core = (mx >= 42) & ~exterior
    warm = (R >= G * 0.75) & (R >= B) & (mx >= 22) & ~exterior

    dist, iy, ix = nearest_core_maps(core, max_dist=4)
    near_core = dist <= 3
    content = ~exterior & (core | warm | (near_core & (mx >= 8)))

    alpha = np.zeros((h, w), dtype=np.float64)
    alpha[core] = 1.0
    nc = content & ~core
    yy, xx = np.where(nc)
    if len(yy):
        nmx = mx[iy[yy, xx], ix[yy, xx]]
        a = np.clip(mx[yy, xx] / np.maximum(nmx, 1.0), 0.0, 1.0)
        a = np.where(mx[yy, xx] < 10, a * (mx[yy, xx] / 10.0), a)
        alpha[yy, xx] = a
    alpha[alpha < 0.05] = 0.0
    alpha[exterior] = 0.0

    out = np.zeros((h, w, 4), dtype=np.float64)
    keep = alpha > 0
    fringe = keep & ~core
    fy, fx = np.where(fringe)
    for c in range(3):
        out[:, :, c][core] = rgb[:, :, c][core]
        if len(fy) == 0:
            continue
        obs = rgb[fy, fx, c]
        al = alpha[fy, fx]
        rec = np.clip(obs / np.maximum(al, 1e-6), 0, 255)
        near = rgb[iy[fy, fx], ix[fy, fx], c]
        known = dist[fy, fx] < INF
        w_near = (1.0 - al) ** 0.5
        mixed = rec * (1 - w_near) + near * w_near
        out[fy, fx, c] = np.clip(np.where(known, mixed, rec), 0, 255)
    out[:, :, 3] = alpha * 255.0
    return Image.fromarray(np.round(out).astype(np.uint8), "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--out-512", type=Path, default=ROOT / "c7-cobra-512-transparent.png")
    ap.add_argument("--out-256", type=Path, default=ROOT / "c7-cobra-256-transparent.png")
    args = ap.parse_args()
    im512 = make_transparent(Image.open(args.src))
    im512.save(args.out_512, optimize=True)
    im512.resize((256, 256), Image.Resampling.LANCZOS).save(args.out_256, optimize=True)
    print(f"wrote {args.out_512} ({args.out_512.stat().st_size} bytes)")
    print(f"wrote {args.out_256} ({args.out_256.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
