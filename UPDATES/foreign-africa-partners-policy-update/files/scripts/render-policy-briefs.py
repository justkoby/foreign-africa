"""Rebuild web reading assets from the original briefs (PyMuPDF + Pillow).

Run from any directory: python scripts/render-policy-briefs.py
To add a brief, put brief.pdf in public/documents/policy-briefs/<slug>/,
run this script, then add its metadata in src/pages/policy-content.js.
"""
import json
from pathlib import Path

import fitz
from PIL import Image

root = Path(__file__).resolve().parents[1] / "public/documents/policy-briefs"
for source in sorted(root.glob("*/brief.pdf")):
    texts = []
    with fitz.open(source) as document:
        for index, page in enumerate(document):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            image.save(source.parent / f"page-{index + 1}.webp", quality=88)
            if index == 0:
                image.thumbnail((480, 680))
                image.save(source.parent / "cover.webp", quality=90)
            paragraphs = []
            for block in page.get_text("blocks"):
                if block[6] != 0:
                    continue
                text = " ".join(block[4].split())
                # Running headers/footers repeat on every page and interrupt text reading.
                if not text or text.startswith(("Foreign Africa –", "Enterprise | Policy | Diplomacy")) or text.isdigit():
                    continue
                # Some styled callouts are separate PDF blocks on each line. Rejoin
                # lower-case continuations without merging headings into body paragraphs.
                if paragraphs and text[0].islower() and paragraphs[-1][-1] not in ".!?:;":
                    paragraphs[-1] += " " + text
                else:
                    paragraphs.append(text)
            texts.append(paragraphs)
    (source.parent / "text.json").write_text(json.dumps(texts, ensure_ascii=False), encoding="utf8")
    print(f"{source.parent.name}: {len(texts)} pages")
