#!/usr/bin/env python3
"""Generate AI tarot decks with the Antigravity CLI (`agy`), one card per call.

  python3 -I tools/generate/generate.py gen-ember --cards pilot
  python3 -I tools/generate/generate.py gen-ember --cards all --jobs 2
  python3 -I tools/generate/generate.py all --cards pilot
  python3 -I tools/generate/generate.py gen-ember --cards major-05,cups-03 --force
  python3 -I tools/generate/generate.py --manifest        # only rebuild data/decks-generated.js

agy runs with --sandbox --mode accept-edits (never with permission checks skipped). Its image
subagent saves into agy's own folder; we copy from the path it prints, shrink to 560px JPEG with
`sips`, and store at assets/decks/<theme>/<card-id>.jpg. Existing cards are skipped unless --force,
so an interrupted run can simply be restarted. The first card of a deck (The Fool) becomes the
style reference for every later card.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.join(ROOT, "tools", "generate")
CARDS = json.load(open(os.path.join(HERE, "cards.json")))
THEMES = json.load(open(os.path.join(HERE, "themes.json")))["themes"]
BY_ID = {c["id"]: c for c in CARDS}
PILOT = ["major-00", "major-01", "cups-03", "swords-10", "pentacles-13"]
ANCHOR = "major-00"
WIDTH = 560
LOCK = threading.Lock()

RANKS = {11: "Page", 12: "Knight", 13: "Queen", 14: "King"}
NUM_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]


def log(theme_id, **row):
    row["t"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with LOCK:
        os.makedirs(os.path.join(HERE, "logs"), exist_ok=True)
        with open(os.path.join(HERE, "logs", theme_id + ".jsonl"), "a") as f:
            f.write(json.dumps(row) + "\n")
        print(f"[{row['t']}] {theme_id} {row.get('card', '')} {row.get('status', '')} {row.get('note', '')}", flush=True)


def deck_dir(theme):
    return os.path.join(ROOT, "assets", "decks", theme["id"])


def brief(theme, card, anchor_path):
    singular, plural = theme["suitObjects"].get(card["suit"] or "", ["", ""])
    lines = [
        "A tarot card illustration. Portrait orientation, 9:16 aspect ratio, full-bleed.",
        "",
        "STYLE: " + theme["style"],
        "",
        f"SUBJECT - {card['name']} ({card['summary'].rstrip('.')}). {theme['composition']}",
        "Traditional imagery to reinterpret (simplify as the style requires): " + card["imagery"],
        "Key symbols to include: " + ", ".join(card["symbols"]) + ".",
    ]
    if card["arcana"] == "minor":
        n = card["number"]
        if n == 1:
            lines.append(f"The hero of the image is a single {singular}.")
        elif n <= 10:
            lines.append(f"Show exactly {NUM_WORDS[n]} ({n}) {plural}, each clearly separate and countable; no more and no fewer.")
        else:
            lines.append(f"This is a court card: the {RANKS[n]} of the suit, holding or presenting a {singular}.")
    if anchor_path:
        lines += [
            "",
            f"STYLE REFERENCE: use the image at {anchor_path} as the style reference. Match its rendering, palette, lighting, "
            "background and finish exactly, but do not copy its subject or composition.",
        ]
    lines += [
        "",
        "RULES: No text, letters, numbers, captions, titles or logos anywhere in the image. " + theme.get("rules", ""),
    ]
    return "\n".join(lines)


def agy_prompt(text):
    return (
        'Use the image-generator subagent (invoke_subagent with TypeName "image-generator") exactly once to create one image. '
        "Do not create, edit or delete any other files and do not run shell commands. "
        "When it finishes, reply with only the absolute path of the saved image file.\n\n"
        "Brief to give the image-generator, verbatim:\n---\n" + text + "\n---\n"
    )


PATH_RE = re.compile(r"(/[^\s`'\"<>]+\.(?:png|jpe?g|webp))", re.I)


def generate_card(theme, card_id, force=False, timeout=420, attempts=2):
    out = os.path.join(deck_dir(theme), card_id + ".jpg")
    if os.path.exists(out) and not force:
        return "skip"
    card = BY_ID[card_id]
    work = os.path.join(HERE, ".work", theme["id"])
    os.makedirs(work, exist_ok=True)
    anchor_src = os.path.join(deck_dir(theme), ANCHOR + ".jpg")
    anchor_path = None
    if card_id != ANCHOR and os.path.exists(anchor_src):
        anchor_path = os.path.join(work, "style-reference.jpg")
        shutil.copyfile(anchor_src, anchor_path)
    prompt = agy_prompt(brief(theme, card, anchor_path))
    for attempt in range(1, attempts + 1):
        t0 = time.time()
        try:
            res = subprocess.run(
                ["agy", "-p", prompt, "--sandbox", "--mode", "accept-edits", "--print-timeout", f"{timeout - 20}s"],
                cwd=work, capture_output=True, text=True, timeout=timeout,
            )
            text = (res.stdout or "") + "\n" + (res.stderr or "")
        except subprocess.TimeoutExpired:
            text = "timeout"
        paths = [p for p in PATH_RE.findall(text) if os.path.exists(p) and not p.endswith("style-reference.jpg")]
        secs = round(time.time() - t0)
        if paths:
            src = paths[-1]
            os.makedirs(deck_dir(theme), exist_ok=True)
            tmp = out + ".tmp.jpg"
            subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "84", "--resampleWidth", str(WIDTH), src, "--out", tmp],
                capture_output=True, check=True,
            )
            os.replace(tmp, out)
            log(theme["id"], card=card_id, status="ok", secs=secs, src=src, attempt=attempt)
            return "ok"
        log(theme["id"], card=card_id, status="retry" if attempt < attempts else "failed", secs=secs, attempt=attempt,
            note=text.strip().splitlines()[-1][:200] if text.strip() else "no output")
    return "failed"


def write_manifest():
    """data/decks-generated.js: every theme with at least one card, listing cards not generated yet."""
    decks = []
    for th in THEMES:
        d = deck_dir(th)
        have = {f[:-4] for f in os.listdir(d) if f.endswith(".jpg") and not f.endswith(".tmp.jpg")} if os.path.isdir(d) else set()
        if not have:
            continue
        ratio = 0.5625
        sample = os.path.join(d, sorted(have)[0] + ".jpg")
        try:
            dims = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", sample], capture_output=True, text=True).stdout
            w, h = (int(x) for x in re.findall(r"pixel(?:Width|Height): (\d+)", dims))
            ratio = round(w / h, 4)
        except Exception:
            pass
        credit = th["inspiredBy"] + (f" ({th['inspiredArtist']})" if th.get("inspiredArtist") else "")
        decks.append({
            "id": th["id"], "name": th["name"], "year": "AI-generated", "artist": "Style inspired by " + th["inspiredBy"],
            "place": "Generated with Gemini via Antigravity", "ratio": ratio,
            "suitNames": {"wands": "Wands", "cups": "Cups", "swords": "Swords", "pentacles": "Pentacles"},
            "blurb": th["blurb"],
            "history": f"An AI-generated deck in a style inspired by {credit}. It is not the original artwork: each image was "
                       "generated from a written description of the look plus this site's description of the traditional card.",
            "source": "AI-generated (Gemini, via the Antigravity CLI). Style inspired by " + credit + ".",
            "inspiredBy": th["inspiredBy"], "inspiredArtist": th.get("inspiredArtist", ""),
            "generated": True, "lost": [], "pending": [c["id"] for c in CARDS if c["id"] not in have],
        })
    js = (
        "/* Generated by tools/generate/generate.py — do not edit by hand.\n"
        "   AI-generated decks; `pending` lists cards not generated yet. */\n"
        "window.TAROT_DECKS = (window.TAROT_DECKS || []).concat(" + json.dumps(decks, ensure_ascii=False, indent=1) + ");\n"
    )
    with LOCK:
        with open(os.path.join(ROOT, "data", "decks-generated.js"), "w") as f:
            f.write(js)
    return decks


def run_theme(theme, ids, jobs, force):
    if ANCHOR in ids:  # the style reference comes first, alone
        ids = [ANCHOR] + [i for i in ids if i != ANCHOR]
        if generate_card(theme, ANCHOR, force) == "failed":
            print(f"{theme['id']}: the style-reference card failed; stopping this theme.", flush=True)
            return
        write_manifest()
        ids = ids[1:]
    with cf.ThreadPoolExecutor(max_workers=jobs) as ex:
        for fut in cf.as_completed([ex.submit(generate_card, theme, i, force) for i in ids]):
            if fut.result() == "ok":
                write_manifest()
    write_manifest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("theme", nargs="?", help="theme id from themes.json, or 'all'")
    ap.add_argument("--cards", default="pilot", help="pilot | all | comma-separated card ids")
    ap.add_argument("--jobs", type=int, default=1, help="cards generated in parallel (1-3)")
    ap.add_argument("--force", action="store_true", help="regenerate cards that already exist")
    ap.add_argument("--manifest", action="store_true", help="only rebuild data/decks-generated.js")
    a = ap.parse_args()
    if a.manifest or not a.theme:
        print(json.dumps([(d["id"], 78 - len(d["pending"])) for d in write_manifest()]))
        return
    if shutil.which("agy") is None:
        sys.exit("agy (Antigravity CLI) not found on PATH")
    themes = THEMES if a.theme == "all" else [t for t in THEMES if t["id"] == a.theme]
    if not themes:
        sys.exit("unknown theme; choose from: " + ", ".join(t["id"] for t in THEMES) + ", all")
    ids = PILOT if a.cards == "pilot" else [c["id"] for c in CARDS] if a.cards == "all" else a.cards.split(",")
    bad = [i for i in ids if i not in BY_ID]
    if bad:
        sys.exit("unknown card ids: " + ", ".join(bad))
    for th in themes:
        run_theme(th, ids, max(1, min(3, a.jobs)), a.force)


if __name__ == "__main__":
    main()
