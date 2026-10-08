#!/usr/bin/env python3
"""Generate dark-mode variants of the wdrop diagrams.

The light diagrams are the source of truth for geometry. This script swaps the
light token set for the wdrop dark theme (zinc-950 paper, lime-300 accent — the
app's own palette) in a single regex pass so token chains (white -> #18181b ->
ink) can't cascade. Output: <slug>-dark.html next to the source.
"""
import re
import sys
from pathlib import Path

# wdrop light -> wdrop dark. Single pass, longest keys first.
HEX = {
    "#fafafa": "#09090b",  # paper -> zinc-950
    "#ffffff": "#18181b",  # white box fill -> zinc-900
    "#18181b": "#f4f4f5",  # ink -> zinc-100
    "#52525b": "#a1a1aa",  # muted -> zinc-400
    "#71717a": "#a1a1aa",  # soft stroke -> zinc-400
    "#4d7c0f": "#bef264",  # accent -> lime-300 (the app's accent)
    "#2563eb": "#60a5fa",  # link -> blue-400
}
RGBA = {
    "24,24,27": "244,244,245",   # ink washes -> zinc-100 washes
    "82,82,91": "161,161,170",   # zinc-600 washes -> zinc-400 washes
    "77,124,15": "190,242,100",  # lime-700 washes -> lime-300 washes
}

TOKEN_RE = re.compile(
    r"#[0-9a-fA-F]{6}|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[0-9.]+\s*\)"
)


def swap(match: re.Match) -> str:
    tok = match.group(0)
    if tok.startswith("#"):
        return HEX.get(tok.lower(), tok)
    inner = tok[tok.index("(") + 1 : tok.rindex(")")]
    parts = [p.strip() for p in inner.split(",")]
    key = ",".join(parts[:3])
    if key in RGBA:
        return f"rgba({RGBA[key]},{parts[3]})"
    return tok


def darkify(src: Path, slug: str) -> Path:
    html = src.read_text()
    # 1. swap color tokens (single pass — no cascade)
    html = TOKEN_RE.sub(swap, html)
    # 2. re-prefix accessible ids for the dark variant
    html = html.replace(f"{slug}-title", f"{slug}-dark-title")
    html = html.replace(f"{slug}-desc", f"{slug}-dark-desc")
    out = src.with_name(f"{slug}-dark.html")
    out.write_text(html)
    return out


if __name__ == "__main__":
    directory = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent
    made = []
    for src in sorted(directory.glob("*.html")):
        if src.name.endswith("-dark.html") or src.name in ("export.py",):
            continue
        slug = src.stem
        made.append(darkify(src, slug))
    for p in made:
        print(f"wrote {p.name}")
