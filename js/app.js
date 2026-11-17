(() => {
  "use strict";

  /* ---------------- Data ---------------- */
  const SUIT_ORDER = ["major", "wands", "cups", "swords", "pentacles"];
  const SUITS = {
    major: { label: "Major Arcana", element: "Spirit", theme: "The great archetypes and turning points of a life." },
    wands: { label: "Wands", element: "Fire", theme: "Energy, ambition, creativity and will — what drives you." },
    cups: { label: "Cups", element: "Water", theme: "Emotions, relationships, intuition and the heart." },
    swords: { label: "Swords", element: "Air", theme: "Thought, truth, conflict and communication — the mind." },
    pentacles: { label: "Pentacles", element: "Earth", theme: "Body, money, work, home — the material world." },
  };
  const suitOf = (c) => (c.arcana === "major" ? "major" : c.suit);
  const CARDS = (window.TAROT_CARDS || [])
    .slice()
    .sort((a, b) => SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)) || a.number - b.number);
  const BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
  const BUILTIN = window.TAROT_DECKS; // historic scans + AI-generated styles (data/decks-generated.js)
  const HISTORIC = BUILTIN.filter((d) => !d.generated);
  /* Decks you add yourself live in IndexedDB (js/deck-store.js) and are loaded before first render. */
  const customDecks = [];
  const customArt = {}; // deckId -> { cardId: object URL }
  let storeError = "";
  const allDecks = () => BUILTIN.concat(customDecks);
  const SPREADS = window.TAROT_SPREADS;

  /* ---------------- State ---------------- */
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("arcana." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("arcana." + k, JSON.stringify(v));
      } catch {}
    },
  };
  const state = {
    deck: store.get("deck", "rws"),
    reversals: store.get("reversals", true),
    filter: "all",
    query: "",
    readings: {},
    daily: null,
    detailFace: "upright",
    libView: store.get("libView", "compact") === "large" ? "large" : "compact",
    nextDaily: null,
  };
  const deck = () => allDecks().find((d) => d.id === state.deck) || BUILTIN[0];
  const applyTheme = () => (document.documentElement.dataset.deck = state.deck);

  /* ---------------- Helpers ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const rand = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const shuffled = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const suitDot = (c) => `<span class="dot" data-suit="${suitOf(c)}"></span>`;
  const deckSuitName = (c, d = deck()) => (c.arcana === "major" ? "Major Arcana" : d.suitNames[c.suit]);

  const artSrc = (d, id) => (d.custom ? customArt[d.id]?.[id] || null : hasArt(d, id) ? `assets/decks/${d.id}/${id}.jpg` : null);
  const hasArt = (d, id) => (d.custom ? !!customArt[d.id]?.[id] : !d.lost.includes(id) && !(d.unscanned || []).includes(id) && !(d.pending || []).includes(id));
  const deckThumb = (d) => artSrc(d, "major-00") || (d.custom && Object.values(customArt[d.id] || {})[0]) || "assets/card-back.svg";

  function cardArt(card, { d = deck(), reversed = false, eager = false } = {}) {
    if (d.custom && !hasArt(d, card.id)) {
      return `<div class="tcard lost" style="--ratio:${d.ratio}" role="img" aria-label="${esc(card.name)}: not added yet">
        <div class="lost-inner"><b>${esc(card.name)}</b><small>Not added to ${esc(d.name)} yet. <a href="#/my-decks/${d.id}">Add it</a></small></div></div>`;
    }
    const lost = d.lost.includes(card.id);
    if (!hasArt(d, card.id)) {
      const msg = lost
        ? `Lost to history — this card of the ${esc(d.name)} deck has never been found.`
        : d.generated
          ? `Not generated yet for ${esc(d.name)}.`
          : `This card survives, but no public-domain scan of it is available.`;
      return `<div class="tcard lost" style="--ratio:${d.ratio}" role="img" aria-label="${esc(card.name)}: ${lost ? "a lost card" : "image unavailable"}">
        <div class="lost-inner"><b>${esc(card.name)}</b><small>${msg}</small></div></div>`;
    }
    return `<div class="tcard${reversed ? " reversed" : ""}" style="--ratio:${d.ratio}">
      <img src="${artSrc(d, card.id)}" alt="${esc(card.name)}${reversed ? " (reversed)" : ""}, ${esc(d.name)} deck" loading="${eager ? "eager" : "lazy"}" decoding="async"></div>`;
  }
  const backArt = (ratio) => `<div class="tcard back" style="--ratio:${ratio}" aria-hidden="true"></div>`;

  /* ---------------- Header ---------------- */
  function renderDeckPicker() {
    const d = deck();
    $("#deck-picker").innerHTML = `
      <button class="deck-btn" id="deck-btn" aria-haspopup="true" aria-expanded="false" aria-label="Choose deck. Current: ${esc(d.name)}">
        <img src="${deckThumb(d)}" alt=""><span class="label">${esc(d.name)}</span><span class="chev">▼</span>
      </button>
      <div class="deck-menu" id="deck-menu" role="menu">
        ${[
          ["Historic decks", HISTORIC],
          ["Generated styles", BUILTIN.filter((x) => x.generated)],
          ["Your decks", customDecks],
        ]
          .filter(([, list]) => list.length)
          .map(
            ([label, list]) => `<div class="deck-group" role="presentation">${label}</div>` +
              list.map(
                (x) => `<button class="deck-option" role="menuitemradio" aria-checked="${x.id === d.id}" data-action="set-deck" data-deck="${x.id}">
            <img src="${deckThumb(x)}" alt="">
            <div><strong>${esc(x.name)}</strong><span>${esc(x.year)} · ${esc(x.artist)}</span></div>
            <span class="swatch" aria-hidden="true"></span>
          </button>`
              ).join("")
          )
          .join("")}
        <a class="deck-option deck-add" role="menuitem" href="#/my-decks"><span class="deck-add-plus" aria-hidden="true">+</span><div><strong>Add your own deck</strong><span>Photos of a deck you own, kept in this browser</span></div></a>
      </div>`;
  }
  function setDeck(id) {
    if (id === state.deck || !allDecks().some((d) => d.id === id)) return;
    const apply = () => {
      state.deck = id;
      store.set("deck", id);
      applyTheme();
      renderDeckPicker();
      render({ keepScroll: true });
    };
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduce) document.startViewTransition(apply);
    else apply();
  }

  /* ---------------- Views ---------------- */
  function viewHome() {
    if (!state.daily && !state.nextDaily) state.nextDaily = CARDS[rand(CARDS.length)].id;
    return `
    <section class="wrap hero">
      <div class="hero-copy">
        <div class="eyebrow">A tarot study room</div>
        <h1>Learn the cards by <em>looking</em> at&nbsp;them.</h1>
        <div class="daily-panel" id="daily-panel">${dailyPanel()}</div>
      </div>
      <div class="hero-card" id="daily-card" style="--ratio:${deck().ratio}">${dailyCard()}</div>
    </section>

    <section class="wrap" aria-label="At a glance">
      <div class="stats">
        <div class="stat"><span class="stat-n">78</span><span class="stat-l">Cards</span></div>
        <div class="stat"><span class="stat-n">22</span><span class="stat-l">Major Arcana</span></div>
        <div class="stat"><span class="stat-n">${HISTORIC.length}</span><span class="stat-l">Historic decks</span></div>
        <div class="stat"><span class="stat-n">${SPREADS.length}</span><span class="stat-l">Spreads</span></div>
      </div>
    </section>

    <section class="wrap section">
      <nav class="index" aria-label="Sections">
        <a class="index-item" href="#/basics"><span class="index-num" aria-hidden="true">I</span><h3>The Basics</h3><p>How the deck is built: the Major Arcana, four suits and their elements, numbers, court cards and reversals.</p><span class="index-go">Start here <span aria-hidden="true">→</span></span></a>
        <a class="index-item" href="#/cards"><span class="index-num" aria-hidden="true">II</span><h3>The Cards</h3><p>All 78 cards with upright and reversed meanings, the symbols in each picture, and journaling prompts.</p><span class="index-go">Browse the cards <span aria-hidden="true">→</span></span></a>
        <a class="index-item" href="#/spreads"><span class="index-num" aria-hidden="true">III</span><h3>The Spreads</h3><p>Seven layouts from a single daily card to the Celtic Cross. Shuffle, deal and read position by position.</p><span class="index-go">Lay out a spread <span aria-hidden="true">→</span></span></a>
      </nav>
    </section>

    <section class="band band-gold">
      <div class="wrap">
        <div class="section-head"><div><div class="eyebrow">Choose your deck</div><h2>Three decks, five centuries</h2></div>
          <p>Every page uses the deck you pick — the art, and the colours of the whole site. The meanings stay the same.</p></div>
        <div class="decks">${HISTORIC.map(deckCard).join("")}</div>
        <p class="band-more"><a href="#/my-decks">${customDecks.length ? `Your decks (${customDecks.length})` : "Add a deck you own"} <span aria-hidden="true">→</span></a> Photos of your own cards, kept only in this browser.</p>
      </div>
    </section>`;
  }

  function deckCard(x) {
    const trio = ["major-00", "major-06", "major-19"].map((id) => cardArt(BY_ID[id], { d: x })).join("");
    const on = x.id === state.deck;
    return `<button class="deck-card${on ? " selected" : ""}" data-action="set-deck" data-deck="${x.id}" aria-pressed="${on}">
      <div class="trio">${trio}</div>
      <div><div class="meta"><span class="swatch" aria-hidden="true"></span>${esc(x.year)} · ${esc(x.place)}</div><h3>${esc(x.name)}</h3></div>
      <p>${esc(x.blurb)}</p>
      <span class="deck-state">${on ? "In use" : "Use this deck →"}</span>
    </button>`;
  }

  /* Today's card: a large face-down card in the hero that turns over in place. */
  function dailyCard() {
    const d = deck();
    const dd = state.daily;
    const id = dd ? dd.id : state.nextDaily;
    const c = BY_ID[id];
    const label = dd ? `Study ${esc(c.name)}` : "Turn over today’s card";
    return `<button class="flip hero-flip${dd ? " revealed" : ""}" id="hero-flip" style="--ratio:${d.ratio}" data-action="${dd ? "study-daily" : "draw-daily"}" aria-label="${label}">
        <div class="flip-inner" aria-hidden="true"><div class="face">${backArt(d.ratio)}</div><div class="face front">${cardArt(c, { reversed: dd ? dd.reversed : false, eager: true })}</div></div>
      </button>`;
  }
  function dailyPanel() {
    const dd = state.daily;
    if (!dd) {
      return `<p class="lede">Seventy-eight cards, three historic decks, and the spreads readers actually use. Start with today’s card: take a breath, think of the day ahead, then turn it over.</p>
        <div class="hero-actions">
          <button class="btn primary" data-action="draw-daily">Turn over today’s card</button>
          <a class="btn" href="#/cards">Explore the cards</a>
        </div>
        <label class="toggle"><input type="checkbox" data-action="toggle-reversals" ${state.reversals ? "checked" : ""}> Include reversed cards</label>`;
    }
    const c = BY_ID[dd.id];
    const face = dd.reversed ? "reversed" : "upright";
    return `<div class="eyebrow">Today · ${esc(deckSuitName(c))}${dd.reversed ? " · Reversed" : ""}</div>
      <h2 class="daily-name" tabindex="-1">${esc(c.name)}</h2>
      <p class="daily-summary">${esc(c.summary)}</p>
      <ul class="kw">${c.keywords[face].map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      <p class="daily-reflect">${esc(c.reflection)}</p>
      <div class="hero-actions"><a class="btn primary" href="#/card/${c.id}">Study this card</a>
        <button class="btn" data-action="reset-daily">Draw again</button></div>`;
  }

  /* ----- Library ----- */
  function viewLibrary() {
    const chips = [["all", "All 78"], ...SUIT_ORDER.map((s) => [s, SUITS[s].label])]
      .map(
        ([k, label]) =>
          `<button class="chip" data-action="filter" data-filter="${k}" aria-pressed="${state.filter === k}" ${k !== "all" ? `data-suit="${k}"` : ""}>
            ${k !== "all" ? '<span class="dot"></span>' : ""}${label}</button>`
      )
      .join("");
    return `<div class="wrap">
      <div class="section">
        <div class="section-head"><div><div class="eyebrow">${esc(deck().name)} · ${esc(deck().year)}</div><h2 class="page-title">The Cards</h2></div>
          <p>The 22 Major Arcana and the four suits of the Minor Arcana. Choose any card to study its meaning, imagery and symbols.</p></div>
        <div class="lib-tools">
          <div class="chips" role="group" aria-label="Filter by suit">${chips}</div>
          <div class="view-toggle" role="group" aria-label="Card size">
            <button data-action="lib-view" data-view="large" aria-pressed="${state.libView === "large"}">Large</button>
            <button data-action="lib-view" data-view="compact" aria-pressed="${state.libView === "compact"}">Compact</button>
          </div>
          <input class="search" id="search" type="search" placeholder="Search names or keywords…" value="${esc(state.query)}" aria-label="Search cards">
        </div>
        <div class="grid-cards${state.libView === "large" ? " large" : ""}" id="grid">${libraryGrid()}</div>
      </div></div>`;
  }
  function libraryGrid() {
    const q = state.query.trim().toLowerCase();
    const match = (c) =>
      (state.filter === "all" || suitOf(c) === state.filter) &&
      (!q ||
        c.name.toLowerCase().includes(q) ||
        [...c.keywords.upright, ...c.keywords.reversed].some((k) => k.toLowerCase().includes(q)));
    const list = CARDS.filter(match);
    if (!list.length) return `<p class="empty">No cards match “${esc(state.query)}”.</p>`;
    let html = "";
    let group = null;
    for (const c of list) {
      const s = suitOf(c);
      if (s !== group && !q) {
        group = s;
        const alt = s !== "major" && deck().suitNames[s] !== SUITS[s].label ? ` · “${deck().suitNames[s]}” in this deck` : "";
        html += `<div class="group-title" data-suit="${s}"><h3>${SUITS[s].label}</h3><span class="group-el">${SUITS[s].element}${alt}</span><span class="group-theme">${SUITS[s].theme}</span></div>`;
      }
      html += `<a class="grid-item" href="#/card/${c.id}">${cardArt(c)}<div class="cap" data-suit="${s}"><span class="dot"></span><span><span class="cap-name">${esc(c.name)}</span><span class="cap-kw">${esc(c.keywords.upright.slice(0, 3).join(" · "))}</span></span></div></a>`;
    }
    return html;
  }

  /* ----- Card detail ----- */
  function viewCard(id) {
    const c = BY_ID[id];
    if (!c) return viewNotFound();
    const d = deck();
    const i = CARDS.indexOf(c);
    const prev = CARDS[(i - 1 + CARDS.length) % CARDS.length];
    const next = CARDS[(i + 1) % CARDS.length];
    const face = state.detailFace;
    const rev = face === "reversed";
    const roman = c.arcana === "major" ? toRoman(c.number) : "";
    const swapped = d.oldNumbering && (c.id === "major-08" || c.id === "major-11");
    const numeral = c.arcana === "major" ? (swapped ? (c.id === "major-08" ? "XI" : "VIII") : roman) : c.number <= 10 ? toRoman(c.number) : "";
    const hasScan = hasArt(d, c.id);
    const marseilleNote =
      d.oldNumbering && (c.id === "major-08" || c.id === "major-11")
        ? `<p class="note">In the ${esc(d.name)} deck this card is numbered ${c.id === "major-08" ? "XI" : "VIII"} — older decks put Justice at 8 and Strength at 11.</p>`
        : "";
    const pipNote =
      d.id === "marseille" && c.arcana === "minor" && c.number <= 10
        ? `<p class="note">Marseille pips show only the suit symbols, so the scene described here is the Rider–Waite–Smith one. Read pips by number and suit.</p>`
        : "";
    return `<article class="card-page">
      <div class="wrap">
      <div class="crumbs"><a href="#/cards">← All cards</a>
        <div class="pager">
          <a class="btn small" href="#/card/${prev.id}" aria-label="Previous: ${esc(prev.name)}">← ${esc(prev.name)}</a>
          <a class="btn small" href="#/card/${next.id}" aria-label="Next: ${esc(next.name)}">${esc(next.name)} →</a>
        </div></div></div>
      <header class="suit-band" data-suit="${suitOf(c)}">
        <div class="wrap suit-band-inner${numeral ? "" : " no-num"}">
          ${numeral ? `<span class="detail-num" aria-hidden="true">${numeral}</span>` : ""}
          <div class="suit-band-text">
            <div class="eyebrow">${esc(deckSuitName(c))}${c.arcana === "minor" && c.number > 10 ? " · Court card" : ""}</div>
            <h1>${esc(c.name)}</h1>
            <div class="sub">
              <span class="tag">${esc(c.element)}</span>
              <span class="tag">✶ ${esc(c.astrology)}</span>
              ${c.arcana === "minor" ? `<span class="tag">${c.number <= 10 ? "Number " + c.number : "Court card"}</span>` : ""}
            </div>
          </div>
        </div>
      </header>
      <div class="wrap">
      <div class="detail">
        <div class="detail-art">
          <div id="detail-art" class="art-frame" style="--ratio:${d.ratio}">${
            hasScan
              ? `<button class="art-zoom" data-action="zoom" aria-label="Enlarge ${esc(c.name)}">${cardArt(c, { reversed: rev, eager: true })}</button>`
              : cardArt(c, { reversed: rev, eager: true })
          }</div>
          <div class="art-controls">
            <div class="tabs" role="tablist" aria-label="Orientation">
              <button role="tab" aria-selected="${!rev}" data-action="face" data-face="upright">Upright</button>
              <button role="tab" aria-selected="${rev}" data-action="face" data-face="reversed">Reversed</button>
            </div>
            ${hasScan ? `<button class="link-btn" data-action="zoom">Enlarge ⤢</button>` : `<span class="note">${esc(d.name)}</span>`}
          </div>
          ${marseilleNote}
          ${d.generated ? `<p class="note">AI-generated. Style inspired by ${esc(d.inspiredBy)}${d.inspiredArtist ? ` (${esc(d.inspiredArtist)})` : ""}; not the original artwork.</p>` : ""}
          ${d.custom ? `<p class="note">${d.meta.credit ? `Artwork © ${esc(d.meta.credit)}. ` : ""}Your own copy, shown only in this browser.</p>` : ""}
        </div>
        <div>
          <p class="summary">${esc(c.summary)}</p>

          <div id="meaning">${meaningBlock(c, face)}</div>

          <div class="block"><h3>In a reading</h3>
            <div class="contexts">
              <div class="context"><span class="eyebrow">Love</span><p>${esc(c.love)}</p></div>
              <div class="context"><span class="eyebrow">Work &amp; money</span><p>${esc(c.work)}</p></div>
              <div class="context"><span class="eyebrow">As advice</span><p>${esc(c.advice)}</p></div>
            </div></div>

          <div class="block"><h3>The picture</h3><p>${esc(c.imagery)}</p>${pipNote}
            <ol class="symbols">${c.symbols.map((s, n) => `<li class="symbol"><span class="symbol-n" aria-hidden="true">${n + 1}</span><div><b>${esc(s.name)}</b><span>${esc(s.meaning)}</span></div></li>`).join("")}</ol>
          </div>

          <div class="block"><h3>Across the decks</h3>
            <p class="muted">The same card as drawn in three centuries. Tap one to switch decks.</p>
            <div class="compare">${allDecks().map(
              (x) => `<button data-action="set-deck" data-deck="${x.id}" aria-current="${x.id === d.id}" aria-label="Show ${esc(x.name)}">
                ${cardArt(c, { d: x })}<div class="cap">${esc(x.name)}<br>${esc(x.year)}</div></button>`
            ).join("")}</div>
          </div>

          <div class="block"><h3>Reflect</h3><p class="reflection">${esc(c.reflection)}</p></div>
        </div>
      </div></div></article>`;
  }
  function meaningBlock(c, face) {
    return `<div class="tabs" role="tablist" aria-label="Meaning">
        <button role="tab" aria-selected="${face === "upright"}" data-action="face" data-face="upright">Upright meaning</button>
        <button role="tab" aria-selected="${face === "reversed"}" data-action="face" data-face="reversed">Reversed meaning</button>
      </div>
      <ul class="kw">${c.keywords[face].map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
      <p class="meaning-text">${esc(c[face])}</p>`;
  }
  function toRoman(n) {
    if (n === 0) return "0";
    const m = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let r = "";
    for (const [v, s] of m) while (n >= v) { r += s; n -= v; }
    return r;
  }

  /* ----- Spreads ----- */
  function viewSpreads() {
    return `<div class="wrap"><div class="section">
      <div class="section-head"><div><div class="eyebrow">Layouts</div><h2 class="page-title">The Spreads</h2></div>
        <p>A spread gives each card a job. The same card means something different as “the past” than as “the advice”. Start small — most readers use three cards far more than ten.</p></div>
      <div class="spread-list">${SPREADS.map(
        (s, i) => `<a class="spread-item" href="#/spread/${s.id}">
          <span class="spread-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
          ${miniLayout(s)}
          <div class="spread-body"><h3>${esc(s.name)}</h3><p>${esc(s.tagline)}</p></div>
          <div class="spread-meta"><span class="spread-level">${esc(s.level)}</span><span class="spread-count">${s.count} card${s.count > 1 ? "s" : ""}</span></div>
          <span class="spread-go" aria-hidden="true">→</span>
        </a>`
      ).join("")}</div></div></div>`;
  }
  function geometry(spread, cw, ratio) {
    const ch = cw / ratio;
    const gx = 1.18, gy = 1.12;
    const xs = spread.positions.map((p) => p.x), ys = spread.positions.map((p) => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const width = (Math.max(...xs) - minX) * cw * gx + cw;
    const height = (Math.max(...ys) - minY) * ch * gy + ch;
    const slots = spread.positions.map((p) => ({ ...p, left: (p.x - minX) * cw * gx, top: (p.y - minY) * ch * gy }));
    return { cw, ch, width, height, slots };
  }
  function miniLayout(s) {
    const units = Math.max(...s.positions.map((p) => p.x)) * 1.18 + 1;
    const ysUnits = (Math.max(...s.positions.map((p) => p.y)) - Math.min(...s.positions.map((p) => p.y))) * 1.12 + 1;
    const cw = Math.min(46, 280 / units, (140 / ysUnits) * 0.575);
    const g = geometry(s, cw, 0.575);
    return `<div class="mini" aria-hidden="true"><div style="position:relative;width:${g.width}px;height:${g.height}px;margin:0 auto;top:50%;transform:translateY(-50%)">
      ${g.slots.map(
        (p) => `<div class="slot${p.rotate ? " rot" : ""}" style="left:${p.left}px;top:${p.top}px;width:${g.cw}px;height:${g.ch}px;${p.rotate ? "transform:rotate(90deg);z-index:2" : ""}">${p.n}</div>`
      ).join("")}</div></div>`;
  }

  function viewReading(id) {
    const s = SPREADS.find((x) => x.id === id);
    if (!s) return viewNotFound();
    const r = state.readings[id];
    return `<div class="wrap">
      <div class="crumbs"><a href="#/spreads">← All spreads</a><span class="tag">${esc(s.level)} · ${s.count} card${s.count > 1 ? "s" : ""}</span></div>
      <div class="reading-head"><div><div class="eyebrow">Spread · ${s.count} card${s.count > 1 ? "s" : ""}</div><h2 class="page-title">${esc(s.name)}</h2><p>${esc(s.about)}</p></div></div>
      <div class="reading-layout">
        <div class="reading-stage" id="reading-stage">
          <div class="reading-controls" id="reading-controls">${readingControls(s, r)}</div>
          <div class="board-wrap"><div class="board" id="board" data-spread="${s.id}"></div></div>
        </div>
        <div class="reading-text" id="interp">${interpretation(s, r)}</div>
      </div>
    </div>`;
  }
  function readingControls(s, r) {
    if (!r) {
      return `<input class="question" id="question" placeholder="Your question (optional) — e.g. “What do I need to know about my new job?”" aria-label="Your question">
        <label class="toggle"><input type="checkbox" data-action="toggle-reversals" ${state.reversals ? "checked" : ""}> Reversals</label>
        <button class="btn primary" data-action="deal">Shuffle &amp; deal</button>`;
    }
    const all = r.revealed.every(Boolean);
    return `${r.question ? `<div class="question-shown reading-note">“${esc(r.question)}”</div>` : `<div class="muted reading-note">Tap each card to turn it over, in order.</div>`}
      <button class="btn" data-action="reveal-all" ${all ? "disabled" : ""}>Reveal all</button>
      <button class="btn primary" data-action="new-reading">New reading</button>`;
  }
  function renderBoard({ animate = false } = {}) {
    const board = $("#board");
    if (!board) return;
    const s = SPREADS.find((x) => x.id === board.dataset.spread);
    const r = state.readings[s.id];
    const d = deck();
    const avail = board.parentElement.clientWidth - 40;
    const units = (Math.max(...s.positions.map((p) => p.x)) - Math.min(...s.positions.map((p) => p.x))) * 1.18 + 1;
    let cw = Math.max(34, Math.min(s.count === 1 ? 200 : 150, avail / units));
    let g = geometry(s, cw, d.ratio);
    const stage = $("#reading-stage");
    if (stage && getComputedStyle(stage).position === "sticky") {
      const wrapCs = getComputedStyle(board.parentElement);
      const chrome = parseFloat(wrapCs.paddingTop) + parseFloat(wrapCs.paddingBottom) + parseFloat(wrapCs.marginTop) + 2;
      const availH = innerHeight - (parseFloat(getComputedStyle(stage).top) || 0) - ($("#reading-controls")?.offsetHeight || 0) - chrome - 16;
      for (let k = 0; k < 2 && g.height > availH && availH > 120; k++) {
        cw = Math.max(34, (cw * availH) / g.height);
        g = geometry(s, cw, d.ratio);
      }
    }
    board.style.width = g.width + "px";
    board.style.height = g.height + "px";
    board.innerHTML = g.slots
      .map((p, i) => {
        const fromX = g.width / 2 - (p.left + g.cw / 2);
        const fromY = g.height + 40 - p.top;
        const style = `left:${p.left}px;top:${p.top}px;width:${g.cw}px;height:${g.ch}px;z-index:${p.rotate ? 3 : 1};--fromX:${fromX}px;--fromY:${fromY}px;animation-delay:${i * 110}ms`;
        const num = `<span class="slot-num" ${p.rotate ? 'style="left:auto;right:-10px;top:auto;bottom:-10px"' : ""}>${p.n}</span>`;
        if (!r) {
          return `<div class="slot-pos${p.rotate ? " sideways" : ""}" style="${style}" data-i="${i}">${num}<div class="slot-inner"><div class="ghost" style="font-size:${Math.max(10, g.cw / 7.5)}px">
            <div><b>${p.n}</b>${g.cw > 80 ? `<small>${esc(p.title)}</small>` : ""}</div></div></div></div>`;
        }
        const pick = r.cards[i];
        const c = BY_ID[pick.id];
        return `<div class="slot-pos${p.rotate ? " sideways" : ""}${animate ? " dealt" : ""}" style="${style}" data-i="${i}">${num}
          <div class="slot-inner"><button class="flip${r.revealed[i] ? " revealed" : ""}" data-action="flip" data-i="${i}" aria-label="${r.revealed[i] ? `${esc(p.title)}: ${esc(c.name)}` : `Turn over card ${p.n}, ${esc(p.title)}`}">
            <div class="flip-inner"><div class="face">${backArt(d.ratio)}</div><div class="face front">${cardArt(c, { reversed: pick.reversed })}</div></div>
          </button></div></div>`;
      })
      .join("");
  }
  function interpretation(s, r) {
    const items = s.positions
      .map((p, i) => {
        let body;
        if (!r) body = "";
        else if (!r.revealed[i]) body = `<div class="hidden-note">Face down — tap card ${p.n} to reveal.</div>`;
        else {
          const pick = r.cards[i];
          const c = BY_ID[pick.id];
          const face = pick.reversed ? "reversed" : "upright";
          body = `<div class="cardline"><a href="#/card/${c.id}">${esc(c.name)}</a>${pick.reversed ? ' <span class="tag">Reversed</span>' : ""}</div>
            <ul class="kw" style="margin-top:8px">${c.keywords[face].map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
            <p>${esc(c[face])}</p>`;
        }
        const thumb = r && r.revealed[i] ? cardArt(BY_ID[r.cards[i].id], { reversed: r.cards[i].reversed }) : backArt(deck().ratio);
        return `<div class="interp-item" data-pos="${i}">
          <div>${thumb}</div>
          <div><div class="pos"><span class="n">${p.n}</span><h3>${esc(p.title)}</h3></div>
          <div class="pos-meaning">${esc(p.meaning)}</div>${body}</div></div>`;
      })
      .join("");
    const guide = `<div class="summary-box"><div class="eyebrow">Guide</div><h3>How to read it</h3>
        <p class="muted" style="margin-bottom:10px"><b style="color:var(--text)">Best for:</b> ${esc(s.whenToUse)}</p>
        <ul class="tips">${s.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    const done = r && r.revealed.every(Boolean);
    const pending = r && !done ? `<p class="synth-pending">Your reading appears here once every card is turned over.</p>` : "";
    return `${done ? synthesis(s, r) : pending}<div class="interp">${items}</div>${guide}`;
  }
  function patterns(r) {
    const cards = r.cards.map((p) => BY_ID[p.id]);
    const n = cards.length;
    if (n < 3) return [];
    const majors = cards.filter((c) => c.arcana === "major").length;
    const suits = {};
    cards.filter((c) => c.arcana === "minor").forEach((c) => (suits[c.suit] = (suits[c.suit] || 0) + 1));
    const top = Object.entries(suits).sort((a, b) => b[1] - a[1])[0];
    const missing = ["wands", "cups", "swords", "pentacles"].filter((s) => !suits[s]);
    const reversed = r.cards.filter((p) => p.reversed).length;
    const nums = {};
    cards.filter((c) => c.arcana === "minor" && c.number <= 10).forEach((c) => (nums[c.number] = (nums[c.number] || 0) + 1));
    const repeats = Object.entries(nums).filter(([, v]) => v > 1);
    const courts = cards.filter((c) => c.arcana === "minor" && c.number > 10).length;
    const lines = [];
    lines.push(
      `<b>${majors} of ${n} Major Arcana.</b> ${majors / n >= 0.5 ? "Big life themes are at work here — this is about more than day-to-day events." : majors === 0 ? "No majors: the situation is practical and in your hands." : "A mix of life themes and everyday matters."}`
    );
    if (top && top[1] >= 2)
      lines.push(`<b>${SUITS[top[0]].label} lead (${top[1]}).</b> The element of ${SUITS[top[0]].element.toLowerCase()} dominates: ${SUITS[top[0]].theme.toLowerCase()}`);
    if (n >= 5 && missing.length && missing.length < 4)
      lines.push(`<b>Missing: ${missing.map((s) => SUITS[s].label).join(", ")}.</b> Consider what that absent element might be asking of you.`);
    if (repeats.length)
      lines.push(`<b>Repeated number${repeats.length > 1 ? "s" : ""}: ${repeats.map(([k]) => k).join(", ")}.</b> ${repeats.map(([k]) => NUMBERS[k - 1][1]).join(" ")}`);
    if (courts >= 2) lines.push(`<b>${courts} court cards.</b> Other people — or different sides of yourself — play a large role.`);
    if (state.reversals && n >= 3)
      lines.push(`<b>${reversed} reversed.</b> ${reversed / n > 0.5 ? "Much energy is blocked or turned inward; something may need releasing." : reversed === 0 ? "Everything is flowing outward and openly." : "Note where the energy is held back."}`);
    return lines;
  }

  /* ----- Reading the spread as a whole, against the question ----- */
  const TOPICS = { general: "General", love: "Love", work: "Work & money" };
  function detectTopic(q) {
    const t = q.toLowerCase();
    const love = (t.match(/\b(love|loves|loved|relationship|partner|boyfriend|girlfriend|husband|wife|spouse|marriage|married|marry|dating|crush|romance|romantic|ex|breakup|soulmate|feelings)\b/g) || []).length;
    const work = (t.match(/\b(job|jobs|work|working|career|boss|manager|colleagues?|coworkers?|money|business|interview|promotion|salary|raise|project|clients?|finances?|financial|debt|rent|invest|investment|study|exam|exams|school|university|degree|startup|company|team|hired|fired|quit)\b/g) || []).length;
    return love > work ? "love" : work > love ? "work" : love ? "love" : "general";
  }
  function questionKind(q) {
    const t = q.trim().toLowerCase();
    if (!t) return "none";
    if (/\bwhen\b/.test(t)) return "when";
    if (/^(should|shall)\b/.test(t) || /\bor\b/.test(t)) return "decision";
    if (/^(will|is|am|are|do|does|did|can|could|would|has|have)\b/.test(t)) return "yesno";
    if (/^why\b/.test(t)) return "why";
    return "open";
  }
  /* Rough tone of each card: 1 light, -1 heavy, 0 mixed. Courts and unlisted cards are mixed.
     Reversal pulls a light card down (blocked) and a heavy one up (easing). */
  const LIGHT = new Set("major-01 major-03 major-06 major-07 major-08 major-10 major-14 major-17 major-19 major-21 wands-01 wands-03 wands-04 wands-06 wands-08 cups-01 cups-02 cups-03 cups-06 cups-09 cups-10 swords-01 pentacles-01 pentacles-03 pentacles-06 pentacles-08 pentacles-09 pentacles-10".split(" "));
  const HEAVY = new Set("major-15 major-16 major-18 wands-05 wands-10 cups-05 swords-03 swords-05 swords-07 swords-08 swords-09 swords-10 pentacles-05".split(" "));
  function tone(pick) {
    const base = LIGHT.has(pick.id) ? 1 : HEAVY.has(pick.id) ? -1 : 0;
    if (!pick.reversed) return base;
    return base === 0 ? -0.5 : -base * 0.5;
  }
  const toneWord = (t) => (t >= 0.75 ? "light" : t <= -0.75 ? "heavy" : t > 0 ? "easing" : t < 0 ? "strained" : "mixed");
  const listAnd = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const firstSentence = (txt) => (txt.match(/^.*?[.!?](\s|$)/) || [txt])[0].trim();

  function topicNote(c, pick, p, topic) {
    const rev = pick.reversed;
    if (p.role === "advice") {
      return rev
        ? `<span class="note-tag">Advice</span>Upright the advice would be “${esc(c.advice)}” Reversed, notice what is stopping you from doing that.`
        : `<span class="note-tag">Advice</span>${esc(c.advice)}`;
    }
    if (topic === "general") return `<span class="note-tag">Meaning</span>${esc(rev ? firstSentence(c.reversed) : c.summary)}`;
    const txt = topic === "love" ? c.love : c.work;
    return rev
      ? `<span class="note-tag">${TOPICS[topic]}</span>Upright this would say: “${esc(txt)}” Reversed, that is delayed, blocked or turned inward.`
      : `<span class="note-tag">${TOPICS[topic]}</span>${esc(txt)}`;
  }
  function storyLine(s, r, n, topic) {
    const i = s.positions.findIndex((p) => p.n === n);
    const p = s.positions[i];
    const pick = r.cards[i];
    const c = BY_ID[pick.id];
    const kw = c.keywords[pick.reversed ? "reversed" : "upright"].slice(0, 3);
    return `<p class="story-line" data-pos="${i}"><span class="story-n" title="${esc(p.title)}">${p.n}</span><span>${esc(p.phrase)} <a href="#/card/${c.id}">${esc(c.name)}</a>${pick.reversed ? ", reversed" : ""} — ${esc(listAnd(kw))}.
      <span class="topic-note">${topicNote(c, pick, p, topic)}</span></span></p>`;
  }
  function arcLine(s, r) {
    if (!s.arc) return "";
    const ts = s.arc.map((n) => tone(r.cards[s.positions.findIndex((p) => p.n === n)]));
    const names = s.arc.map((n) => s.positions.find((p) => p.n === n).title);
    const first = ts[0], last = ts[ts.length - 1], mid = ts.slice(1, -1);
    let shape;
    if (mid.length && Math.min(...mid) < Math.min(first, last) - 0.4) shape = "It <b>dips in the middle</b>: a harder stretch between a better start and finish. The middle card is the thing to get through.";
    else if (mid.length && Math.max(...mid) > Math.max(first, last) + 0.4) shape = "It <b>peaks in the middle</b>: now is the high point, so use it before things settle.";
    else if (last > first + 0.4) shape = "The story <b>rises</b>: it moves from a heavier start toward a lighter finish.";
    else if (last < first - 0.4) shape = "The story <b>darkens</b>: read the later cards as a warning while the path can still change.";
    else shape = "The story <b>holds steady</b>: the same tone runs from start to finish, so the question is how you work with it.";
    return `<p class="arc-line"><span class="arc-path">${names.map((nm, k) => `${esc(nm)} <i>${toneWord(ts[k])}</i>`).join(" → ")}</span>${shape}</p>`;
  }
  function answerBlock(s, r, topic, kind) {
    const a = s.answer;
    const i = s.positions.findIndex((p) => p.n === a.pos);
    const p = s.positions[i];
    const pick = r.cards[i];
    const c = BY_ID[pick.id];
    const t = tone(pick);
    let html = `<p>The card that speaks most directly to your question is <a href="#/card/${c.id}">${esc(c.name)}</a>${pick.reversed ? " (reversed)" : ""}, in the <i>${esc(p.title.replace(/^The /, ""))}</i> position: ${esc(a.label)}.</p>
      <p class="topic-note">${
        /* the story line already gave this card's topic note; here give the other angle */
        p.role === "advice" ? topicNote(c, pick, { ...p, role: "" }, topic) : topicNote(c, pick, { ...p, role: "advice" }, topic)
      }</p>`;
    if (kind === "yesno") {
      const lean = t >= 0.75 ? "leans <b>yes</b>" : t <= -0.75 ? "leans <b>no</b>" : t > 0 ? "leans <b>yes, with conditions</b>" : t < 0 ? "leans <b>not yet</b>" : "is <b>unclear</b>: the card is mixed, so look at what it asks of you instead";
      html += `<p>Read as a yes-or-no question, this ${lean}. Treat that as a nudge, not a verdict.</p>`;
    } else if (kind === "when") {
      html += `<p>Tarot is weak at timing. Read this card as what needs to happen first, rather than as a date.</p>`;
    } else if (kind === "decision") {
      html += `<p>For a choice, ask whether this card describes the path you are leaning toward. If it feels uncomfortable, that discomfort is information too.</p>`;
    } else if (kind === "why") {
      const root = s.positions.find((q) => /past|foundation|situation/i.test(q.title));
      if (root) html += `<p>You asked why. The <i>${esc(root.title.replace(/^The /, ""))}</i> card (${root.n}) is where the cause usually shows.</p>`;
    }
    if (a.also) {
      const others = a.also.map((n) => {
        const j = s.positions.findIndex((q) => q.n === n);
        return { p: s.positions[j], pick: r.cards[j], c: BY_ID[r.cards[j].id] };
      });
      const agree = others.filter((o) => Math.sign(tone(o.pick)) === Math.sign(t)).length;
      html += `<p>Read it alongside ${listAnd(others.map((o) => `<a href="#/card/${o.c.id}">${esc(o.c.name)}</a> (${esc(o.p.title)})`))}. ${
        agree === others.length
          ? "They point the same way, which makes the message stronger."
          : agree === 0
            ? "They pull in a different direction, so the outcome depends on which of those forces you feed."
            : "They partly agree: notice which card feels truer to you."
      }</p>`;
    }
    return html;
  }
  function synthesis(s, r) {
    const topic = r.topic || (r.topic = detectTopic(r.question));
    const kind = questionKind(r.question);
    const answerCard = BY_ID[r.cards[s.positions.findIndex((p) => p.n === s.answer.pos)].id];
    const groups = s.story
      .map((g) => `<div class="story-group">${g.label ? `<h4>${esc(g.label)}</h4>` : ""}${g.pos.map((n) => storyLine(s, r, n, topic)).join("")}</div>`)
      .join("");
    const pats = patterns(r);
    return `<section class="synth" aria-labelledby="synth-title">
      <div class="eyebrow">Your reading</div>
      <h3 id="synth-title" class="synth-q">${r.question ? `“${esc(r.question)}”` : "A general reading"}</h3>
      <div class="synth-topic"><span>Reading this as</span>
        <div class="chips" role="group" aria-label="Question topic">${Object.entries(TOPICS)
          .map(([k, v]) => `<button class="chip" data-action="topic" data-topic="${k}" aria-pressed="${k === topic}">${v}</button>`)
          .join("")}</div>
        ${r.question ? "" : `<span class="muted">No question was asked, so this reads your situation in general.</span>`}
      </div>
      <div class="synth-body">
        <div class="synth-story">${groups}${arcLine(s, r)}</div>
        <aside class="synth-answer"><div class="eyebrow">The answer</div>${answerBlock(s, r, topic, kind)}
          <p class="synth-reflect">${esc(answerCard.reflection)}</p></aside>
      </div>
      ${pats.length ? `<div class="synth-patterns"><h4>Patterns across the spread</h4><ul>${pats.map((l) => `<li>${l}</li>`).join("")}</ul></div>` : ""}
      <p class="how-built">How this is built: each line joins the position’s job, the card’s first three keywords and its ${topic === "general" ? "core meaning" : TOPICS[topic].toLowerCase() + " note"}. Reversed cards show the upright message held back. The light, mixed or heavy tone of each card is a rule of thumb; your own reaction to the picture counts for more.</p>
    </section>`;
  }

  /* ----- Basics ----- */
  const NUMBERS = [
    ["Ace", "Beginnings — the pure seed of the suit’s energy."],
    ["Two", "Balance, partnership or a choice between two things."],
    ["Three", "Growth, collaboration, first results."],
    ["Four", "Stability and structure — sometimes stagnation."],
    ["Five", "Conflict, loss or disruption that forces change."],
    ["Six", "Harmony restored, generosity, moving on."],
    ["Seven", "Reflection, testing, assessing your position."],
    ["Eight", "Movement, effort and mastery — or feeling trapped."],
    ["Nine", "Near completion; the suit at its most intense."],
    ["Ten", "Completion — an ending that leads to a new cycle."],
  ];
  function viewBasics() {
    const majors = CARDS.filter((c) => c.arcana === "major");
    return `<div class="wrap"><div class="section">
      <div class="eyebrow">Foundations</div><h2 class="page-title">The Basics</h2>
      <div class="prose basics-lede">
        <p>A tarot deck has <b>78 cards</b>. It began in 15th-century Italy as a card game called <i>tarocchi</i>; the cards were only linked to the occult in 18th-century France, and the modern reading tradition grew from the Rider–Waite–Smith deck of 1909. Today most readers use tarot as a tool for reflection — a set of pictures that help you see a situation from new angles — rather than as fortune-telling.</p>
      </div>

      <div class="block"><h3>The Major Arcana — 22 cards</h3>
        <div class="prose"><p>The trumps, numbered 0 to 21. Readers often see them as <b>the Fool’s Journey</b>: the Fool (0) sets out, meets teachers and powers (Magician to Hierophant), faces choices and tests (Lovers to Death), descends into shadow and illumination (Temperance to Moon), and arrives at rebirth and wholeness (Sun to World). When a Major appears in a reading, it signals a significant theme.</p></div>
        <div class="journey">${majors.map((c) => `<a href="#/card/${c.id}">${cardArt(c)}${toRoman(c.number)} · ${esc(c.name.replace(/^The /, ""))}</a>`).join("")}</div>
      </div>

      <div class="block"><h3>The Minor Arcana — four suits of 14</h3>
        <div class="prose"><p>The 56 minors describe everyday life. Each suit belongs to a classical element, and once you know the suit and the number you can work out the rough meaning of most cards — even ones you have never studied.</p></div>
        <div class="suit-row">${["wands", "cups", "swords", "pentacles"].map(
          (s) => `<div class="suit-block" data-suit="${s}"><div class="suit-el">${SUITS[s].element}</div><h3>${SUITS[s].label}</h3><p>${SUITS[s].theme}</p></div>`
        ).join("")}</div>
      </div>

      <div class="block"><h3>The numbers</h3>
        <div class="prose"><p>Ace to Ten tell a story within each suit. Combine the number with the suit’s element: <i>Five</i> (conflict) + <i>Cups</i> (emotion) = grief and disappointment, the Five of Cups.</p></div>
        <div class="numbers">${NUMBERS.map(([n, m], i) => `<div class="number"><b>${toRoman(i + 1)}</b><strong>${n}</strong><span>${m}</span></div>`).join("")}</div>
      </div>

      <div class="block"><h3>The court cards</h3>
        <div class="numbers courts">
          <div class="number"><b>Page</b><span>The student and messenger. Curiosity, news, a fresh start in the suit.</span></div>
          <div class="number"><b>Knight</b><span>Action and pursuit. Moves fast — sometimes too far.</span></div>
          <div class="number"><b>Queen</b><span>Inner mastery. Embodies the suit with care and understanding.</span></div>
          <div class="number"><b>King</b><span>Outer mastery. Leads and directs the suit’s energy in the world.</span></div>
        </div>
        <div class="prose"><p>Court cards can describe another person, a side of your own personality, or an approach the situation calls for.</p></div>
      </div>

      <div class="block"><h3>Reversed cards</h3>
        <div class="prose"><p>A card that lands upside down is <i>reversed</i>. Common ways to read it: the energy is <b>blocked or delayed</b>, it is <b>turned inward</b> and private, or it is <b>in excess or lacking</b>. Reversals are optional — many readers skip them, and you can switch them off when you draw.</p></div>
      </div>

      <div class="block"><h3>How to do a reading</h3>
        <div class="prose"><ol class="tips">
          <li><b>Ask an open question.</b> “What should I understand about…” works better than “Will I…?”</li>
          <li><b>Choose a spread</b> that fits the question — three cards is plenty to start.</li>
          <li><b>Shuffle and lay the cards out</b> in position order.</li>
          <li><b>Look before you read.</b> What catches your eye in each picture? How do you feel?</li>
          <li><b>Read each card in its position,</b> then tell the story they make together.</li>
          <li><b>Write it down</b> and look back in a week. This is how meanings become your own.</li>
        </ol>
        <p style="margin-top:20px"><a class="btn primary" href="#/spread/three-card">Try a three-card reading</a></p></div>
      </div>
    </div></div>`;
  }

  function viewNotFound() {
    return `<div class="wrap section"><h2>Lost in the cards</h2><p class="muted">That page doesn’t exist.</p><a class="btn" href="#/">Go home</a></div>`;
  }

  /* ----- My decks (your own copies, stored only in this browser) ----- */
  const DS = window.ArcanaDeckStore;
  const RWS_SUITS = { wands: "Wands", cups: "Cups", swords: "Swords", pentacles: "Pentacles" };
  function customDeckFrom(meta) {
    return {
      id: meta.id, name: meta.name, year: "Your deck", artist: meta.credit || "Your own copy", place: "In this browser",
      ratio: meta.ratio || 0.575, suitNames: RWS_SUITS, lost: [], custom: true, meta,
      blurb: "Your own deck, kept only in this browser.", history: "", source: meta.credit || "",
    };
  }
  async function loadCustomDecks() {
    if (!DS) return (storeError = "Deck storage did not load.");
    try {
      for (const m of await DS.listDecks()) {
        const imgs = await DS.loadImages(m.id);
        customArt[m.id] = Object.fromEntries(Object.entries(imgs).map(([k, b]) => [k, URL.createObjectURL(b)]));
        customDecks.push(customDeckFrom(m));
      }
    } catch (e) {
      storeError = e.message || String(e);
    }
  }
  const median = (a) => {
    const v = a.slice().sort((x, y) => x - y);
    return v.length ? v[Math.floor(v.length / 2)] : 0.575;
  };
  async function storeImages(x, entries) {
    // entries: [cardId, blob, ratio][]
    await DS.putImages(x.id, entries.map(([id, b]) => [id, b]));
    const art = (customArt[x.id] ||= {});
    x.meta.ratios ||= {};
    entries.forEach(([id, b, r]) => {
      if (art[id]) URL.revokeObjectURL(art[id]);
      art[id] = URL.createObjectURL(b);
      x.meta.ratios[id] = r;
    });
    x.ratio = x.meta.ratio = median(Object.values(x.meta.ratios));
    await DS.saveDeck(x.meta);
  }

  const pending = { deckId: null, items: [], selected: null, status: "" }; // photos that didn't match a card yet
  let uidSeq = 0;
  function clearPending(deckId = null) {
    pending.items.forEach((it) => URL.revokeObjectURL(it.url));
    Object.assign(pending, { deckId, items: [], selected: null, status: "" });
  }
  const setStatus = (msg) => {
    pending.status = msg;
    const el = $("#drop-status");
    if (el) el.textContent = msg;
  };

  function viewMyDecks() {
    const list = customDecks
      .map((x) => {
        const n = Object.keys(customArt[x.id] || {}).length;
        const on = x.id === state.deck;
        return `<div class="my-deck">
          <img src="${deckThumb(x)}" alt="">
          <div class="my-deck-body"><h3>${esc(x.name)}</h3><p>${n} of 78 cards${x.meta.credit ? ` · © ${esc(x.meta.credit)}` : ""}</p></div>
          <div class="my-deck-actions">
            <button class="btn small${on ? " primary" : ""}" data-action="set-deck" data-deck="${x.id}" ${on ? "disabled" : ""}>${on ? "In use" : "Use"}</button>
            <a class="btn small" href="#/my-decks/${x.id}">Edit cards</a>
          </div></div>`;
      })
      .join("");
    return `<div class="wrap"><div class="section">
      <div class="section-head"><div><div class="eyebrow">Your own copies</div><h2 class="page-title">My decks</h2></div>
        <p>Add photos or scans of decks you own. They stay in this browser only: nothing is uploaded, and clearing this site’s data deletes them. Keep them off any public copy of the site.</p></div>
      ${storeError ? `<p class="form-error" role="alert">${esc(storeError)}</p>` : ""}
      <form class="new-deck" id="new-deck-form">
        <h3>New deck</h3>
        <label><span>Deck name</span><input name="name" required maxlength="60" placeholder="e.g. The Wild Unknown" autocomplete="off"></label>
        <label><span>Artist or publisher, for credit</span><input name="credit" maxlength="120" placeholder="e.g. Kim Krans" autocomplete="off"></label>
        <button class="btn primary" type="submit" ${storeError ? "disabled" : ""}>Create deck</button>
      </form>
      <div class="my-decks">${list || `<p class="muted">No decks yet. Create one, then add its cards.</p>`}</div>
    </div></div>`;
  }

  function viewDeckEditor(id) {
    const x = customDecks.find((d) => d.id === id);
    if (!x) return viewNotFound();
    if (pending.deckId !== id) clearPending(id);
    const n = Object.keys(customArt[id] || {}).length;
    const on = state.deck === id;
    return `<div class="wrap editor">
      <div class="crumbs"><a href="#/my-decks">← My decks</a><span class="tag" id="deck-count">${n} of 78 cards</span></div>
      <div class="editor-head">
        <div class="editor-fields">
          <label><span>Deck name</span><input data-field="name" value="${esc(x.meta.name)}" maxlength="60" required></label>
          <label><span>Artist or publisher, for credit</span><input data-field="credit" value="${esc(x.meta.credit || "")}" maxlength="120"></label>
        </div>
        <div class="editor-actions">
          <button class="btn primary" data-action="set-deck" data-deck="${id}" ${on ? "disabled" : ""}>${on ? "In use" : "Use this deck"}</button>
          <button class="btn" data-action="delete-deck" data-deck="${id}">Delete deck</button>
        </div>
      </div>
      <label class="dropzone" id="dropzone">
        <input type="file" id="deck-files" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple class="visually-hidden">
        <b>Drop photos here, or click to choose files</b>
        <span>Files named like “ace-of-cups.jpg”, “The Star.png” or “major-17.jpg” go to the right card automatically. Anything else waits below for you to place. JPG, PNG or WebP; iPhone HEIC photos need converting first.</span>
        <span class="drop-status" id="drop-status" aria-live="polite">${esc(pending.status)}</span>
      </label>
      <div id="unmatched">${unmatchedHtml()}</div>
      <div class="slots${pending.selected ? " placing" : ""}" id="slots">${SUIT_ORDER.map(
        (st) => `<div class="slot-group"><h3>${SUITS[st].label}</h3><div class="slot-grid">${CARDS.filter((c) => suitOf(c) === st)
          .map((c) => slotHtml(x, c))
          .join("")}</div></div>`
      ).join("")}</div>
    </div>`;
  }
  function slotHtml(x, c) {
    const src = customArt[x.id]?.[c.id];
    return `<div class="slot-card${src ? " filled" : ""}">
      <button class="slot-btn" data-action="slot" data-card="${c.id}" style="--ratio:${x.ratio}" aria-label="${src ? "Replace" : "Add"} ${esc(c.name)}">${
        src ? `<img src="${src}" alt="" loading="lazy">` : `<span aria-hidden="true">+</span>`
      }</button>
      <div class="slot-cap"><span>${esc(c.name)}</span>${src ? `<button class="link-btn" data-action="slot-remove" data-card="${c.id}" aria-label="Remove ${esc(c.name)}">Remove</button>` : ""}</div>
    </div>`;
  }
  function unmatchedHtml() {
    if (!pending.items.length) return "";
    const k = pending.items.length;
    return `<section class="unmatched" aria-label="Photos to place">
      <div class="unmatched-head">
        <div><h3>${k} photo${k > 1 ? "s" : ""} to place</h3>
          <p class="muted">${pending.selected ? "Now click the card slot this photo belongs to." : "Select a photo, then click its card slot. Or fill the empty slots in deck order: Major Arcana 0–21, then Wands, Cups, Swords and Pentacles from Ace to King."}</p></div>
        <div class="hero-actions"><button class="btn small primary" data-action="fill-order">Fill empty slots in order</button><button class="btn small" data-action="clear-unmatched">Discard</button></div>
      </div>
      <div class="unmatched-row">${pending.items
        .map((it) => `<button class="um-item" data-action="pick-unmatched" data-uid="${it.uid}" aria-pressed="${pending.selected === it.uid}" title="${esc(it.name)}"><img src="${it.url}" alt="${esc(it.name)}"></button>`)
        .join("")}</div>
    </section>`;
  }
  function refreshEditor() {
    const x = customDecks.find((d) => d.id === parse().id);
    if (!x || parse().name !== "my-decks") return;
    $("#unmatched").innerHTML = unmatchedHtml();
    const slots = $("#slots");
    slots.classList.toggle("placing", !!pending.selected);
    slots.innerHTML = SUIT_ORDER.map(
      (st) => `<div class="slot-group"><h3>${SUITS[st].label}</h3><div class="slot-grid">${CARDS.filter((c) => suitOf(c) === st)
        .map((c) => slotHtml(x, c))
        .join("")}</div></div>`
    ).join("");
    $("#deck-count").textContent = `${Object.keys(customArt[x.id] || {}).length} of 78 cards`;
    renderDeckPicker();
  }
  async function importFiles(files) {
    const x = customDecks.find((d) => d.id === parse().id);
    if (!x) return;
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f.name));
    if (!list.length) return setStatus("No image files found in that selection.");
    const matched = [];
    const errors = [];
    let waiting = 0;
    for (let k = 0; k < list.length; k++) {
      setStatus(`Processing ${k + 1} of ${list.length}…`);
      const f = list[k];
      try {
        const { blob, ratio } = await DS.shrink(f);
        const id = DS.match(f.name);
        if (id && BY_ID[id]) matched.push([id, blob, ratio]);
        else {
          pending.items.push({ uid: ++uidSeq, name: f.name, blob, ratio, url: URL.createObjectURL(blob) });
          waiting++;
        }
      } catch (e) {
        errors.push(e.message);
      }
    }
    try {
      if (matched.length) await storeImages(x, matched);
    } catch (e) {
      errors.push("Saving failed: " + (e.message || e) + " (the browser may be out of storage space).");
    }
    setStatus(
      `${matched.length} placed automatically${waiting ? `, ${waiting} waiting below` : ""}.` +
        (errors.length ? ` ${errors.length} problem${errors.length > 1 ? "s" : ""}: ${errors.slice(0, 2).join(" ")}` : "")
    );
    refreshEditor();
  }
  async function placePending(x, pairs) {
    // pairs: [cardId, item][]
    await storeImages(x, pairs.map(([id, it]) => [id, it.blob, it.ratio]));
    const used = new Set(pairs.map(([, it]) => it.uid));
    pending.items.filter((it) => used.has(it.uid)).forEach((it) => URL.revokeObjectURL(it.url));
    pending.items = pending.items.filter((it) => !used.has(it.uid));
    pending.selected = null;
  }
  function pickSingle(x, cardId) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
    inp.addEventListener("change", async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const { blob, ratio } = await DS.shrink(f);
        await storeImages(x, [[cardId, blob, ratio]]);
        setStatus(`${BY_ID[cardId].name} added.`);
      } catch (e) {
        setStatus(e.message || String(e));
      }
      refreshEditor();
    });
    inp.click();
  }
  async function editorAction(a, t) {
    const x = customDecks.find((d) => d.id === parse().id);
    if (!x) return;
    try {
      if (a === "slot") {
        const cardId = t.dataset.card;
        const it = pending.items.find((i) => i.uid === pending.selected);
        if (it) {
          await placePending(x, [[cardId, it]]);
          setStatus(`${BY_ID[cardId].name} placed.`);
        } else return pickSingle(x, cardId);
      } else if (a === "slot-remove") {
        await DS.deleteImage(x.id, t.dataset.card);
        URL.revokeObjectURL(customArt[x.id][t.dataset.card]);
        delete customArt[x.id][t.dataset.card];
        if (x.meta.ratios) delete x.meta.ratios[t.dataset.card];
        await DS.saveDeck(x.meta);
      } else if (a === "pick-unmatched") {
        const uid = +t.dataset.uid;
        pending.selected = pending.selected === uid ? null : uid;
      } else if (a === "clear-unmatched") {
        clearPending(x.id);
      } else if (a === "fill-order") {
        const empty = CARDS.filter((c) => !customArt[x.id]?.[c.id]);
        const pairs = pending.items.slice(0, empty.length).map((it, k) => [empty[k].id, it]);
        await placePending(x, pairs);
        setStatus(`${pairs.length} placed in deck order${pending.items.length ? `; ${pending.items.length} left over (no empty slots)` : ""}. Check them, then move any that landed in the wrong place.`);
      }
    } catch (e) {
      setStatus(e.message || String(e));
    }
    refreshEditor();
  }
  async function deleteDeck(id) {
    const x = customDecks.find((d) => d.id === id);
    const n = Object.keys(customArt[id] || {}).length;
    if (!x || !confirm(`Delete “${x.name}” and its ${n} card image${n === 1 ? "" : "s"} from this browser? This can’t be undone.`)) return;
    await DS.deleteDeck(id);
    Object.values(customArt[id] || {}).forEach((u) => URL.revokeObjectURL(u));
    delete customArt[id];
    customDecks.splice(customDecks.indexOf(x), 1);
    clearPending();
    if (state.deck === id) {
      state.deck = BUILTIN[0].id;
      store.set("deck", state.deck);
      applyTheme();
    }
    renderDeckPicker();
    location.hash = "#/my-decks";
  }

  /* ---------------- Router ---------------- */
  let currentKey = "";
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const parts = h.split("/").filter(Boolean);
    return { name: parts[0] || "home", id: parts[1] };
  }
  function render({ keepScroll = false } = {}) {
    const r = parse();
    const key = r.name + "/" + (r.id || "");
    const views = {
      home: viewHome, cards: viewLibrary, card: () => viewCard(r.id), spreads: viewSpreads, spread: () => viewReading(r.id), basics: viewBasics,
      "my-decks": () => (r.id ? viewDeckEditor(r.id) : viewMyDecks()),
    };
    const app = $("#app");
    app.innerHTML = `<div class="view">${(views[r.name] || viewNotFound)()}</div>`;
    if (keepScroll) app.firstElementChild.classList.remove("view");
    $$(".nav a").forEach((a) => {
      const n = a.dataset.nav;
      a.classList.toggle("active", n === r.name || (n === "cards" && r.name === "card") || (n === "spreads" && r.name === "spread"));
    });
    if (r.name === "spread") {
      renderBoard();
      bindSpy();
    }
    const titles = { home: "", cards: "The Cards", card: BY_ID[r.id]?.name, spreads: "Spreads", spread: SPREADS.find((s) => s.id === r.id)?.name, basics: "The Basics", "my-decks": r.id ? customDecks.find((x) => x.id === r.id)?.name : "My decks" };
    document.title = (titles[r.name] ? titles[r.name] + " · " : "") + "Arcana — a tarot study room";
    if (!keepScroll && key !== currentKey) window.scrollTo({ top: 0, behavior: "instant" });
    currentKey = key;
  }

  /* ---------------- Events ---------------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    const menu = $("#deck-menu");
    if (menu && !e.target.closest("#deck-picker")) closeMenu();
    if (e.target.closest("#deck-btn")) {
      const open = !menu.classList.contains("open");
      menu.classList.toggle("open", open);
      $("#deck-btn").setAttribute("aria-expanded", open);
      return;
    }
    if (e.target.id === "lightbox") {
      e.target.close();
      return;
    }
    if (!t) return;
    const a = t.dataset.action;
    if (a === "set-deck") {
      closeMenu();
      setDeck(t.dataset.deck);
    } else if (a === "filter") {
      state.filter = t.dataset.filter;
      $$(".chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.filter === state.filter));
      $("#grid").innerHTML = libraryGrid();
    } else if (a === "face") {
      state.detailFace = t.dataset.face;
      const c = BY_ID[parse().id];
      $("#meaning").innerHTML = meaningBlock(c, state.detailFace);
      $(".detail-art .tcard")?.classList.toggle("reversed", state.detailFace === "reversed");
      $$('.art-controls [data-action="face"]').forEach((b) => b.setAttribute("aria-selected", b.dataset.face === state.detailFace));
    } else if (a === "draw-daily") {
      if (state.daily) return;
      const id = state.nextDaily || CARDS[rand(CARDS.length)].id;
      state.daily = { id, reversed: state.reversals && rand(4) === 0 };
      state.nextDaily = null;
      const c = BY_ID[id];
      const flip = $("#hero-flip");
      if (flip) {
        flip.querySelector(".front .tcard")?.classList.toggle("reversed", state.daily.reversed);
        flip.classList.add("revealed");
        flip.dataset.action = "study-daily";
        flip.setAttribute("aria-label", `Study ${c.name}`);
      }
      const panel = $("#daily-panel");
      if (panel) {
        panel.classList.add("swap");
        setTimeout(() => {
          panel.innerHTML = dailyPanel();
          panel.classList.remove("swap");
          if (t !== flip) panel.querySelector(".daily-name")?.focus();
        }, 200);
      }
    } else if (a === "study-daily") {
      if (state.daily) location.hash = "#/card/" + state.daily.id;
    } else if (a === "reset-daily") {
      state.daily = null;
      state.nextDaily = CARDS[rand(CARDS.length)].id;
      $("#daily-card").innerHTML = dailyCard();
      $("#daily-panel").innerHTML = dailyPanel();
      $("#hero-flip")?.focus();
    } else if (a === "lib-view") {
      state.libView = t.dataset.view === "large" ? "large" : "compact";
      store.set("libView", state.libView);
      $("#grid")?.classList.toggle("large", state.libView === "large");
      $$('[data-action="lib-view"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.libView));
    } else if (a === "zoom") {
      openLightbox(t);
    } else if (a === "close-lightbox") {
      $("#lightbox")?.close();
    } else if (["slot", "slot-remove", "pick-unmatched", "clear-unmatched", "fill-order"].includes(a)) {
      editorAction(a, t);
    } else if (a === "delete-deck") {
      deleteDeck(t.dataset.deck);
    } else if (a === "topic") {
      const id = parse().id;
      const r = state.readings[id];
      if (!r) return;
      r.topic = t.dataset.topic in TOPICS ? t.dataset.topic : "general";
      $("#interp").innerHTML = interpretation(SPREADS.find((x) => x.id === id), r);
      bindSpy();
    } else if (a === "deal") {
      const s = SPREADS.find((x) => x.id === parse().id);
      const picks = shuffled(CARDS).slice(0, s.count).map((c) => ({ id: c.id, reversed: state.reversals && rand(3) === 0 }));
      state.readings[s.id] = { cards: picks, revealed: picks.map(() => false), question: ($("#question")?.value || "").trim() };
      refreshReading(true);
    } else if (a === "new-reading") {
      delete state.readings[parse().id];
      refreshReading();
    } else if (a === "reveal-all") {
      const r = state.readings[parse().id];
      revealingAll = true;
      r.revealed.forEach((_, i) => setTimeout(() => reveal(i), i * 160));
    } else if (a === "flip") {
      const i = +t.dataset.i;
      reveal(i);
      showItem(i);
    }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "new-deck-form") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get("name") || "").trim();
    if (!name) return;
    const meta = { id: "mine-" + Date.now().toString(36), name, credit: String(f.get("credit") || "").trim(), ratio: 0.575, ratios: {}, created: Date.now() };
    try {
      await DS.saveDeck(meta);
    } catch (err) {
      storeError = err.message || String(err);
      return render({ keepScroll: true });
    }
    customDecks.push(customDeckFrom(meta));
    customArt[meta.id] = {};
    renderDeckPicker();
    location.hash = "#/my-decks/" + meta.id;
  });
  const onEditor = () => parse().name === "my-decks" && !!parse().id;
  document.addEventListener("dragover", (e) => {
    if (!onEditor()) return;
    e.preventDefault(); // stop the browser opening a mis-dropped photo
    $("#dropzone")?.classList.toggle("over", !!e.target.closest?.("#dropzone"));
  });
  document.addEventListener("dragleave", (e) => {
    if (e.target.id === "dropzone") e.target.classList.remove("over");
  });
  document.addEventListener("drop", (e) => {
    if (!onEditor()) return;
    e.preventDefault();
    $("#dropzone")?.classList.remove("over");
    if (e.target.closest?.("#dropzone") && e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id === "deck-files") {
      await importFiles(e.target.files);
      e.target.value = "";
      return;
    }
    if (e.target.matches("[data-field]") && onEditor()) {
      const x = customDecks.find((d) => d.id === parse().id);
      const v = e.target.value.trim();
      if (!x || (e.target.dataset.field === "name" && !v)) return;
      x.meta[e.target.dataset.field] = v;
      x.name = x.meta.name;
      x.artist = x.meta.credit || "Your own copy";
      try {
        await DS.saveDeck(x.meta);
        setStatus("Saved.");
      } catch (err) {
        setStatus(err.message || String(err));
      }
      renderDeckPicker();
      return;
    }
    if (e.target.matches('[data-action="toggle-reversals"]')) {
      state.reversals = e.target.checked;
      store.set("reversals", state.reversals);
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "search") {
      state.query = e.target.value;
      $("#grid").innerHTML = libraryGrid();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
    if ($("#lightbox")?.open) return;
    if (parse().name !== "card" || e.target.matches("input, textarea")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const i = CARDS.findIndex((c) => c.id === parse().id);
      const j = (i + (e.key === "ArrowRight" ? 1 : -1) + CARDS.length) % CARDS.length;
      location.hash = "#/card/" + CARDS[j].id;
    }
  });
  function openLightbox(trigger) {
    const lb = $("#lightbox");
    const c = BY_ID[parse().id];
    if (!lb || !c || typeof lb.showModal !== "function") return;
    const d = deck();
    const rev = state.detailFace === "reversed";
    lb.innerHTML = `<div class="lb-inner">
        <img src="${artSrc(d, c.id)}" alt="${esc(c.name)}${rev ? " (reversed)" : ""}, ${esc(d.name)} deck"${rev ? ' class="rev"' : ""}>
        <div class="lb-bar"><span class="lb-title">${esc(c.name)} · ${esc(d.name)}</span>
          <button class="btn small" data-action="close-lightbox">Close</button></div>
      </div>`;
    lb.returnTo = trigger;
    lb.showModal();
    lb.querySelector('[data-action="close-lightbox"]')?.focus();
  }
  function closeMenu() {
    const m = $("#deck-menu");
    if (m?.classList.contains("open")) {
      m.classList.remove("open");
      $("#deck-btn")?.setAttribute("aria-expanded", "false");
    }
  }
  function refreshReading(animate = false) {
    const id = parse().id;
    const s = SPREADS.find((x) => x.id === id);
    $("#reading-controls").innerHTML = readingControls(s, state.readings[id]);
    renderBoard({ animate });
    $("#interp").innerHTML = interpretation(s, state.readings[id]);
    bindSpy();
  }
  function reveal(i) {
    const id = parse().id;
    const r = state.readings[id];
    if (!r || r.revealed[i]) return;
    r.revealed[i] = true;
    const btn = $(`.flip[data-i="${i}"]`);
    btn?.classList.add("revealed");
    $$(".slot-pos").forEach((el) => el.classList.toggle("active", el.dataset.i === String(i)));
    const s = SPREADS.find((x) => x.id === id);
    $("#reading-controls").innerHTML = readingControls(s, r);
    $("#interp").innerHTML = interpretation(s, r);
    setActive(i);
    bindSpy();
    if (r.revealed.every(Boolean) && revealingAll) {
      revealingAll = false;
      const synth = $(".synth");
      if (synth && getComputedStyle($("#reading-stage")).position === "sticky") synth.scrollIntoView({ behavior: motion(), block: "start" });
    }
  }

  /* Board ↔ text: highlight the card whose text is in view; clicking a card brings its text into view. */
  let revealingAll = false;
  const motion = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  function setActive(i) {
    $$(".slot-pos").forEach((el) => el.classList.toggle("active", el.dataset.i === String(i)));
    $$(".interp-item").forEach((el) => el.classList.toggle("active", el.dataset.pos === String(i)));
  }
  function showItem(i) {
    const el = $(`.interp-item[data-pos="${i}"]`);
    if (!el) return;
    setActive(i);
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight) el.scrollIntoView({ behavior: motion(), block: "center" });
  }
  let spy;
  function bindSpy() {
    spy?.disconnect();
    if (!("IntersectionObserver" in window)) return;
    spy = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.dataset.pos);
      },
      { rootMargin: "-40% 0px -50% 0px" }
    );
    $$(".interp-item").forEach((el) => spy.observe(el));
  }
  document.addEventListener("mouseover", (e) => {
    const it = e.target.closest?.(".interp-item, .story-line");
    if (it) setActive(it.dataset.pos);
  });

  window.addEventListener("hashchange", () => {
    state.detailFace = "upright";
    render();
  });
  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => parse().name === "spread" && renderBoard(), 120);
  });

  $("#lightbox")?.addEventListener("close", (e) => {
    const back = e.target.returnTo;
    e.target.innerHTML = "";
    if (back && back.isConnected) back.focus();
    else $(".art-zoom")?.focus();
  });

  (async () => {
    await loadCustomDecks();
    if (!allDecks().some((d) => d.id === state.deck)) state.deck = BUILTIN[0].id;
    applyTheme();
    renderDeckPicker();
    render();
  })();
})();
