#!/usr/bin/env python3
"""Export every diagram HTML in a directory to PNG @2, diagram-only.

Follows the diagram-design skill's export procedure: render the source HTML
(so webfonts load), release clipping ancestors, screenshot the first <svg>
element's bounding box with a transparent page background. The SVG paints its
own paper rect, so the PNG carries the intended background.
"""
from pathlib import Path
import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright

SRC_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
SCALE = int(sys.argv[2]) if len(sys.argv) > 2 else 2

sources = sorted(SRC_DIR.glob("*.html"))
if not sources:
    print("no .html sources found", file=sys.stderr)
    sys.exit(1)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(device_scale_factor=SCALE)
    for src in sources:
        out = src.with_suffix(".png")
        page.goto(src.resolve().as_uri(), wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeoutError:
            page.evaluate("window.stop()")
            page.wait_for_timeout(4000)
            print(f"warning: webfont request stalled for {src.name}; captured with fallback typography", file=sys.stderr)
        page.evaluate("() => document.fonts.ready")
        svg = page.locator("svg").first
        svg.evaluate(
            "el => { for (let a = el.parentElement; a; a = a.parentElement) "
            "a.style.setProperty('overflow', 'visible', 'important'); }"
        )
        svg.screenshot(path=str(out), omit_background=True)
        print(f"exported {out.name}")
    browser.close()
