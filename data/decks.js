/* Public-domain decks. Images live in assets/decks/<id>/<card-id>.jpg
   (downloaded from Wikimedia Commons; see README for sources). */
window.TAROT_DECKS = [
  {
    id: "rws",
    name: "Rider–Waite–Smith",
    year: "1909",
    artist: "Pamela Colman Smith, devised with A. E. Waite",
    place: "London",
    ratio: 0.575,
    suitNames: { wands: "Wands", cups: "Cups", swords: "Swords", pentacles: "Pentacles" },
    blurb:
      "The deck most modern tarot is built on. Smith gave every card — including the 40 numbered minors — a full illustrated scene, which is why it is the easiest deck to learn from.",
    history:
      "Published by William Rider & Son in December 1909. Waite, a member of the Hermetic Order of the Golden Dawn, set the symbolism; Pamela Colman Smith, a theatre designer and illustrator, drew all 78 cards in about six months. Her scenes for the minor arcana drew on the 15th-century Sola-Busca deck. Waite also swapped Strength and Justice (to 8 and 11) to fit Golden Dawn astrology.",
    source: "Wikimedia Commons, “RWS1909” scans — public domain.",
    lost: [],
  },
  {
    id: "marseille",
    oldNumbering: true, // Justice VIII, Strength XI
    name: "Tarot de Marseille",
    year: "c. 1701–1715",
    artist: "Jean Dodal, card-maker of Lyon",
    place: "Lyon, France",
    ratio: 0.55,
    suitNames: { wands: "Bâtons", cups: "Coupes", swords: "Épées", pentacles: "Deniers" },
    blurb:
      "Bold woodcut lines and flat stencilled colour. The Marseille pattern was the standard French tarot for three centuries, and many readers still prefer its unillustrated pips.",
    history:
      "Woodblock-printed and stencil-coloured, Dodal’s deck is one of the oldest surviving examples of the Marseille pattern. Its numbered minors are “pips” — arrangements of suit symbols, not scenes — so readers rely on number and suit rather than a picture. Note the older numbering: Justice is VIII and Strength is XI, and the Death card bears no name.",
    source: "Wikimedia Commons, “Jean Dodal” scans — public domain.",
    lost: [],
  },
  {
    id: "visconti",
    oldNumbering: true, // Justice VIII, Strength XI
    name: "Visconti-Sforza",
    year: "c. 1450s",
    artist: "Attributed to Bonifacio Bembo",
    place: "Milan, Italy",
    ratio: 0.5,
    suitNames: { wands: "Staves", cups: "Cups", swords: "Swords", pentacles: "Coins" },
    blurb:
      "Hand-painted with gold leaf for the Dukes of Milan. These are among the oldest tarot cards in existence — tarot began as a card game, not a divination tool.",
    history:
      "Painted for Francesco Sforza and Bianca Maria Visconti, the cards are now split between the Morgan Library in New York, the Accademia Carrara and a private collection in Bergamo. Four cards have never been found: The Devil, The Tower, the Three of Swords and the Knight of Coins. In this deck, “The Hermit” holds an hourglass — he was originally Time.",
    source: "Wikimedia Commons, Pierpont Morgan–Bergamo scans — public domain.",
    lost: ["major-15", "major-16", "swords-03", "pentacles-12"],
    unscanned: ["cups-14"],
  },
];
