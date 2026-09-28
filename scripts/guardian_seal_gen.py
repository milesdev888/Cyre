#!/usr/bin/env python3
"""guardian_seal_gen.py — Seal Pass 2 reference generator (crew spec).

make_seal(ca, serial, status) -> PNG bytes (1800×1800, black bg)

Band (r≈790): ✦ {serial} ✦ {PATH} ✦ {ca}  PATH ∈ SECURED | ESTABLISHED
Guide rings at r≈728 and r≈852. QR bottom-right → https://cyre.dev/verify/{serial}
REVOKED: desaturate ~25% color, brightness ~70%, red stamp 18°.
"""

from __future__ import annotations

import io
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps

try:
    import qrcode
except ImportError as e:  # pragma: no cover
    raise SystemExit("pip install 'qrcode[pil]' required for guardian_seal_gen") from e

CANVAS = 1800
BAND_R = 790
GUIDE_INNER = 728
GUIDE_OUTER = 852
CHAR_PX = 62
GOLD_HI = (240, 214, 140)  # #F0D68C
GOLD_LO = (196, 152, 62)  # #C4983E
SHADOW = (20, 12, 4)
SITE = "https://cyre.dev"

ROOT = Path(__file__).resolve().parents[1]
BASE_CANDIDATES = [
    ROOT / "brand" / "seals" / "guardian-seal-base.jpg",
    ROOT / "brand" / "seals" / "guardian-seal-reference-source.jpg",
]


def _load_base() -> Image.Image:
    for p in BASE_CANDIDATES:
        if p.exists():
            return Image.open(p).convert("RGBA")
    raise FileNotFoundError("guardian-seal-base.jpg not found under brand/seals/")


def _cut_medallion(base: Image.Image) -> Image.Image:
    """Black-bg JPEG → circular RGBA medallion."""
    a = base.convert("RGBA")
    # If already has alpha, still force circular cut from luminance
    rgb = a.convert("RGB")
    import numpy as np

    arr = np.asarray(rgb).astype("float32")
    h, w = arr.shape[:2]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    yy, xx = np.mgrid[0:h, 0:w]
    dist = ((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5
    lum = arr.mean(2)
    is_bg = (arr[:, :, 0] < 18) & (arr[:, :, 1] < 18) & (arr[:, :, 2] < 18)
    content = ~is_bg & (lum > 20)
    r = float(np.percentile(dist[content], 99.3))
    feather = np.clip((r - 1.0 - dist) / 1.5, 0, 1)
    alpha = np.where(is_bg, 0.0, 255.0) * feather
    alpha[dist > r] = 0
    out = np.dstack([arr, alpha]).astype("uint8")
    out[out[:, :, 3] < 1, :3] = 0
    im = Image.fromarray(out, "RGBA")
    bbox = im.getbbox()
    if not bbox:
        return im
    pad = 2
    l, t, rgt, b = bbox
    crop = im.crop((max(0, l - pad), max(0, t - pad), min(w, rgt + pad), min(h, b + pad)))
    side = max(crop.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2), crop)
    # remask
    sa = np.asarray(sq).astype("float32")
    hh, ww = sa.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    dist = ((xx - (ww - 1) / 2) ** 2 + (yy - (hh - 1) / 2) ** 2) ** 0.5
    R = min(hh, ww) / 2 - 2
    sa[:, :, 3] *= np.clip((R - dist) / 1.25, 0, 1)
    sa[sa[:, :, 3] < 1, :3] = 0
    return Image.fromarray(sa.astype("uint8"), "RGBA")


def _font(size: int) -> ImageFont.ImageFont:
    for name in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        "/System/Library/Fonts/Menlo.ttc",
    ):
        p = Path(name)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def _draw_guide_rings(draw: ImageDraw.ImageDraw, cx: float, cy: float) -> None:
    for r, col, w in (
        (GUIDE_INNER, (*GOLD_LO, 160), 2),
        (GUIDE_OUTER, (*GOLD_LO, 160), 2),
    ):
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, outline=col, width=w)


def _draw_band_text(
    img: Image.Image,
    text: str,
    cx: float,
    cy: float,
    radius: float,
    font: ImageFont.ImageFont,
) -> None:
    """Clockwise ring text starting at 12 o'clock (top)."""
    # Measure advances
    tmp = ImageDraw.Draw(img)
    advances: list[float] = []
    for ch in text:
        bbox = tmp.textbbox((0, 0), ch, font=font)
        advances.append(max(8.0, float(bbox[2] - bbox[0]) + 4.0))
    total = sum(advances)
    # Fit one full loop (or slightly less) around the circle
    # Start at 12 o'clock: angle -π/2, clockwise ⇒ increasing angle
    theta = -math.pi / 2
    # Scale spacing so text fills ~full circle with slight gap
    scale = (2 * math.pi * 0.98) / max(total / radius, 1e-6)
    # Actually advances are in px; angular advance = adv/radius
    # If total arc > 2π, shrink tracking
    track = 1.0
    if total / radius > 2 * math.pi * 0.98:
        track = (2 * math.pi * 0.98) * radius / total

    # Render each glyph rotated so baseline sits on the circle, upright-outward
    for ch, adv in zip(text, advances):
        mid = theta + (adv * track) / (2 * radius)
        # Glyph image
        bbox = tmp.textbbox((0, 0), ch, font=font)
        gw, gh = bbox[2] - bbox[0] + 8, bbox[3] - bbox[1] + 8
        g = Image.new("RGBA", (max(1, gw), max(1, gh)), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        # shadow then two-tone fill
        ox, oy = 3 - bbox[0], 3 - bbox[1]
        gd.text((ox + 2, oy + 2), ch, font=font, fill=(*SHADOW, 200))
        gd.text((ox, oy), ch, font=font, fill=(*GOLD_LO, 255))
        gd.text((ox - 1, oy - 1), ch, font=font, fill=(*GOLD_HI, 230))
        # Rotate so character top points outward (away from center)
        # At angle mid, outward is (cos, sin); glyph "up" should align with -radial for text readable along band
        # Standard: rotate so local +y (down in image) maps appropriately.
        # We want baseline tangent; character upright = radial outward.
        deg = math.degrees(mid) + 90  # upright along radius
        rot = g.rotate(-deg, resample=Image.Resampling.BICUBIC, expand=True)
        # Position glyph center on the band
        gx = cx + math.cos(mid) * radius - rot.size[0] / 2
        gy = cy + math.sin(mid) * radius - rot.size[1] / 2
        img.alpha_composite(rot, (int(gx), int(gy)))
        theta += (adv * track) / radius


def _make_qr(url: str, box: int = 6) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    # dark-on-light (scannable); quiet zone included via border
    return qr.make_image(fill_color="#0B1210", back_color="#F0D68C").convert("RGBA")


def make_seal(
    ca: str,
    serial: str,
    status: str = "VALID",
    path: str | None = None,
) -> bytes:
    """Return PNG bytes — 1800×1800 black canvas.

    path: SECURED | ESTABLISHED (optional; omitted for legacy band).
    """
    serial = str(serial or "").strip().upper()
    ca = str(ca or "").strip()
    status = str(status or "VALID").upper()
    mark = str(path or "").strip().upper()
    if mark in ("LIFETIME", "TIMED", "SECURED"):
        mark = "SECURED"
    elif mark in ("ESTABLISHED", "BATTLE-TESTED", "BATTLE_TESTED"):
        mark = "ESTABLISHED"
    elif mark not in ("SECURED", "ESTABLISHED"):
        mark = ""

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 255))
    cx = cy = CANVAS / 2

    med = _cut_medallion(_load_base())
    # Fit medallion inside inner guide ring
    target = int(GUIDE_INNER * 2) - 8
    med = med.resize((target, target), Image.Resampling.LANCZOS)
    canvas.alpha_composite(med, ((CANVAS - target) // 2, (CANVAS - target) // 2))

    draw = ImageDraw.Draw(canvas, "RGBA")
    _draw_guide_rings(draw, cx, cy)

    band = f"✦ {serial} ✦ {mark} ✦ {ca} " if mark else f"✦ {serial} ✦ {ca} "
    font = _font(CHAR_PX)
    _draw_band_text(canvas, band, cx, cy, BAND_R, font)

    # QR bottom-right, outside the band
    verify = f"{SITE}/verify/{serial}"
    qr = _make_qr(verify, box=5)
    # Cap size so it sits in the corner outside r=852
    max_qr = 220
    if qr.size[0] > max_qr:
        qr = qr.resize((max_qr, max_qr), Image.Resampling.NEAREST)
    margin = 36
    canvas.alpha_composite(qr, (CANVAS - qr.size[0] - margin, CANVAS - qr.size[1] - margin))

    if status == "REVOKED":
        # desaturate ~25% color keep, brightness ~70%
        rgb = canvas.convert("RGB")
        gray = ImageOps.grayscale(rgb).convert("RGB")
        mixed = Image.blend(rgb, gray, 0.75)
        mixed = ImageEnhance.Brightness(mixed).enhance(0.70)
        canvas = mixed.convert("RGBA")
        # red REVOKED stamp
        stamp = Image.new("RGBA", (900, 160), (0, 0, 0, 0))
        sd = ImageDraw.Draw(stamp)
        sd.rectangle([8, 8, 892, 152], outline=(200, 40, 40, 255), width=8, fill=(160, 30, 30, 210))
        sf = _font(96)
        sd.text((60, 28), "REVOKED", font=sf, fill=(255, 230, 220, 255))
        stamp = stamp.rotate(18, resample=Image.Resampling.BICUBIC, expand=True)
        canvas.alpha_composite(
            stamp,
            ((CANVAS - stamp.size[0]) // 2, (CANVAS - stamp.size[1]) // 2),
        )

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def make_missing_placeholder() -> bytes:
    """Small flat NO SUCH SEAL image for unknown serials."""
    img = Image.new("RGB", (640, 640), (12, 14, 16))
    d = ImageDraw.Draw(img)
    d.ellipse([40, 40, 600, 600], outline=(80, 80, 80), width=4)
    f = _font(42)
    d.text((120, 290), "NO SUCH SEAL", font=f, fill=(160, 160, 160))
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", default="GRD-2026-00001")
    ap.add_argument("--ca", default="979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww")
    ap.add_argument("--status", default="VALID", choices=["VALID", "REVOKED"])
    ap.add_argument("--path", default="SECURED", help="SECURED | ESTABLISHED")
    ap.add_argument("-o", "--out", default="")
    args = ap.parse_args()
    out = Path(args.out) if args.out else Path(f"/tmp/seal-{args.serial}-{args.status}.png")
    out.write_bytes(make_seal(args.ca, args.serial, args.status, path=args.path))
    print("wrote", out, out.stat().st_size)
