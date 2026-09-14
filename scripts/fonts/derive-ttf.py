#!/usr/bin/env python3
"""Derive the LibreOffice font set from the web font set. REQ-DSG-016.

LibreOffice cannot read woff2, so the converter needs TrueType files — and
D66 says they must be THE SAME fonts. This script makes that literally true:
each TTF here is the woff2 bytes from the manifest, losslessly decompressed,
with a weight's Arabic and Latin subsets merged into one file so LibreOffice
sees one face with both scripts rather than two fonts of the same name.

Nothing is re-subsetted or re-hinted; a VARIABLE face is instanced once, at
the manifest weight, because LibreOffice cannot use it otherwise. Every OpenType layout
table comes through untouched — including `rlig`, `mark` and `mkmk`, the
three a Latin-minded subsetter drops (10 §4.2). check.mjs asserts that.

    pip install -r scripts/fonts/requirements.txt
    npm run fonts:derive

Deterministic: the same manifest always yields the same TTF bytes, so the
hashes recorded here are reproducible in the converter's image build.
"""

import hashlib
import io
import json
import sys
from pathlib import Path

from fontTools import version as FONTTOOLS_VERSION
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / "packages" / "fonts"
MANIFEST = FONTS / "manifest.json"

REQUIRED_GSUB = {"rlig"}
REQUIRED_GPOS = {"mark", "mkmk"}


def load_ttf(sha: str, weight: int) -> TTFont:
    font = TTFont(FONTS / f"{sha}.woff2", recalcTimestamp=False)
    font.flavor = None  # woff2 → plain sfnt; same tables, same bytes inside
    # A VARIABLE face (Reem Kufi is one: Google serves one file for every
    # weight, so the manifest lists the same hash four times) cannot be
    # merged — fontTools' Merger has no rule for VarStore — and LibreOffice
    # picks only named instances from one anyway. So the TTF is the static
    # instance at exactly the manifest weight: `instantiateVariableFont`
    # freezes the outlines and drops the variation tables, and keeps every
    # OpenType layout table — `rlig`, `mark`, `mkmk` included, which the
    # check below still asserts. Deterministic for a given input and weight.
    if "fvar" in font:
        axes = {a.axisTag: a for a in font["fvar"].axes}
        if "wght" in axes:
            w = min(max(weight, axes["wght"].minValue), axes["wght"].maxValue)
            font = instancer.instantiateVariableFont(font, {"wght": w}, inplace=False, updateFontNames=False)
            font.recalcTimestamp = False
    return font


def features(font: TTFont, table: str) -> set[str]:
    if table not in font:
        return set()
    return {r.FeatureTag for r in font[table].table.FeatureList.FeatureRecord}


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    groups: dict[tuple[str, int, str], list[dict]] = {}
    for face in manifest["faces"]:
        groups.setdefault((face["family"], face["weight"], face["style"]), []).append(face)

    ttf_entries = []
    for (family, weight, style), faces in sorted(groups.items()):
        # Arabic first: the merged font takes its name and metrics from the
        # first input, and the Arabic subset is the one whose vertical
        # metrics were set for stacked tashkeel.
        faces = sorted(faces, key=lambda f: (f["script"] != "arabic", f["sha256"]))
        parts = [load_ttf(f["sha256"], weight) for f in faces]
        if len(parts) == 1:
            font = parts[0]
        else:
            tmp = []
            for p in parts:
                buf = io.BytesIO()
                p.save(buf)
                tmp.append(buf.getvalue())
            merger = Merger()
            font = merger.merge([io.BytesIO(b) for b in tmp])
            font.recalcTimestamp = False

        arabic = any(f["script"] == "arabic" for f in faces)
        if arabic:
            missing = (REQUIRED_GSUB - features(font, "GSUB")) | (REQUIRED_GPOS - features(font, "GPOS"))
            if missing:
                print(f"✗ {family} {weight}: derived font lost {sorted(missing)} — refusing to write it", file=sys.stderr)
                return 1

        out = io.BytesIO()
        font.save(out)
        data = out.getvalue()
        sha = hashlib.sha256(data).hexdigest()
        (FONTS / f"{sha}.ttf").write_bytes(data)
        ttf_entries.append(
            {
                "family": family,
                "weight": weight,
                "style": style,
                "sha256": sha,
                "bytes": len(data),
                "file": f"{sha}.ttf",
                "derivedFrom": [f["sha256"] for f in faces],
                "tool": f"fonttools {FONTTOOLS_VERSION}",
            }
        )
        print(f"  {family} {weight} {style}  {sha[:12]}…  {len(data)} bytes  ← {len(faces)} subset(s)")

    keep = {e["file"] for e in ttf_entries}
    for stale in FONTS.glob("*.ttf"):
        if stale.name not in keep:
            stale.unlink()
            print(f"  removed stale {stale.name[:12]}….ttf")

    manifest["ttf"] = ttf_entries
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nderived {len(ttf_entries)} TrueType file(s) with fonttools {FONTTOOLS_VERSION}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
