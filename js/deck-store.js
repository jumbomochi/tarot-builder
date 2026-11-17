/* Your own decks: stored only in this browser (IndexedDB), never uploaded.
   Exposes window.ArcanaDeckStore: storage, image shrinking and filename → card matching. */
window.ArcanaDeckStore = (() => {
  "use strict";
  const DB_NAME = "arcana";
  const DB_VERSION = 1;
  let dbPromise;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error("This browser cannot store decks (IndexedDB is unavailable)."));
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("decks")) d.createObjectStore("decks", { keyPath: "id" });
          if (!d.objectStoreNames.contains("images")) d.createObjectStore("images"); // key: "<deckId>/<cardId>"
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  const done = (req) => new Promise((res, rej) => ((req.onsuccess = () => res(req.result)), (req.onerror = () => rej(req.error))));
  const finished = (tx) => new Promise((res, rej) => ((tx.oncomplete = () => res()), (tx.onerror = tx.onabort = () => rej(tx.error))));
  const range = (deckId) => IDBKeyRange.bound(deckId + "/", deckId + "/￿");

  async function listDecks() {
    const tx = (await db()).transaction("decks");
    const all = await done(tx.objectStore("decks").getAll());
    return all.sort((a, b) => a.created - b.created);
  }
  async function saveDeck(meta) {
    const tx = (await db()).transaction("decks", "readwrite");
    tx.objectStore("decks").put(meta);
    return finished(tx);
  }
  /* -> { cardId: Blob } */
  async function loadImages(deckId) {
    const tx = (await db()).transaction("images");
    const out = {};
    await new Promise((res, rej) => {
      const req = tx.objectStore("images").openCursor(range(deckId));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return res();
        out[String(cur.key).slice(deckId.length + 1)] = cur.value;
        cur.continue();
      };
      req.onerror = () => rej(req.error);
    });
    return out;
  }
  async function putImages(deckId, entries) {
    const tx = (await db()).transaction("images", "readwrite");
    const st = tx.objectStore("images");
    entries.forEach(([cardId, blob]) => st.put(blob, deckId + "/" + cardId));
    return finished(tx);
  }
  async function deleteImage(deckId, cardId) {
    const tx = (await db()).transaction("images", "readwrite");
    tx.objectStore("images").delete(deckId + "/" + cardId);
    return finished(tx);
  }
  async function deleteDeck(deckId) {
    const tx = (await db()).transaction(["decks", "images"], "readwrite");
    tx.objectStore("decks").delete(deckId);
    tx.objectStore("images").delete(range(deckId));
    return finished(tx);
  }

  /* Shrink a photo to at most 640px wide (keeps storage near 80 KB a card). -> { blob, ratio } */
  async function shrink(file, maxW = 640) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      throw new Error(`${file.name}: this browser can't read that image format. Use JPG, PNG or WebP.`);
    }
    const scale = Math.min(1, maxW / src.width);
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(src, 0, 0, w, h);
    src.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    if (!blob) throw new Error(`${file.name}: could not process this image.`);
    return { blob, ratio: w / h };
  }

  /* ---------- Filename → card id ---------- */
  const MAJOR_NAMES = [
    ["fool", "le mat", "mat"],
    ["magician", "magus", "bateleur", "juggler"],
    ["high priestess", "priestess", "papesse", "popess"],
    ["empress", "imperatrice"],
    ["emperor", "empereur"],
    ["hierophant", "pope", "pape"],
    ["lovers", "lover", "amoureux"],
    ["chariot"],
    ["strength", "force", "lust", "fortitude"],
    ["hermit", "ermite"],
    ["wheel of fortune", "wheel", "fortune"],
    ["justice", "adjustment"],
    ["hanged man", "hanged", "pendu"],
    ["death", "mort"],
    ["temperance", "art"],
    ["devil", "diable"],
    ["tower", "maison dieu"],
    ["star", "etoile"],
    ["moon", "lune"],
    ["sun", "soleil"],
    ["judgement", "judgment", "aeon", "jugement"],
    ["world", "universe", "monde"],
  ];
  const SUIT_WORDS = {
    wands: ["wands", "wand", "rods", "rod", "staves", "staffs", "staff", "batons", "baton", "clubs", "sticks"],
    cups: ["cups", "cup", "chalices", "chalice", "coupes", "coupe", "goblets"],
    swords: ["swords", "sword", "blades", "epees", "epee"],
    pentacles: ["pentacles", "pentacle", "coins", "coin", "disks", "disk", "discs", "disc", "deniers", "denier", "stones"],
  };
  const RANK_WORDS = {
    1: ["ace", "one", "as"], 2: ["two"], 3: ["three"], 4: ["four"], 5: ["five"], 6: ["six"], 7: ["seven"], 8: ["eight"], 9: ["nine"], 10: ["ten"],
    11: ["page", "princess", "knave", "jack", "valet", "daughter"],
    12: ["knight", "prince", "cavalier", "chevalier", "son"],
    13: ["queen", "reine", "mother"],
    14: ["king", "roi", "father"],
  };
  const MAJOR_MARKERS = ["major", "majors", "maj", "ar", "m", "trump", "trumps", "key", "arcana"];
  const pad = (n) => String(n).padStart(2, "0");

  function tokens(name) {
    return name
      .replace(/\.[a-z0-9]+$/i, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }
  function match(filename) {
    const t = tokens(filename);
    const text = " " + t.join(" ") + " ";
    const nums = t.map((x) => (/^\d{1,2}$/.test(x) ? +x : null));
    const suit = Object.keys(SUIT_WORDS).find((s) => SUIT_WORDS[s].some((w) => t.includes(w)));
    if (suit) {
      let rank = +Object.keys(RANK_WORDS).find((r) => RANK_WORDS[r].some((w) => t.includes(w)));
      if (!rank) {
        const si = t.findIndex((x) => SUIT_WORDS[suit].includes(x));
        const near = [nums[si + 1], nums[si - 1], nums[si + 2], nums[si - 2]].find((n) => n >= 1 && n <= 14);
        rank = near || nums.find((n) => n >= 1 && n <= 14);
      }
      return rank ? `${suit}-${pad(rank)}` : null;
    }
    // longest matching name wins, so "high priestess" beats "priestess" and "wheel of fortune" beats "fortune"
    let best = null;
    MAJOR_NAMES.forEach((names, i) =>
      names.forEach((nm) => {
        if (text.includes(" " + nm + " ") && (!best || nm.length > best.len)) best = { i, len: nm.length };
      })
    );
    if (best) return `major-${pad(best.i)}`;
    const mi = t.findIndex((x) => MAJOR_MARKERS.includes(x));
    if (mi >= 0) {
      const n = [nums[mi + 1], nums[mi - 1]].find((v) => v != null && v <= 21);
      if (n != null) return `major-${pad(n)}`;
    }
    return null;
  }

  return { listDecks, saveDeck, loadImages, putImages, deleteImage, deleteDeck, shrink, match };
})();
