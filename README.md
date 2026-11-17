# Arcana: a tarot study room

A static site for learning tarot. No build step or dependencies.

- **Basics**: deck structure, suits and elements, numbers, court cards, reversals, how to read.
- **Cards**: all 78 cards with upright/reversed meanings, the imagery and symbols of the
  Rider–Waite–Smith picture, love / work / advice notes, a journaling prompt, and the same card
  compared across three decks.
- **Spreads**: seven layouts (Single Card → Celtic Cross). Shuffle, deal, flip cards in place, and
  read each position. Once every card is turned, **Your reading** joins the cards into one story
  against your question: it guesses the topic (general / love / work & money, switchable), reads each
  card through its position, traces the tone from past to outcome, names the card that answers the
  question most directly, and lists patterns (majors, dominant suit, repeated numbers). It is
  rule-based and offline; per-spread wording lives in `data/spreads.js` (`phrase`, `story`, `arc`,
  `answer`).
- **Decks**: switch between Rider–Waite–Smith (1909), Tarot de Marseille by Jean Dodal
  (c. 1701–1715) and Visconti-Sforza (c. 1450s). The choice is remembered.
- **My decks** (`#/my-decks`): add photos or scans of decks you own. Images are shrunk to 640px and
  stored in the browser's IndexedDB only — never uploaded, and not part of the repo. Files named like
  `ace-of-cups.jpg`, `The Star.png` or `major-17.jpg` are placed automatically; the rest can be placed
  by hand or filled in deck order. Missing cards show a placeholder. Keep copyrighted decks off any
  public copy of the site.

## Run

```sh
python3 -m http.server 8642
# open http://localhost:8642
```

Opening `index.html` directly also works (only classic scripts, no fetch).

## Layout

```
index.html
css/styles.css
js/app.js                 # router, views, reading logic
js/deck-store.js          # your own decks: IndexedDB storage, image shrinking, filename matching
data/decks.js             # deck metadata (ratio, suit names, lost cards)
data/decks-generated.js   # AI decks, written by tools/generate/generate.py
data/spreads.js           # spread positions (x/y in card slots)
data/cards-*.js           # card text, schema in data/SCHEMA.md
assets/card-back.svg
assets/decks/<deck>/<card-id>.jpg
```

Card ids: `major-00`…`major-21` (RWS order: Strength 8, Justice 11), and `<suit>-01`…`<suit>-14`
(11 Page, 12 Knight, 13 Queen, 14 King) for wands, cups, swords, pentacles.

## Adding a deck

1. Put 78 images at `assets/decks/<id>/<card-id>.jpg`.
2. Add an entry to `data/decks.js` (`ratio` = width / height; list any missing cards in `lost`).

## Generated decks (AI)

`tools/generate/` makes AI decks with the Antigravity CLI (`agy`, Gemini image generation), one card
per call, from two descriptions written for this project: the **look** (`themes.json`) and the
**traditional card** (`cards.json`, exported from `data/cards-*.js`). Prompts never name the decks or
artists that inspired a theme; the site credits them ("Style inspired by …") and says the images are
AI-generated, not the original artwork.

```sh
python3 -I tools/generate/generate.py gen-ember --cards pilot          # 5 test cards
python3 -I tools/generate/generate.py gen-ember --cards all --jobs 2   # the full 78 (skips existing)
python3 -I tools/generate/generate.py all --cards pilot                # test every theme
python3 -I tools/generate/generate.py gen-ember --cards cups-07 --force  # redo one card
```

- The Fool is generated first and becomes the style reference for the rest of that deck.
- `agy` runs with `--sandbox --mode accept-edits`; permission checks are never skipped.
- Output: `assets/decks/<theme>/<card-id>.jpg` (560px wide). `data/decks-generated.js` is rewritten
  after every card; missing cards show a "not generated yet" placeholder.
- Logs: `tools/generate/logs/<theme>.jsonl`. Roughly 45–60 s per card on your Antigravity quota.
- Add a theme by adding an entry to `themes.json`.

## Image sources

All three decks are public-domain scans from Wikimedia Commons:

- Rider–Waite–Smith 1909: `Category:Rider-Waite tarot deck (Roses & Lilies)`, files `RWS1909 - *.jpeg`
- Jean Dodal: `Category:Tarot de Marseille - Jean Dodal`, files `Jean Dodal {M,B,C,D,E}NN.jpg`
- Visconti-Sforza: `Category:Pierpont Morgan-Bergamo Visconti-Sforza Tarot`, files `Bembo-Visconti-tarot-*.jpg`.
  The Devil, The Tower, Three of Swords and Knight of Coins are historically lost and show a placeholder.
