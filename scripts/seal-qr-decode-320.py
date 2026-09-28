#!/usr/bin/env python3
"""CI gate: full-res seal PNG → downscale to Npx → cv2 and/or pyzbar must decode.

Usage:
  python3 scripts/seal-qr-decode-320.py <seal.png> <expected_url> [display_px=320]

Exit 0 on success. Exit 1 if decode fails. Exit 2 if deps missing.
"""
from __future__ import annotations

import sys
from pathlib import Path


def _try_cv2(bgr):
    import cv2

    det = cv2.QRCodeDetector()
    data, pts, _ = det.detectAndDecode(bgr)
    if data:
        return data, "cv2.QRCodeDetector"
    # OpenCV 4.8+ wechat-less fallback: try multi
    try:
        ok, infos, _, _ = det.detectAndDecodeMulti(bgr)
        if ok and infos:
            for info in infos:
                if info:
                    return info, "cv2.detectAndDecodeMulti"
    except Exception:
        pass
    return None, None


def _try_zbar(bgr):
    import cv2
    from pyzbar.pyzbar import decode as zbar_decode
    from PIL import Image

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    codes = zbar_decode(Image.fromarray(rgb))
    if codes:
        return codes[0].data.decode("utf-8", errors="replace"), "pyzbar"
    # Threshold variants — INTER_AREA softens modules; binary helps zbar.
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    for name, g in (
        ("otsu", cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]),
        ("adaptive", cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)),
    ):
        codes = zbar_decode(Image.fromarray(g))
        if codes:
            return codes[0].data.decode("utf-8", errors="replace"), f"pyzbar/{name}"
    return None, None


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: seal-qr-decode-320.py <png> <expected_url> [display_px]", file=sys.stderr)
        return 1
    png_path = Path(sys.argv[1])
    expected = sys.argv[2].strip()
    display_px = int(sys.argv[3]) if len(sys.argv) > 3 else 320

    try:
        import cv2
    except ImportError as e:
        print(f"ModuleNotFoundError: {e}", file=sys.stderr)
        return 2

    img = cv2.imread(str(png_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"failed to read {png_path}", file=sys.stderr)
        return 1

    if img.shape[2] == 4:
        bgr = img[:, :, :3].astype("float32")
        a = img[:, :, 3:4].astype("float32") / 255.0
        bgr = (bgr * a + 255.0 * (1.0 - a)).astype("uint8")
    else:
        bgr = img

    # Full-frame phone thumb + BR crop (QR lives in the corner).
    candidates = []
    for interp_name, interp in (
        ("area", cv2.INTER_AREA),
        ("cubic", cv2.INTER_CUBIC),
    ):
        small = cv2.resize(bgr, (display_px, display_px), interpolation=interp)
        candidates.append((f"full/{interp_name}", small))
        h, w = bgr.shape[:2]
        crop = bgr[h // 2 :, w // 2 :]
        crop_small = cv2.resize(crop, (display_px, display_px), interpolation=interp)
        candidates.append((f"br-crop/{interp_name}", crop_small))

    decoded = None
    engine = None
    used = None
    for label, frame in candidates:
        for fn in (_try_cv2, _try_zbar):
            try:
                data, eng = fn(frame)
            except ImportError as e:
                if "pyzbar" in str(e) or "No module" in str(e):
                    continue
                raise
            if data:
                decoded, engine, used = data, eng, label
                break
        if decoded:
            break

    if not decoded:
        out = Path("/opt/cursor/artifacts/seal-qr-320-fail.png")
        out.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out), candidates[0][1])
        print(f"FAIL: no decode at {display_px}px (wrote {out})", file=sys.stderr)
        return 1

    if decoded != expected:
        print(f"FAIL: decoded {decoded!r} != expected {expected!r}", file=sys.stderr)
        return 1

    print(
        f"seal-qr-decode-320.py: ok — {engine} via {used} decode@{display_px} → {decoded}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
