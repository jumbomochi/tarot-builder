# Card data schema

Each file in data/ named cards-*.js must look like:

```js
window.TAROT_CARDS = (window.TAROT_CARDS || []).concat([
  { ...card }, ...
]);
```

Card object (all fields required):

| field | type | notes |
|---|---|---|
| id | string | majors: "major-00".."major-21"; minors: "<suit>-NN" e.g. "wands-01" (01=Ace .. 10, 11=Page, 12=Knight, 13=Queen, 14=King) |
| name | string | "The Fool", "Ace of Wands", "Page of Cups" (RWS naming: Strength=8, Justice=11) |
| arcana | "major" \| "minor" | |
| suit | null \| "wands" \| "cups" \| "swords" \| "pentacles" | |
| number | number | majors 0-21, minors 1-14 |
| element | string | "Fire" \| "Water" \| "Air" \| "Earth" (majors: element of their Golden Dawn attribution) |
| astrology | string | Golden Dawn attribution, e.g. "Uranus", "Aries", "Mars in Aries"; courts e.g. "Fire of Water" |
| summary | string | the card's essence in one line, max ~14 words |
| keywords | { upright: string[5], reversed: string[5] } | short lowercase phrases |
| upright | string | 2-3 sentences, warm and clear, written for a beginner |
| reversed | string | 2-3 sentences |
| imagery | string | 2-3 sentences describing what is pictured on the Rider–Waite–Smith 1909 card |
| symbols | { name: string, meaning: string }[] | 3-5 key symbols from the RWS image, meaning <= 1 sentence |
| love | string | 1 sentence: what it suggests in a relationship question |
| work | string | 1 sentence: career / money / projects |
| advice | string | 1 sentence: the card as advice |
| reflection | string | one open journaling question |

Plain double-quoted JS strings, escape apostrophes are fine inside double quotes. No trailing prose outside the array.
