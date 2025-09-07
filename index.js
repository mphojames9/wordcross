/* ============================
   Global menu toggle (outside IIFE)
   ============================ */
"use strict";

const menuToggle = document.getElementById("menuToggle");
const settingsMenu = document.getElementById("settingsMenu");
if (menuToggle && settingsMenu) {
  menuToggle.addEventListener("click", () => {
    settingsMenu.classList.toggle("active");
  });
}

const menuToggleClose = document.getElementById("menuToggleClose");
if (menuToggleClose && settingsMenu) {
  menuToggleClose.addEventListener("click", () => {
    settingsMenu.classList.toggle("active");
  });
}

/* =====================================================================
   GAME IIFE
   ===================================================================== */
(() => {
  /* ===========================
     Data / Config
     =========================== */
  const defaultThemes = {
    Programming: [
      ["JAVASCRIPT", "HTML", "CSS", "CODE", "APP"],
      ["PYTHON", "REACT", "VUE", "NODE", "SQL"],
      ["ANDROID", "JAVA", "SWIFT", "KOTLIN", "MOBILE"],
    ],
    Animals: [
      ["DOG", "CAT", "LION", "TIGER", "HORSE"],
      ["MONKEY", "ZEBRA", "FROG", "SNAKE", "EAGLE"],
      ["DOLPHIN", "PANDA", "RABBIT", "CAMEL", "WHALE"],
    ],
    Countries: [
      ["FRANCE", "SPAIN", "CHINA", "INDIA", "EGYPT"],
      ["BRAZIL", "CANADA", "ITALY", "JAPAN", "KENYA"],
      ["MEXICO", "NORWAY", "TURKEY", "QATAR", "GHANA"],
    ],
    Science: [
      ["ATOM", "GENE", "CELL", "DNA", "ION"],
      ["NEURON", "GRAVITY", "ENERGY", "FORCE", "LASER"],
      ["QUANTUM", "ENTROPY", "ISOTOPE", "PLASMA", "GALAXY"],
    ],
    Food: [
      ["BREAD", "APPLE", "RICE", "SOUP", "PASTA"],
      ["BURGER", "SALAD", "SUSHI", "PIZZA", "STEAK"],
      ["AVOCADO", "CHEESE", "CHOCOLATE", "OMELETTE", "PANCAKE"],
    ]
  };


  // 🎨 Word highlight colors
  const highlightColors = ["#ff3939ff", "#0BA0E0", "#14F10D", "#030502", "#C00CE1", "#ff9d2dff"];
  let colorIndex = 0;
  const wordColors = {}; // store color per word

  function getWordColor(word) {
    if (!wordColors[word]) {
      wordColors[word] = highlightColors[colorIndex % highlightColors.length];
      colorIndex++;
    }
    return wordColors[word];
  }


  const DIRS = [
    [1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [-1, 0],
    [0, -1], // 8 directions
  ];

  const state = {
    themeKeys: Object.keys(defaultThemes),
    themeIndex: 0,
    level: 0,
    size: 10,
    wordsPerLevel: 5,
    grid: [],
    words: [],
    placed: {}, // word -> array of {r,c} cells
    score: 0,
    timeLeft: 60,
    timer: null,
    difficulty: "medium",
    selecting: false,
    selectedCells: [],
    usedHints: 0,
    powerups: { hint: 3, time: 3, auto: 2 },
    streak: 0, // 🔥 track win streak
    dailyMode: false,
    rngSeed: null,
    _paused: false,

    // Meta
    _wonLast: false,
    _starsLast: 0,
    _levelsCleared: 0,
    _timeAtWin: 0,

    // Autosave
    _autosaveId: null,
    _saveEveryMs: 15000, // 15s periodic background save
  };

  function animateCoinGain(amount) {
    const coinHUD = document.querySelector("#coins"); // your coin counter element
    if (!coinHUD) return;

    const rect = coinHUD.getBoundingClientRect();

    // Create floating text
    const float = document.createElement("div");
    float.textContent = `+${amount} 🪙`;
    Object.assign(float.style, {
      position: "fixed",
      left: rect.left + rect.width / 2 + "px",
      top: rect.top + "px",
      transform: "translate(-50%, 0)",
      color: "gold",
      fontSize: "20px",
      fontWeight: "bold",
      textShadow: "0 0 6px black",
      opacity: "1",
      transition: "all 1s ease-out",
      zIndex: "10000",
      pointerEvents: "none",
    });

    document.body.appendChild(float);

    // Trigger animation
    requestAnimationFrame(() => {
      float.style.top = rect.top - 40 + "px"; // move up
      float.style.opacity = "0"; // fade
    });

    // Remove after animation
    setTimeout(() => {
      float.remove();
    }, 1000);
  }

  /* ===========================
     Utilities
     =========================== */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const on = (sel, evt, fn, opts) => {
    const el = $(sel);
    if (el) el.addEventListener(evt, fn, opts);
  };

  function setGridSizeCSS(size) {
    const gridEl = $("#grid");
    if (!gridEl) return;
    gridEl.style.gridTemplateColumns = `repeat(${size}, var(--cell))`;
    gridEl.style.gridTemplateRows = `repeat(${size}, var(--cell))`;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
  function randint(n) {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(Math.random() * n);
  }

  // Deterministic RNG for daily mode (Mulberry32)
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededInt(rng, n) {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(rng() * n);
  }

  /* ===========================
     Storage (Progress, Leaderboard, Achievements)
     =========================== */
  const STORAGE_KEYS = {
    progress: "ws_progress",
    leaderboard: "ws_leaderboard",
    name: "ws_name",
    achievements: "ws_achv",
    version: "ws_version",
  };

  const POWERUP_MAX = { hint: 3, time: 3, auto: 2 };
  function refillPowerups() {
    let changed = false;
    for (const key of Object.keys(state.powerups)) {
      if (state.powerups[key] < POWERUP_MAX[key]) {
        state.powerups[key] = Math.min(state.powerups[key] + 1, POWERUP_MAX[key]);
        changed = true;
      }
    }
    if (changed) {
      updateHUD();
      STORAGE.saveProgress("powerup-refill");
      toast("✨ Power-ups refilled!");
    }
  }

  const STORAGE = {
    saveProgress(reason = "manual") {
      const payload = {
        _v: 2, // versioning for future migrations
        themeIndex: state.themeIndex,
        level: state.level,
        size: state.size,
        wordsPerLevel: state.wordsPerLevel,
        score: state.score,
        difficulty: state.difficulty,
        powerups: state.powerups,
        usedHints: state.usedHints,
        dailyMode: state.dailyMode,
        rngSeed: state.rngSeed,
        // UX helpers
        savedAt: new Date().toISOString(),
        reason,
        // persist last refill timestamp if present
        lastRefill: state._lastRefill || null,
        coins: state.coins ?? 0,
      };
      try {
        localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(payload));
        localStorage.setItem("coins", String(state.coins ?? 0));
        if (reason === "level-complete" || reason === "manual") {
        }
      } catch (e) {
        console.error("Failed saving progress:", e);
        toast("Could not save progress (storage full?)");
      }
    },

    // Returns true if loaded, false otherwise
    loadProgress() {
      const raw = localStorage.getItem(STORAGE_KEYS.progress);
      if (!raw) return false;
      try {
        const p = JSON.parse(raw);
        if (typeof p !== "object" || p === null) return false;
        if (!Number.isInteger(p.themeIndex)) return false;
        if (!Number.isInteger(p.level)) return false;
        if (typeof state.streak === "undefined") state.streak = 0;
        state.themeIndex = clamp(p.themeIndex, 0, state.themeKeys.length - 1);
        state.level = Math.max(0, p.level);
        state.size = clamp(p.size ?? state.size, 8, 20);
        state.wordsPerLevel = clamp(p.wordsPerLevel ?? state.wordsPerLevel, 4, 12);
        state.score = Math.max(0, p.score ?? 0);
        state.difficulty = p.difficulty ?? "medium";
        state.powerups = p.powerups ?? { hint: 3, time: 3, auto: 2 };
        state.usedHints = p.usedHints ?? 0;
        state.dailyMode = !!p.dailyMode;
        state.rngSeed = p.rngSeed ?? null;
        state._lastRefill = p.lastRefill || state._lastRefill || Date.now();

        // ✅ Sync coins from ws_coins or fallback to progress
        state.coins = parseInt(localStorage.getItem("coins") || p.coins || 0, 10);


        const diff = $("#difficulty");
        if (diff) diff.value = state.difficulty;
        const gs = $("#gridSize");
        if (gs) gs.value = state.size;
        const wpl = $("#wordsPerLevel");
        if (wpl) wpl.value = state.wordsPerLevel;
        const ts = $("#themeSelect");
        if (ts) ts.value = state.themeKeys[state.themeIndex];

        updateHUD();
        return true;
      } catch (e) {
        console.warn("Failed to parse progress:", e);
        return false;
      }


    },

    hasProgress() {
      return !!localStorage.getItem(STORAGE_KEYS.progress);
    },

    clearProgress() {
      localStorage.removeItem(STORAGE_KEYS.progress);
    },

    leaderboard: {
      add(score) {
        try {
          let name = localStorage.getItem(STORAGE_KEYS.name);
          if (!name) {
            name = prompt("Enter a name for the leaderboard:", "Player") || "Player";
            localStorage.setItem(STORAGE_KEYS.name, name);
          }
          const rec = { name, score, date: new Date().toISOString() };
          const lb = STORAGE.leaderboard.get();
          lb.push(rec);
          lb.sort((a, b) => b.score - a.score);
          localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(lb.slice(0, 10)));
        } catch (e) {
          console.error("Failed to add leaderboard entry:", e);
        }
      },
      get() {
        const raw = localStorage.getItem(STORAGE_KEYS.leaderboard);
        try {
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      },
      clear() {
        localStorage.removeItem(STORAGE_KEYS.leaderboard);
      },
    },

    achievements: {
      get() {
        try {
          return JSON.parse(localStorage.getItem(STORAGE_KEYS.achievements) || "{}");
        } catch {
          return {};
        }
      },
      set(data) {
        try {
          localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(data));
        } catch (e) {
          console.error("Failed to persist achievements:", e);
        }
      },
      clear() {
        localStorage.removeItem(STORAGE_KEYS.achievements);
      },
    },
  };

  /* ===========================
     Achievements
     =========================== */
  const ACHIEVEMENTS = [
    { id: "first_blood", name: "First Blood", desc: "Find your first word", test: (s) => s.score >= 10 },
    { id: "speedrunner", name: "Speedrunner", desc: "Finish a level with >20s left", test: (s) => s._wonLast && s._timeAtWin > 20 },
    { id: "no_help", name: "No Hand Holding", desc: "Finish a level without hints", test: (s) => s._wonLast && s.usedHints === 0 },
    { id: "marathon", name: "Marathon", desc: "Play 5 levels total", test: (s) => (s._levelsCleared || 0) >= 5 },
    { id: "perfect_star", name: "Shiny!", desc: "Earn 3 stars in a level", test: (s) => s._starsLast === 3 },
  ];
  function grantAchievements() {
    const have = STORAGE.achievements.get();
    let changed = false;
    ACHIEVEMENTS.forEach((a) => {
      if (!have[a.id] && a.test(state)) {
        have[a.id] = { name: a.name, date: new Date().toISOString() };
        changed = true;
      }
    });
    if (changed) STORAGE.achievements.set(have);
    renderAchievements();
  }

  function renderAchievements() {
    const list = $("#achvList");
    if (!list) return;
    const have = STORAGE.achievements.get();
    const all = ACHIEVEMENTS.map(a => {
      const owned = !!have[a.id];
      return `<div style="display:flex; justify-content:space-between; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:12px; margin:8px 0; ${owned ? 'background:#0f2a22;' : ''}">
        <div>
          <div style="font-weight:700;">${a.name}</div>
          <div style="color:var(--muted); font-size:13px">${a.desc}</div>
        </div>
        <div class="badge" style="${owned ? 'background:#0f2a22; color:#b2f5c8; border-color:#2bdc7b66;' : ''}">${owned ? 'Unlocked' : 'Locked'}</div>
      </div>`
    }).join('');
    list.innerHTML = all || '<div style="color:var(--muted)">No achievements yet.</div>';
  }

  function renderAchievementsHome() {
    const list = $("#achvListHome");
    if (!list) return;
    const have = STORAGE.achievements.get();
    const all = ACHIEVEMENTS.map(a => {
      const owned = !!have[a.id];
      return `<div style="display:flex; justify-content:space-between; padding:8px; border:1px solid rgba(255,255,255,.08); border-radius:10px; margin:6px 0; ${owned ? 'background:#0f2a22;' : ''}">
      <div>
        <div style="font-weight:600;">${a.name}</div>
        <div style="color:var(--muted); font-size:12px">${a.desc}</div>
      </div>
      <div class="badge" style="${owned ? 'background:#0f2a22; color:#b2f5c8; border-color:#2bdc7b66;' : ''}">
        ${owned ? '✔' : '✖'}
      </div>
    </div>`;
    }).join('');
    list.innerHTML = all || '<div style="color:var(--muted)">No achievements yet.</div>';

  }


  /* ===========================
     Themes
     =========================== */
  function populateThemes() {
    const sel = $("#themeSelect");
    if (!sel) return;
    sel.innerHTML = "";
    state.themeKeys.forEach((k) => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    });
    sel.value = state.themeKeys[state.themeIndex];
  }

  /* ===========================
     Grid / Words
     =========================== */
  function pickWords(themeKey, levelIdx, count, rng = null) {
    const themeLevels = defaultThemes[themeKey];
    const sourceLevel = themeLevels[levelIdx] || themeLevels[0] || [];
    const pool = [...sourceLevel];
    if (!rng) {
      while (pool.length > count) pool.splice(randint(pool.length), 1);
      return pool;
    } else {
      const arr = [...pool];
      const out = [];
      while (out.length < count && arr.length) {
        const i = seededInt(rng, arr.length);
        out.push(arr.splice(i, 1)[0]);
      }
      return out;
    }
  }

  function canPlace(grid, r, c, dr, dc, word) {
    for (let i = 0; i < word.length; i++) {
      const rr = r + i * dr;
      const cc = c + i * dc;
      if (rr < 0 || cc < 0 || rr >= state.size || cc >= state.size) return false;
      const cur = grid[rr][cc];
      if (cur && cur !== word[i]) return false;
    }
    return true;
  }

  function placeWord(grid, word, rng = null) {
    const reversed = (rng ? rng() : Math.random()) > 0.5;
    const w = reversed ? word.split("").reverse().join("") : word;
    const dirs = [...DIRS];
    for (let tries = 0; tries < 300; tries++) {
      const d = dirs[rng ? seededInt(rng, dirs.length) : randint(dirs.length)];
      const r = rng ? seededInt(rng, state.size) : randint(state.size);
      const c = rng ? seededInt(rng, state.size) : randint(state.size);
      if (canPlace(grid, r, c, d[0], d[1], w)) {
        const coords = [];
        for (let i = 0; i < w.length; i++) {
          const rr = r + i * d[0];
          const cc = c + i * d[1];
          grid[rr][cc] = w[i];
          coords.push({ r: rr, c: cc });
        }
        return coords;
      }
    }
    return null;
  }

  // Safer build with retry loop instead of unbounded recursion
  function buildGrid() {
    const rng = state.dailyMode ? mulberry32((state.rngSeed ?? 12345) + state.level) : null;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    for (let attempt = 0; attempt < 40; attempt++) {
      const grid = Array.from({ length: state.size }, () => Array(state.size).fill(""));
      const placed = {};

      let ok = true;
      for (const word of state.words) {
        const coords = placeWord(grid, word, rng);
        if (!coords) { ok = false; break; }
        placed[word] = coords;
        placed[word.split("").reverse().join("")] = coords;
      }
      if (!ok) continue;

      for (let r = 0; r < state.size; r++) {
        for (let c = 0; c < state.size; c++) {
          if (!grid[r][c]) {
            grid[r][c] = rng ? letters[seededInt(rng, letters.length)] : letters[randint(letters.length)];
          }
        }
      }
      state.grid = grid;
      state.placed = placed;
      return;
    }
    throw new Error("Failed to build grid after multiple attempts");
  }

  function renderGrid() {
    const el = $("#grid");
    if (!el) return;
    el.innerHTML = "";
    for (let r = 0; r < state.size; r++) {
      for (let c = 0; c < state.size; c++) {
        const idx = r * state.size + c;
        const d = document.createElement("div");
        d.className = "cell";
        d.textContent = state.grid[r][c];
        d.dataset.r = r;
        d.dataset.c = c;
        d.dataset.idx = idx;
        el.appendChild(d);
      }
    }
  }

  function renderWords() {
    const wrap = $("#words");
    if (!wrap) return;
    wrap.innerHTML = "";
    state.words.forEach((w) => {
      const s = document.createElement("span");
      s.textContent = w;
      s.dataset.word = w;
      wrap.appendChild(s);
    });
  }

  function updateHUD() {
    const tn = $("#themeName");
    if (tn) tn.textContent = state.themeKeys[state.themeIndex];
    const lvl = $("#level");
    if (lvl) lvl.textContent = state.level + 1;
    const sc = $("#score");
    if (sc) sc.textContent = state.score;
    const hL = $("#hintLeft");
    if (hL) hL.textContent = state.powerups.hint;
    const tL = $("#timeLeft");
    if (tL) tL.textContent = state.powerups.time;
    const aL = $("#autoLeft");
    if (aL) aL.textContent = state.powerups.auto;
    setGridSizeCSS(state.size);
    const ts = $("#themeSelect");
    if (ts) ts.value = state.themeKeys[state.themeIndex];
    const db = $("#difficultyBadge");
    if (db) db.textContent = (state.difficulty || "medium").toUpperCase();
  }

  /* ===========================
     Timer / Difficulty
     =========================== */
  function baseTimeByDifficulty() {
    return state.difficulty === "easy" ? 90 : state.difficulty === "hard" ? 45 : 60;
  }

  function updateTimerBar() {
    const timerBar = $("#timer");
    if (!timerBar) return;
    const total = baseTimeByDifficulty();
    const pct = clamp((state.timeLeft / total) * 100, 0, 100);
    timerBar.style.width = `${pct}%`;
    console.log(pct)

    const ration = $("#timer");
    if (ration) {
      if (pct <= 15) ration.classList.add("warning");
      else ration.classList.remove("warning");
    }

    if (pct > 50) timerBar.dataset.zone = "safe";
    else if (pct > 20) timerBar.dataset.zone = "mid";
    else timerBar.dataset.zone = "low";
  }

  function startTimer() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (state._paused) return;
      state.timeLeft--;
      updateTimerBar();

      if (state.timeLeft <= 0) {
        clearInterval(state.timer);
        const gov = $("#gameOver_wrapper");
        if (gov) gov.style.display = "flex";
        const gb = $(".game");
        if (gb) gb.classList.add("blurred");
        endLevel(false);
      }
    }, 1000);
  }

  /* ===========================
     Pause / Play
     =========================== */
  function pauseGame() {
    clearInterval(state.timer);
    state._paused = true;
    const pb = $("#pauseBtn");
    const plb = $("#playBtn");
    if (pb) pb.style.display = "none";
    if (plb) plb.style.display = "inline-block";
    const gb = $(".game");
    if (gb) gb.classList.add("blurred");
  }

  function resumeGame() {
    if (!state._paused) return;
    state._paused = false;
    startTimer();
    const pb = $("#pauseBtn");
    const plb = $("#playBtn");
    if (pb) pb.style.display = "inline-block";
    if (plb) plb.style.display = "none";
    const gb = $(".game");
    if (gb) gb.classList.remove("blurred");
  }

  on("#pauseBtn", "click", pauseGame);
  on("#playBtn", "click", resumeGame);

  /* ===========================
     Selection (Mouse & Touch)
     Enforce straight-line, contiguous selection
     =========================== */
  function indexFromCell(cell) {
    return { r: +cell.dataset.r, c: +cell.dataset.c };
  }
  function getCellAt(r, c) {
    return document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }
  function clearHighlights() {
    $$(".highlight").forEach((c) => c.classList.remove("highlight"));
  }

  // Direction lock while dragging
  let selAnchor = null; // {r,c} of first cell
  let selDir = null;    // {dr,dc} once locked

  function isStraight(a, b) {
    const dr = b.r - a.r, dc = b.c - a.c;
    if (dr === 0 && dc !== 0) return true;          // horizontal
    if (dc === 0 && dr !== 0) return true;          // vertical
    return Math.abs(dr) === Math.abs(dc) && dr !== 0; // 45° diagonal
  }

  function stepsAlongRay(a, b, dr, dc) {
    if (dr === 0 && dc === 0) return null;

    if (dr === 0) {
      if (b.r !== a.r) return null;
      const d = b.c - a.c;
      if (d === 0) return 0;
      if (Math.sign(d) !== dc) return null;
      return Math.abs(d);
    }
    if (dc === 0) {
      if (b.c !== a.c) return null;
      const d = b.r - a.r;
      if (d === 0) return 0;
      if (Math.sign(d) !== dr) return null;
      return Math.abs(d);
    }
    const dR = b.r - a.r, dC = b.c - a.c;
    if (Math.sign(dR) !== dr || Math.sign(dC) !== dc) return null;
    if (Math.abs(dR) !== Math.abs(dC)) return null;
    return Math.abs(dR);
  }

  function rebuildSelectionTo(targetRC) {
    if (!selAnchor) return;

    if (!selDir) {
      if (!isStraight(selAnchor, targetRC)) return; // ignore until aligned
      selDir = {
        dr: Math.sign(targetRC.r - selAnchor.r),
        dc: Math.sign(targetRC.c - selAnchor.c),
      };
    }

    const k = stepsAlongRay(selAnchor, targetRC, selDir.dr, selDir.dc);
    if (k == null) return;

    clearHighlights();
    state.selectedCells = [];
    for (let i = 0; i <= k; i++) {
      const r = selAnchor.r + i * selDir.dr;
      const c = selAnchor.c + i * selDir.dc;
      const cell = getCellAt(r, c);
      if (!cell) return;
      state.selectedCells.push(cell);
      cell.classList.add("highlight");
    }
  }

  function resetSelection() {
    selAnchor = null;
    selDir = null;
    state.selecting = false;
    state.selectedCells = [];
    clearHighlights();
  }

  function selectedWord() {
    if (state.selectedCells.length < 2) return "";
    const text = state.selectedCells.map((el) => el.textContent).join("");
    const rev = text.split("").reverse().join("");
    return state.words.includes(text) || state.words.includes(rev) ? text : "";
  }

  function bindPointer() {
    const grid = $("#grid");
    if (!grid) return;

    // Mouse
    grid.addEventListener("mousedown", (e) => {
      if (state._paused) return;
      if (!e.target.classList.contains("cell")) return;
      state.selecting = true;
      state.selectedCells = [e.target];
      e.target.classList.add("highlight");
      selAnchor = indexFromCell(e.target);
      selDir = null;
    });

    grid.addEventListener("mouseover", (e) => {
      if (state._paused) return;
      if (!state.selecting || !e.target.classList.contains("cell")) return;
      const rc = indexFromCell(e.target);
      rebuildSelectionTo(rc);
    });

    window.addEventListener("mouseup", () => {
      if (state._paused || !state.selecting) return;
      commitSelection();
      resetSelection();
    });

    // Touch
    grid.addEventListener("touchstart", (e) => {
      if (state._paused) return;
      const t = e.targetTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || !el.classList.contains("cell")) return;
      state.selecting = true;
      state.selectedCells = [el];
      el.classList.add("highlight");
      selAnchor = indexFromCell(el);
      selDir = null;
      e.preventDefault();
    }, { passive: false });

    grid.addEventListener("touchmove", (e) => {
      if (state._paused || !state.selecting) return;
      const t = e.targetTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      if (el && el.classList.contains("cell")) {
        const rc = indexFromCell(el);
        rebuildSelectionTo(rc);
      }
      e.preventDefault();
    }, { passive: false });

    grid.addEventListener("touchend", () => {
      if (state._paused || !state.selecting) return;
      commitSelection();
      resetSelection();
    });
  }

  function markWordCoords(coords, word) {
    if (!Array.isArray(coords)) return;

    const color = getWordColor(word);

    coords.forEach(({ r, c }) => {
      const cell = getCellAt(r, c);
      if (cell) {
        cell.classList.remove("highlight");
        cell.dataset.found = "1";
        cell.setAttribute("aria-pressed", "true");

        // Apply unique background color
        cell.style.backgroundColor = color;
        cell.style.color = "white"; // keep letters readable
      }
    });

    // also color the word in the word list
    const tag = document.querySelector(`#words [data-word="${word}"]`);
    if (tag) {
      tag.style.color = color;
      tag.style.fontWeight = "bold";
    }
  }


  function commitSelection() {
    const candidate = selectedWord();
    if (!candidate) {
      clearHighlights();
      return;
    }
    const word = state.words.includes(candidate) ? candidate : candidate.split("").reverse().join("");
    const coords = state.placed[word];
    if (coords) {
      markWordCoords(coords, word);
    } else {
      $$(".highlight").forEach((c) => c.classList.add("correct"));
    }


    const tag =
      $(`#words [data-word="${word}"]`) ||
      $(`#words [data-word="${word.split("").reverse().join("")}"]`);

    const newlyFound = tag && !tag.classList.contains("found");
    if (newlyFound) {
      tag.classList.add("found");
      state.score += 10;
      const sc = $("#score");
      if (sc) sc.textContent = state.score;
    }

    clearHighlights();

    const wordEls = $$("#words span");
    const allFound = wordEls.length > 0 && wordEls.every((w) => w.classList.contains("found"));
    if (allFound) {
      endLevel(true);
    }
  }

  /* ===========================
     Power-ups
     =========================== */
  function useHint() {
    if (state.powerups.hint <= 0) return toast("No hints left");
    const remaining = $$("#words span:not(.found)");
    if (!remaining.length) return;
    const w = remaining[randint(remaining.length)].dataset.word;
    const coords = state.placed[w] || state.placed[w.split("").reverse().join("")];
    if (!coords) return;
    const { r, c } = coords[0];
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if (!cell) return;
    state.powerups.hint--;
    state.usedHints++;
    const hL = $("#hintLeft");
    if (hL) hL.textContent = `${state.powerups.hint}`;
    flash(cell, 5);
  }

  function addTime() {
    if (state.powerups.time <= 0) return toast("No time power-ups left");
    state.powerups.time--;
    const tL = $("#timeLeft");
    if (tL) tL.textContent = state.powerups.time;
    state.timeLeft += 10;
    updateTimerBar();
    toast("+10 seconds ⏱️");
  }

  function autoFind() {
    if (state.powerups.auto <= 0) return toast("No auto-finds left");
    const remaining = $$("#words span:not(.found)");
    if (!remaining.length) return;
    const w = remaining[0].dataset.word;
    const coords = state.placed[w] || state.placed[w.split("").reverse().join("")];
    if (coords) {
      markWordCoords(coords, w);
      const tag = $(`#words [data-word="${w}"]`);
      if (tag && !tag.classList.contains("found")) {
        tag.classList.add("found");
        state.score += 10;
        const sc = $("#score"); if (sc) sc.textContent = state.score;
      }
      state.powerups.auto--;
      const aL = $("#autoLeft"); if (aL) aL.textContent = state.powerups.auto;
      if ($$("#words span").every((x) => x.classList.contains("found"))) endLevel(true);
    }
  }

  function flash(cell, times = 3) {
    let i = 0;
    const id = setInterval(() => {
      cell.classList.toggle("highlight");
      if (++i >= times * 2) {
        clearInterval(id);
        cell.classList.remove("highlight");
      }
    }, 220);
  }

  /* ===========================
     Stars & End Level
     =========================== */
  function calcStars() {
    const timeFactor = state.timeLeft / baseTimeByDifficulty(); // 0..1
    const hintPenalty = clamp(1 - state.usedHints * 0.25, 0, 1); // lose 0.25 per hint
    const score = timeFactor * 0.7 + hintPenalty * 0.3;
    return score >= 0.8 ? 3 : score >= 0.5 ? 2 : 1;
  }

  function endLevel(win) {
    clearInterval(state.timer);
    if (win) {
      state._wonLast = true;
      state._timeAtWin = state.timeLeft;
      state._levelsCleared = (state._levelsCleared || 0) + 1;
      const stars = calcStars();
      state._starsLast = stars;
      const reward = 10 + (state.level * 1, 1)
      state.coins += reward;
      const baseReward = 20;
      state.coins += baseReward;
      animateCoinGain(reward);
      confetti();

      const wrapper = $("#levelComplete_wrapper");
      const gb = $(".game");
      if (gb) gb.classList.add("blurred");
      if (wrapper) wrapper.style.display = "flex";

      // --- Streak Bonus ---
      state.streak++;
      const streakBonus = state.streak * 5;
      state.coins += streakBonus;

      STORAGE.saveProgress("level-complete");
      updateHUD();

      toast(`🎉 Level complete! +${baseReward} coins`);
      if (streakBonus > 0) {
        toast(`🔥 Streak x${state.streak}! +${streakBonus} bonus coins`);
      }

      animateLevelComplete({
        level: state.level + 1,
        score: state.score,
        timeLeft: state._timeAtWin,
        stars,
      });

      STORAGE.saveProgress("level-complete");
      grantAchievements();

    } else {
      state._wonLast = false;
      STORAGE.saveProgress("game-over");
      state.streak = 0;
      STORAGE.saveProgress("level-fail");
      toast("❌ Level failed. Streak reset.");
    }
  }

  function animateLevelComplete({ level, score, timeLeft, stars }) {
    const levelEl = $("#levelComplete_level");
    const scoreEl = $("#levelComplete_score");
    const timeEl = $("#levelComplete_time");
    const s1 = $("#star1"), s2 = $("#star2"), s3 = $("#star3");

    if (levelEl) levelEl.textContent = String(level);

    if (scoreEl) {
      let displayScore = 0;
      const targetScore = score;
      scoreEl.textContent = "0";
      const step = Math.max(1, Math.ceil(targetScore / 30));
      const id = setInterval(() => {
        displayScore += step;
        if (displayScore >= targetScore) { displayScore = targetScore; clearInterval(id); }
        scoreEl.textContent = String(displayScore);
      }, 30);
    }

    if (timeEl) timeEl.textContent = `${Math.max(0, Math.floor(timeLeft))}s`;

    const starsArr = [s1, s2, s3];
    starsArr.forEach(el => { if (el) { el.classList.remove('on', 'shine'); el.style.opacity = .2; } });
    for (let i = 0; i < stars; i++) {
      const el = starsArr[i];
      if (el) {
        setTimeout(() => {
          el.classList.add('on', 'shine');
          el.style.opacity = 1;
        }, 300 + i * 400);
      }
    }
  }

  /* ===========================
     Confetti
     =========================== */
  function confetti() {
    for (let i = 0; i < 120; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.position = 'fixed';
      c.style.top = '-10px';
      c.style.left = Math.random() * 100 + "vw";
      c.style.width = '8px';
      c.style.height = '14px';
      c.style.borderRadius = '2px';
      c.style.background = `hsl(${Math.random() * 360},100%,50%)`;
      c.style.opacity = .9;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.style.animation = `fall ${2 + Math.random() * 3}s linear forwards`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3800);
    }
  }
  const style = document.createElement('style');
  style.textContent = `@keyframes fall { to { transform: translateY(110vh) rotate(720deg); opacity: .2; } }`;
  document.head.appendChild(style);

  /* ===========================
     Toast (fixed typo)
     =========================== */
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("animateToast");
    void t.offsetWidth; // restart animation
    t.classList.add("animateToast");
    setTimeout(displayToast, 5000);
  }

  function displayToast() {
    const t = document.getElementById("toast");
    if (t) t.classList.remove("animateToast");
  }

  /* ===========================
     Leaderboard & Achievements UI
     =========================== */
  function openModal(sel) {
    const m = $(sel);
    if (m) m.style.display = "flex";
  }
  function closeModal(sel) {
    const m = $(sel);
    if (m) m.style.display = "none";
  }
  $$("#leaderModal [data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal("#leaderModal"))
  );
  $$("#achvModal [data-close]").forEach((b) =>
    b.addEventListener("click", () => closeModal("#achvModal"))
  );

  on("#openLeader", "click", () => { renderLeaderboard(); openModal('#leaderModal'); });
  on("#openLeader2", "click", () => { renderLeaderboard(); openModal('#leaderModal'); });
  on("#openAchv", "click", () => { renderAchievements(); openModal('#achvModal'); });
  on("#openAchv2", "click", () => { renderAchievements(); openModal('#achvModal'); });

  function renderLeaderboard() {
    const list = $("#leaderList");
    if (!list) return;
    const data = STORAGE.leaderboard.get();
    if (!data.length) { list.innerHTML = '<div style="color:var(--muted)">No scores yet. Finish a theme to post your score.</div>'; return; }
    list.innerHTML = data.map((r, i) => `<div style="display:flex; justify-content:space-between; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:12px; margin:8px 0;">
      <div><strong>#${i + 1}</strong> ${r.name}</div>
      <div>${r.score}</div>
    </div>`).join('');
  }

  /* ===========================
     Settings & Controls
     =========================== */
  on("#difficulty", "change", (e) => {
    state.difficulty = e.target.value;
    state.timeLeft = baseTimeByDifficulty();
    STORAGE.saveProgress("settings-change");
    restartLevel();
  });

  on("#gridSize", "change", (e) => {
    state.size = clamp(+e.target.value, 8, 18);
    STORAGE.saveProgress("settings-change");
    restartLevel();
  });

  on("#wordsPerLevel", "change", (e) => {
    state.wordsPerLevel = clamp(+e.target.value, 4, 10);
    STORAGE.saveProgress("settings-change");
    restartLevel();
  });

  on("#themeSelect", "change", (e) => {
    state.themeIndex = state.themeKeys.indexOf(e.target.value);
    state.level = 0;
    state.score = 0;
    STORAGE.saveProgress("theme-change");
    restartLevel();
  });

  on("#restartBtn", "click", () => {
    const cwe = document.getElementById('confirm_wrapper');
    const gbe = document.querySelector(".game");
    if (cwe) {
      cwe.style.display = "flex";
    }
    if (gbe) gbe.classList.add("blurred");
    pauseGame()
  });

  on("#restart-no", "click", () => {
    confirmSec();
    setTimeout(() => resumeGame(), 1000);
  });

  on("#restart-yes", "click", () => {
    setTimeout(() => init(false), 100);
    const cw = document.getElementById("confirm_wrapper");
    const gb = document.querySelector(".game");
    if (cw) cw.style.display = "none";
    if (gb) gb.classList.remove("blurred");
    setTimeout(() => resumeGame(), 1000);
  });

  on("#gameover-close", "click", () => {
    document.location.reload();
  });

  on("#gameover-restart", "click", () => {
    setTimeout(() => init(false), 100);
    const w = document.getElementById("gameOver_wrapper");
    const gb = document.querySelector(".game");
    if (w) w.style.display = "none";
    if (gb) gb.classList.remove("blurred");
  });

  function confirmSec() {
    const cw = document.getElementById("confirm_wrapper");
    const gb = document.querySelector(".game")
    if (cw) cw.style.display = "none";
    if (gb) gb.classList.remove("blurred");
  }




  (function setupPowerupModal() {
    if (document.getElementById("powerupModal")) return; // prevent duplicates

    const modal = document.createElement("div");
    modal.id = "powerupModal";
    modal.style.display = "none";
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background = "rgba(0,0,0,0.6)";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.innerHTML = `
    <div class="powerUptopUp">
      <h3>Out of Power-ups ⚡</h3>
                    
      <p>You have <span id="powerupModalCoins">0 </span> <img src="./images/goldIcon.png" alt="" class="coinImgIcoin"></p>
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
        <button class="buyPowerUp" id="buyWithCoins">Buy 1 (<span id="buyPrice">30</span> <img src="./images/goldIcon.png" alt="" class="coinImgIcoin"> ) </button>
        <button class="buyPowerUp" id="watchAdBtn">Watch Ad 🎥</button>
        <button class="buyPowerUp" id="closePowerupModal">Cancel</button>
      </div>
    </div>
  `;
    document.body.appendChild(modal);

    document.getElementById("closePowerupModal").onclick = () => {
      document.getElementById("powerupModal").style.display = "none";
      resumeGame(); // ▶️ Resume if they cancel
    };

    // Buy with coins
    document.getElementById("buyWithCoins").onclick = () => {
      const cost = POWERUP_PRICES[currentPowerupType] || 30;
      if (state.coins >= cost) {
        state.coins -= cost;
        state.powerups[currentPowerupType]++;
        STORAGE.saveProgress("buy-powerup-" + currentPowerupType);
        toast("+1 " + currentPowerupType + " purchased!");
        updateHUD();
        modal.style.display = "none";
        resumeGame();
      } else {
        toast("Not enough coins!");
      }
    };

    // Watch ad
const watchAdBtn = document.getElementById("watchAdBtn");
const pua = document.querySelector(".pua");
const adBar = document.getElementById("adBar");
const adCountdown = document.getElementById("adCountdown");
const powerupModal = document.getElementById("powerupModal");

watchAdBtn.addEventListener("click", () => {
  const INITIAL_COUNT = 5;
  if (watchAdBtn.disabled) return; // prevent double clicks
  watchAdBtn.disabled = true;

  pua.classList.add("open");
  adBar.classList.add("widthSimulation");
  adCountdown.textContent = `${INITIAL_COUNT}s remaining`;

  let count = INITIAL_COUNT;
  let adFinished = false;

  const finishAd = () => {
    if (adFinished) return;
    adFinished = true;

    clearInterval(intervalId);
    clearTimeout(timeoutId);

    // reward + save + UI cleanup
    state.powerups[currentPowerupType]++;
    STORAGE.saveProgress("ad-reward-" + currentPowerupType);
    updateHUD();

    pua.classList.remove("open");
    adBar.classList.remove("widthSimulation");
    powerupModal.style.display = "none";

    // reset UI for next time
    adCountdown.textContent = `${INITIAL_COUNT}s remaining`;
    watchAdBtn.disabled = false;

    resumeGame();
  };

  const intervalId = setInterval(() => {
    count--;
    if (count <= 0) {
      count = 0;
      adCountdown.textContent = `${count}s remaining`;
      finishAd();
    } else {
      adCountdown.textContent = `${count}s remaining`;
    }
  }, 1000);

  const timeoutId = setTimeout(() => {
    finishAd(); // safety: ensure finish runs once
  }, INITIAL_COUNT * 1000);
});

  })();

  // --- Prices for each power-up ---
  const POWERUP_PRICES = {
    hint: 30,
    time: 40,
    auto: 50
  };





  // --- Power-up Modal ---
  let currentPowerupType = null;

  function setupPowerupModal() {
    if (document.getElementById("powerupModal")) return;

    const modal = document.createElement("div");
    modal.id = "powerupModal";
    Object.assign(modal.style, {
      display: "none",
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "9999",
    });

    modal.innerHTML = `
    <div style="background:#222; padding:20px; border-radius:12px; text-align:center; color:white; max-width:300px; width:90%;">
      <h3>Out of Power-ups ⚡</h3>
                    <img src="./images/goldIcon.png" alt="" class="coinImgIcoin">
      <p>You have <span id="powerupModalCoins">0</span> </p>
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
        <button id="buyWithCoins">Buy 1 (<span id="buyPrice">30</span> 🪙)</button>
        <button id="watchAdBtn">Watch Ad 🎥</button>
        <button id="closePowerupModal">Cancel</button>
      </div>
    </div>
  `;
    document.body.appendChild(modal);




    // Buy with coins
    document.getElementById("buyWithCoins").onclick = () => {
      const cost = POWERUP_PRICES[currentPowerupType] || 30;
      if (state.coins >= cost) {
        state.coins -= cost;
        state.powerups[currentPowerupType]++;
        STORAGE.saveProgress("buy-powerup-" + currentPowerupType);
        toast("+1 " + currentPowerupType + " purchased!");
        updateHUD();
        modal.style.display = "none";
      } else {
        toast("Not enough coins!");
      }
    };
  }

  function openPowerupModal(type) {
    currentPowerupType = type;
    setupPowerupModal();
    document.getElementById("powerupModalCoins").textContent = state.coins || 0;
    document.getElementById("buyPrice").textContent = POWERUP_PRICES[type] || 30;
    document.getElementById("powerupModal").style.display = "flex";
    pauseGame();// stop the countdown
  }

  // --- Updated Power-up Button Handlers ---
  on("#hintBtn", "click", () => {
    if (state.powerups.hint > 0) {
      startCooldown(document.getElementById("hintBtn"), 5000);
      useHint();
      STORAGE.saveProgress("powerup-use-hint");
    } else {
      openPowerupModal("hint");
    }
  });

  on("#timeBtn", "click", () => {
    if (state.powerups.time > 0) {
      startCooldown(document.getElementById("timeBtn"), 7000);
      addTime();
      STORAGE.saveProgress("powerup-use-time");
    } else {
      openPowerupModal("time");
    }
  });

  on("#autoBtn", "click", () => {
    if (state.powerups.auto > 0) {
      startCooldown(document.getElementById("autoBtn"), 10000);
      autoFind();
      STORAGE.saveProgress("powerup-use-auto");
    } else {
      openPowerupModal("auto");
    }
  });



  // Next & Replay buttons on Level Complete
  on("#nextBtn", "click", () => {
    const wrapper = document.getElementById("levelComplete_wrapper");
    const gb = document.querySelector(".game");
    if (wrapper) wrapper.style.display = "none";
    if (gb) gb.classList.remove("blurred");
    advanceLevel();
  });

  on("#replayBtn", "click", () => {
    const wrapper = document.getElementById("levelComplete_wrapper");
    const gb = document.querySelector(".game");
    if (wrapper) wrapper.style.display = "none";
    if (gb) gb.classList.remove("blurred");
    restartLevel();
  });

  on("#toggleDaily", "click", () => {
    state.dailyMode = !state.dailyMode;
    if (state.dailyMode && state.rngSeed == null) {
      const d = new Date();
      state.rngSeed = +`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }
    const btn = document.getElementById('toggleDaily');
    if (btn) btn.textContent = state.dailyMode ? 'On' : 'Off';
    STORAGE.saveProgress('daily-toggle');
    restartLevel();
  });

  /* ===========================
     Core Flow
     =========================== */
  function restartLevel() {

    const wordColors = {};
    colorIndex = 0;


    clearInterval(state.timer);
    state.usedHints = 0;

      for (const key in wordColors) delete wordColors[key];
  colorIndex = 0;

    const themeKey = state.themeKeys[state.themeIndex];
    const rng = state.dailyMode ? mulberry32((state.rngSeed ?? 12345) + state.level) : null;
    state.words = pickWords(themeKey, state.level, state.wordsPerLevel, rng);

    buildGrid();
    renderGrid();
    renderWords();

    state.timeLeft = baseTimeByDifficulty();
    updateTimerBar();
    startTimer();
    updateHUD();

    STORAGE.saveProgress("level-restart");
  }

  function advanceLevel() {
    const themeKey = state.themeKeys[state.themeIndex];
    const levelsCount = defaultThemes[themeKey].length;

    if (state.level < levelsCount - 1) {
      state.level++;
    } else {
      if (state.themeIndex < state.themeKeys.length - 1) {
        state.themeIndex++;
        state.level++;
      } else {
        toast("🏁 All themes complete!");
        STORAGE.leaderboard.add(state.score);
        state.themeIndex = 0;
        state.level = 0;
      }
    }
    restartLevel();
  }

  /* ===========================
     Autosave
     =========================== */
  function startAutosave() {
    stopAutosave();
    state._autosaveId = setInterval(() => {
      STORAGE.saveProgress("autosave");
    }, state._saveEveryMs);
  }
  function stopAutosave() {
    if (state._autosaveId) {
      clearInterval(state._autosaveId);
      state._autosaveId = null;
    }
  }
  function checkDailyReward() {
    const now = Date.now();
    const lastClaim = parseInt(localStorage.getItem("lastDailyReward") || "0");

    // 24h = 86,400,000 ms
    if (now - lastClaim >= 86400000) {
      // Give reward
      const coinReward = 50;
      const hintReward = 1;

      state.coins += coinReward;
      state.powerups.hint += hintReward;

      STORAGE.saveProgress("daily-reward");
      updateHUD();

      showDailyRewardModal(coinReward, hintReward);


      // Save new claim time
      localStorage.setItem("lastDailyReward", now);
    }
  }

  function showDailyRewardModal(coins, hints) {
    const modal = document.createElement("div");
    Object.assign(modal.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.6)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "9999",
    });

    modal.innerHTML = `
    <div class="dailyRewards">
      <h2 style="margin: 10px;">🎁 Daily Reward!</h2>
            <p>You earned +${coins}  <img src="./images/goldIcon.png" alt="" class="coinImgIcoin"> & +${hints} hint</p>
      <button id="closeDailyReward">OK</button>
    </div>
  `;
    document.body.appendChild(modal);

    document.getElementById("closeDailyReward").onclick = () => {
      modal.remove();
    };
  }



  /* ===========================
     Init
     =========================== */
  function init(forceFresh = false) {
    populateThemes();
    bindPointer();
    renderAchievements();      // for modal
    renderAchievementsHome();
    checkDailyReward()
    // for home screen

    const continueBtn = document.getElementById("continue");
    if (continueBtn) {
      continueBtn.style.display = STORAGE.hasProgress() ? "inline-flex" : "none";
      continueBtn.onclick = () => {
        if (STORAGE.loadProgress()) {
          toast("Continuing your saved game ▶️");
          restartLevel();
          hideHomeSec();
        } else {
          toast("No saved game found");
        }
      };
    }

    const newBtn = document.getElementById("start");
    if (newBtn) {
      newBtn.onclick = () => {
        STORAGE.clearProgress();
        state.level = 0;
        state.score = 0;
        restartLevel();
        hideHomeSec();
        toast("New game started ✨");
      };
    }

    let loaded = false;
    if (!forceFresh) {
      loaded = STORAGE.loadProgress();
    }

    if (!loaded) {
      state.level = 0;
      state.score = 0;
      state._lastRefill = Date.now();
    }

    restartLevel();
    startAutosave();
  }

  /* ===========================
     Main buttons (Home/start)
     =========================== */
  function hideHomeSec() {
    const hs = document.getElementById("homeScreen");
    if (hs) hs.classList.add("hide");
  }

  on("#start", "click", () => {
    const hs = document.getElementById("homeScreen");
    if (hs) hs.style.opacity = "0";
    setTimeout(() => init(false), 50);
    setTimeout(hideHomeSec, 2700);
    $('#game').style.opacity = "1";
  });

  // Optional: Spacebar toggle pause/play
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (state._paused) resumeGame();
      else pauseGame();
    }
  });

  // Save on tab close/refresh
  window.addEventListener("beforeunload", () => {
    STORAGE.saveProgress("beforeunload");
  });

  // Expose for console debugging (optional)
  window._wsState = state;
  window._wsStorage = STORAGE;
  // Also expose helpers used by outside utilities
  window._wsUpdateHUD = updateHUD;
  window._wsToast = toast;

  // Boot preview if you want to auto-init without splash:
  // Show achievements before start, do not auto-start game
  if (window._wsStorage) {
    renderAchievementsHome();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (window._wsStorage) renderAchievementsHome();
    });
  }

})();

/* ===========================
   Cooldown helpers (outside IIFE)
   =========================== */
function startCooldown(button, duration = 5000) {
  if (!button) return;
  if (button.classList.contains("on-cooldown")) return;
  button.classList.add("on-cooldown");
  const overlay = button.querySelector(".cooldown-overlay");
  if (overlay) {
    overlay.style.animationDuration = duration + "ms";
    overlay.style.animationName = 'cooldownFill';
  }
  setTimeout(() => {
    button.classList.remove("on-cooldown");
    if (overlay) {
      overlay.style.animationDuration = "0ms";
      overlay.style.animationName = 'none';
      overlay.style.transform = 'translateY(-100%)';
    }
  }, duration);
}

/* We intentionally do NOT re-wire extra click handlers here to avoid double cooldowns.
   The IIFE already wires #hintBtn, #timeBtn, #autoBtn with startCooldown calls. */

/* =====================================================================
   OPTIONAL: SMALL UTILS (purely frontend polish)
   ===================================================================== */

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ===============================
// Unified Game State Helpers
// ===============================
function getGameState() {
  const raw = localStorage.getItem("ws_progress");
  if (raw) {
    try {
      const data = JSON.parse(raw);
      return {
        coins: parseInt(localStorage.getItem("coins") || data.coins || 0, 10),
        powerups: data.powerups || { hint: 0, time: 0, auto: 0 }
      };
    } catch { }
  }
  return {
    coins: parseInt(localStorage.getItem("coins") || 0, 10),
    powerups: { hint: 0, time: 0, auto: 0 }
  };
}

function saveGameState(state) {
  const raw = localStorage.getItem("ws_progress");
  let data = {};
  try { data = JSON.parse(raw) || {}; } catch { }
  data.coins = state.coins;
  data.powerups = state.powerups;
  localStorage.setItem("ws_progress", JSON.stringify(data));
  localStorage.setItem("coins", String(state.coins));
}

function updateCoins(amount) {
  const st = getGameState();
  st.coins = (st.coins || 0) + amount;
  saveGameState(st);
  if (window._wsUpdateHUD) window._wsUpdateHUD();
}

function addPowerup(type, amount = 1) {
  const st = getGameState();
  if (!st.powerups[type]) st.powerups[type] = 0;
  st.powerups[type] += amount;
  saveGameState(st);
  if (window._wsUpdateHUD) window._wsUpdateHUD();
}


function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

(function savedBanner() {
  try {
    const has = !!localStorage.getItem("ws_progress");
    const el = document.getElementById("savedBanner");
    if (el) el.style.display = has ? "block" : "none";
  } catch {
    // ignore
  }
})();

/* ===== BEGIN: Original code preserved below, corrected for global scope =====
   (Kept as-is in content, with compatibility fixes; nothing removed)
*/
const POWERUP_MAX_GLOBAL = { hint: 3, time: 3, auto: 2 }; // renamed to avoid shadowing but preserved intent
function refillPowerups_Global() {
  const st = window._wsState;
  const store = window._wsStorage;
  if (!st) return;
  let changed = false;
  for (const key of Object.keys(st.powerups)) {
    if (st.powerups[key] < POWERUP_MAX_GLOBAL[key]) {   // ✅ FIXED: removed stray comma
      st.powerups[key] = Math.min(st.powerups[key] + 1, POWERUP_MAX_GLOBAL[key]);
      changed = true;
    }
  }
  if (changed) {
    // Update minimal HUD parts safely (updateHUD may not be globally visible on some builds)
    const hL = document.getElementById("hintLeft"); if (hL) hL.textContent = st.powerups.hint;
    const tL = document.getElementById("timeLeft"); if (tL) tL.textContent = st.powerups.time;
    const aL = document.getElementById("autoLeft"); if (aL) aL.textContent = st.powerups.auto;

    if (store) store.saveProgress("powerup-refill");
    if (window._wsToast) window._wsToast("✨ Power-ups refilled!");
  }
}

/* The following two lines in your original snippet were syntactically invalid at global scope.
   They are preserved here as comments so no content is lost. */
// lastRefill: state._lastRefill || Date.now(),
// state._lastRefill = p.lastRefill || Date.now();
function checkAndRefillPowerups() {
  const st = window._wState;
  const store = window._wStorage;

  // Function to update countdown on HUD
  function updateRefillTimer(msLeft) {
    const timerEl = document.getElementById("refillTimer");
    if (!timerEl) return;

    const minutes = Math.floor(msLeft / 60000);
    const seconds = Math.floor((msLeft % 60000) / 1000);
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  if (!st) {
    // If state is not ready yet, retry in 1 minute
    updateRefillTimer(60000);
    setTimeout(checkAndRefillPowerups, 60 * 1000);
    return;
  }

  // --- Assume we refill every 60s for demo ---
  const now = Date.now();
  if (!st.lastRefill) {
    st.lastRefill = now; // initialize if missing
  }
  const elapsed = now - st.lastRefill;
  const interval = 60 * 1000; // 1 minute refill interval
  const msLeft = interval - (elapsed % interval);

  // Update countdown every second
  updateRefillTimer(msLeft);
  setTimeout(checkAndRefillPowerups, 1000);

  // Check if enough time passed to refill
  if (elapsed >= interval) {
    st.lastRefill = now;
    refillPowerups_Global();  // your existing refill function
    if (store) store.saveProgress("powerup-refill");
  }
}


/* The original had a duplicate function and an inline call that broke the block.
   We keep the intent by calling the function once here, and we already reschedule inside. */
checkAndRefillPowerups();

/* ===== END: Preserved global refill logic ===== */

/* =====================================================================
   IN-GAME CURRENCY + SHOP (Add-on)
   Safe drop-in: no existing lines removed or edited.
   Paste this block at the very end of your file.
   ===================================================================== */

(function IGCCurrencyShopAddon() {
  "use strict";

  // --- Config ----------------------------------------------------------
  const COINS_KEY = "coins";
  const AD_REWARD = 20;
  const PRODUCTS = [
    { amount: 100, price: 0.99, label: "100 Coins" },
    { amount: 500, price: 3.99, label: "500 Coins" },
  ];
  const POWERUP_PRICES = { hint: 30, time: 25, auto: 40 };
  const POWERUP_MAX_FALLBACK = { hint: 3, time: 3, auto: 2 }; // in case not found

  // --- Helpers ---------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const toast = (msg) =>
    (window._wsToast ? window._wsToast(msg) : console.log("[TOAST]", msg));

  function getState() {
    return window._wsState || {};
  }
  function getStorage() {
    return window._wsStorage || {};
  }
  function getMaxPowerups() {
    // Prefer internal constants if available, else global fallback, else local fallback.
    return (typeof POWERUP_MAX !== "undefined" && POWERUP_MAX) ||
      (typeof POWERUP_MAX_GLOBAL !== "undefined" && POWERUP_MAX_GLOBAL) ||
      POWERUP_MAX_FALLBACK;
  }

  function loadCoins() {
    try {
      const v = localStorage.getItem(COINS_KEY);
      const n = v == null ? 0 : Math.max(0, parseInt(v, 10) || 0);
      getState().coins = n;
      return n;
    } catch { return getState().coins || 0; }
  }
  function saveCoins() {
    try {
      const n = Math.max(0, (getState().coins | 0));
      localStorage.setItem(COINS_KEY, String(n));
    } catch { }
  }
  function addCoins(n) {
    const st = getState();
    st.coins = Math.max(0, (st.coins | 0) + (n | 0));
    saveCoins();
    updateCoinsHUD();
    toast(`${n > 0 ? "+" : ""}${n} 🪙`);
  }
  function spendCoins(n) {
    const st = getState();
    const have = st.coins | 0;
    if (have < n) return false;
    st.coins = have - n;
    saveCoins();
    updateCoinsHUD();
    return true;
  }

  function buildUIOnce() {
    // Shop modal
    const modal = document.createElement("div");
    modal.id = "igcShopModal";
    modal.innerHTML = `
      <div class="pane" role="dialog" aria-modal="true" aria-label="Shop">
        <h2 style="margin-top:16px">⚡</h2>
        <div class="rowHome">
          <button class="btnigc" id="igcBuyHint">+1 Hint (${POWERUP_PRICES.hint} 🪙)</button>
          <button class="btnigc" id="igcBuyTime">+1 +10s (${POWERUP_PRICES.time} 🪙)</button>
          <button class="btnigc" id="igcBuyAuto">+1 Auto (${POWERUP_PRICES.auto} 🪙)</button>
        </div>
      </div>
    `;
    $('#main-action').appendChild(modal);

    // Modal events
    $("#igcBuyHint").addEventListener("click", () => buyPowerup("hint", POWERUP_PRICES.hint));
    $("#igcBuyTime").addEventListener("click", () => buyPowerup("time", POWERUP_PRICES.time));
    $("#igcBuyAuto").addEventListener("click", () => buyPowerup("auto", POWERUP_PRICES.auto));
  }

  function updateCoinsHUD() {
    const st = getState();
    const v = $("#igcCoinValue");
    const b = $("#igcBalance");
    if (v) v.textContent = String(st.coins | 0);
    if (b) b.textContent = String(st.coins | 0);
  }

  function openShop() {
    $("#igcShopModal").style.display = "flex";
    updateCoinsHUD();
  }
  function closeShop() {
    $("#igcShopModal").style.display = "none";
  }

  // --- Payment & Ad Flows ---------------------------------------------
  async function buyCoinsFlow({ amount, price, label }) {
    // Try Payment Request API; fall back to instant mock.
    const st = getState();
    try {
      if (window.PaymentRequest) {
        const supported = [{ supportedMethods: "basic-card" }];
        const details = {
          total: { label: label, amount: { currency: "USD", value: price.toFixed(2) } },
        };
        const req = new PaymentRequest(supported, details);
        const resp = await req.show();
        // Normally you would validate on a server here.
        await resp.complete("success");
        addCoins(amount);
        toast(`Purchased ${amount} 🪙`);
        getStorage().saveProgress && getStorage().saveProgress("buy-coins");
        updateCoinsHUD();
        return;
      }
      // Fallback mock
      addCoins(amount);
      toast(`Purchased ${amount} 🪙 (mock)`);
      getStorage().saveProgress && getStorage().saveProgress("buy-coins");
      updateCoinsHUD();
    } catch (e) {
      toast("Purchase cancelled or failed");
    }
  }

  function buyPowerup(kind, cost) {
    const st = getState();
    const max = getMaxPowerups();
    if (!st.powerups || typeof st.powerups[kind] !== "number") {
      toast("Power-ups not available in this build.");
      return;
    }
    if (st.powerups[kind] >= (max[kind] || 3)) {
      toast("Already at max for this power-up.");
      return;
    }
    if (!spendCoins(cost)) {
      toast("Not enough coins.");
      return;
    }
    st.powerups[kind] += 1;
    // Update HUD safely
    if (window._wsUpdateHUD) window._wsUpdateHUD();
    else {
      const idMap = { hint: "hintLeft", time: "timeLeft", auto: "autoLeft" };
      const el = document.getElementById(idMap[kind]);
      if (el) el.textContent = st.powerups[kind];
    }
    getStorage().saveProgress && getStorage().saveProgress("buy-powerup-" + kind);
    toast(`+1 ${kind} purchased`);
    updateCoinsHUD();
  }

  // --- Wrap STORAGE save/load (non-invasive) ---------------------------
  function wrapStorageOnce() {
    const store = getStorage();
    if (!store || store.__igcWrapped) return;
    store.__igcWrapped = true;

    const originalSave = typeof store.saveProgress === "function"
      ? store.saveProgress.bind(store)
      : null;
    const originalLoad = typeof store.loadProgress === "function"
      ? store.loadProgress.bind(store)
      : null;

    if (originalSave) {
      store.saveProgress = function (reason) {
        try { saveCoins(); } catch { }
        return originalSave(reason);
      };
    }
    if (originalLoad) {
      store.loadProgress = function () {
        const ok = originalLoad();
        try { loadCoins(); updateCoinsHUD(); } catch { }
        return ok;
      };
    }
  }

  // --- Bootstrap -------------------------------------------------------
  function ready() {
    return !!(window._wsState && window._wsStorage);
  }

  function hardRefreshCoinsOnHUDChange() {
    // Hook into public HUD updater if available, to keep coin chip in sync.
    if (window._wsUpdateHUD && !window._wsUpdateHUD.__igcWrapped) {
      const orig = window._wsUpdateHUD;
      window._wsUpdateHUD = function () {
        try { orig(); } catch { }
        try { updateCoinsHUD(); } catch { }
      };
      window._wsUpdateHUD.__igcWrapped = true;
    }
  }

  function initAddon() {
    buildUIOnce();
    wrapStorageOnce();
    loadCoins();
    updateCoinsHUD();
    hardRefreshCoinsOnHUDChange();
  }

  // Wait for the game to expose state/storage, then init.
  (function waitForGame() {
    if (ready()) {
      initAddon();
    } else {
      // Try again soon; very light polling so we don't block anything.
      setTimeout(waitForGame, 120);
    }
  })();

})();



/* =====================================================================
   END OF FILE
   ===================================================================== */


// =============================
// OPEN SPIN WHEEL
// =============================
function openSpinWheel() { 
  const now = Date.now();
  const lastSpin = parseInt(localStorage.getItem("lastSpin") || "0");

  // Can open if daily spin available OR if ad spin is available
  if (now - lastSpin < 86400000 && !localStorage.getItem("adSpinCount")) {
    if (window._wsToast) window._wsToast("⏳ You already spun today. Watch an ad for more spins!");
    return;
  }

  const rewards = [
    { text: "+10 coins", coins: 10, color: "gold" },
    { text: "+20 coins", coins: 20, color: "red" },
    { text: "+1 Hint", hint: 1, color: "green" },
    { text: "+50 coins", coins: 50, color: "blue" },
    { text: "+1 Auto", auto: 1, color: "purple" },
    { text: "Nothing 😢", color: "orange" },
    { text: "+100 coins", coins: 100, color: "gray" },
  ];

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    position: "fixed",
    top: "0", left: "0", width: "100%", height: "100%",
    background: "rgba(0,0,0,0.6)",
    display: "flex", justifyContent: "center", alignItems: "center",
    zIndex: "9999"
  });

  modal.innerHTML = `
    <div class="wheelContent" style="padding:20px; border-radius:12px; color:white; text-align:center; max-width:350px;">
      <h3>🎡 Spin the Wheel!</h3>
      <div class="wheelItemContainer" style="position:relative; width:250px; height:250px; margin:20px auto;">
      <div class="wheelBorder"></div>
      <div class="wheelCenter"></div>
        <img id="wheel" 
             src="./images/background/wheel.png" 
             style="width:100%; height:100%; border-radius:50%; transition: transform 4s ease-out;" />
        <div style="position:absolute; top:-20px; left:50%; z-index: 200; transform:translateX(-50%); font-size:24px;">🔻</div>
      </div>
      <div id="wheelResult" style="margin:10px; font-size:18px;">Ready to spin!</div>
      <button id="spinNowBtn">Spin ▶️</button>
      <button id="watchAdBtnSpin" style="display: none;">📺 Watch Ad for Extra Spin</button>
      <button id="closeSpin">Close</button>
    </div>
  `;

  document.body.appendChild(modal);

  // Attach event listeners
  const closeBtn = modal.querySelector("#closeSpin");
  const spinBtn = modal.querySelector("#spinNowBtn");
  const watchAdBtnSpin = modal.querySelector("#watchAdBtnSpin");

  closeBtn.addEventListener("click", () => modal.remove());
  spinBtn.addEventListener("click", () => spinReward(modal, rewards));

  // Watch ad button - spins automatically after ad
  watchAdBtnSpin.addEventListener("click", () => {
    playAdSimulation(() => {
      // Automatically spin the wheel after ad
      spinReward(modal, rewards);
    });
  });
}


// =============================
// AD SIMULATION
// =============================
function playAdSimulation(callback) {
  const adModal = document.createElement("div");
  Object.assign(adModal.style, {
    position: "fixed",
    top: "0", left: "0", width: "100%", height: "100%",
    background: "black",
    display: "flex", flexDirection: "column",
    justifyContent: "center", alignItems: "center",
    color: "white",
    zIndex: "10000",
    fontSize: "20px",
    textAlign: "center"
  });

  adModal.innerHTML = `
    <p>📺 Your ad is playing...</p>
    <div id="adProgress" style="width:80%; height:20px; background:#333; border-radius:10px; margin-top:20px; overflow:hidden;">
      <div id="adBar" style="width:0%; height:100%; background:limegreen;"></div>
    </div>
    <p id="adCountdown">5s remaining</p>
  `;

  document.body.appendChild(adModal);

  let time = 5;
  const adBar = adModal.querySelector("#adBar");
  const adCountdown = adModal.querySelector("#adCountdown");

  const interval = setInterval(() => {
    time--;
    adBar.style.width = `${((5 - time) / 5) * 100}%`;
    adCountdown.textContent = `${time}s remaining`;

    if (time <= 0) {
      clearInterval(interval);
      document.body.removeChild(adModal);
      callback(); // automatically spins after ad
    }
  }, 1000);
}

// =============================
// SPIN LOGIC
// =============================
function spinReward(modal, rewards) {
  const wheel = modal.querySelector("#wheel");
  const spinNowBtn = modal.querySelector("#spinNowBtn");

  spinNowBtn.disabled = true;

  const slice = Math.floor(Math.random() * rewards.length); // Pick reward index
  const anglePerSlice = 360 / rewards.length;

  // Pointer is at 0° (top). Need to rotate so chosen slice aligns with it.
  // We rotate in reverse (negative) to simulate clockwise spin visually.
  const stopAngle = 360 - (slice * anglePerSlice + anglePerSlice / 2);

  // Add multiple full spins for drama
  const rotation = 5 * 360 + stopAngle;

  // Reset instantly, then animate
  wheel.style.transition = "none";
  wheel.style.transform = `rotate(0deg)`;
  setTimeout(() => {
    wheel.style.transition = "transform 4s ease-out";
    wheel.style.transform = `rotate(${rotation}deg)`;
  }, 50);

  // After spin completes
  setTimeout(() => {
    const reward = rewards[slice];
    const resultEl = modal.querySelector("#wheelResult");
    resultEl.textContent = `You got: ${reward.text}`;

    if (reward.coins) updateCoins(reward.coins);
    if (reward.hint) addPowerup("hint", reward.hint);
    if (reward.auto) addPowerup("auto", reward.auto);

    // Track daily or ad spin
    let adSpinCount = parseInt(localStorage.getItem("adSpinCount") || "0");
    if (adSpinCount > 0) {
      localStorage.setItem("adSpinCount", adSpinCount - 1); // consume one ad spin
    } else {
      localStorage.setItem("lastSpin", Date.now()); // daily spin
    }

    spinNowBtn.disabled = true;
    spinNowBtn.textContent = "⏳";
    spinNowBtn.style.display = "none";
    watchAdBtnSpin.style.display = "flex";
    updateSidebarButton();
  }, 4000);
}


// =============================
// SIDEBAR BUTTON
// =============================
function updateSidebarButton() {
  let spinBtn = document.querySelector("#spinWheelBtn");
  if (!spinBtn) {
    spinBtn = document.createElement("button");
    spinBtn.id = "spinWheelBtn";
    spinBtn.textContent = "🎡";
    spinBtn.onclick = openSpinWheel;

    const sidebar = document.querySelector("#sidebar-top") || document.body;
    sidebar.appendChild(spinBtn);
  }

  const now = Date.now();
  const lastSpin = parseInt(localStorage.getItem("lastSpin") || "0");
  const diff = now - lastSpin;
  const adSpinCount = parseInt(localStorage.getItem("adSpinCount") || "0");

  if (adSpinCount > 0) {
    spinBtn.disabled = false;
    return;
  }

  if (diff < 86400000) {
    spinBtn.disabled = true;
    let remaining = Math.ceil((86400000 - diff) / 1000);
    $('#nextSpin').textContent = `⏳ Next spin in ${formatTime(remaining)}`;
    setTimeout(updateSidebarButton, 1000);
  } else {
    spinBtn.disabled = false;
    spinBtn.textContent = "🎡";
  }
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

// =============================
// INIT BUTTON ON PAGE LOAD
// =============================
document.addEventListener("DOMContentLoaded", updateSidebarButton);
