"use strict";

const NHL_API_BASE = "/api/score";
const LOGO_BASE = "https://assets.nhle.com/logos/nhl/svg";
const TIMEZONE = "Europe/Helsinki";
const STORAGE_PREFIX = "nhl-picker-selections:";

const ALL_TEAMS = [
  { abbrev: "ANA", name: "Anaheim Ducks" },
  { abbrev: "BOS", name: "Boston Bruins" },
  { abbrev: "BUF", name: "Buffalo Sabres" },
  { abbrev: "CGY", name: "Calgary Flames" },
  { abbrev: "CAR", name: "Carolina Hurricanes" },
  { abbrev: "CHI", name: "Chicago Blackhawks" },
  { abbrev: "COL", name: "Colorado Avalanche" },
  { abbrev: "CBJ", name: "Columbus Blue Jackets" },
  { abbrev: "DAL", name: "Dallas Stars" },
  { abbrev: "DET", name: "Detroit Red Wings" },
  { abbrev: "EDM", name: "Edmonton Oilers" },
  { abbrev: "FLA", name: "Florida Panthers" },
  { abbrev: "LAK", name: "Los Angeles Kings" },
  { abbrev: "MIN", name: "Minnesota Wild" },
  { abbrev: "MTL", name: "Montréal Canadiens" },
  { abbrev: "NSH", name: "Nashville Predators" },
  { abbrev: "NJD", name: "New Jersey Devils" },
  { abbrev: "NYI", name: "New York Islanders" },
  { abbrev: "NYR", name: "New York Rangers" },
  { abbrev: "OTT", name: "Ottawa Senators" },
  { abbrev: "PHI", name: "Philadelphia Flyers" },
  { abbrev: "PIT", name: "Pittsburgh Penguins" },
  { abbrev: "SJS", name: "San Jose Sharks" },
  { abbrev: "SEA", name: "Seattle Kraken" },
  { abbrev: "STL", name: "St. Louis Blues" },
  { abbrev: "TBL", name: "Tampa Bay Lightning" },
  { abbrev: "TOR", name: "Toronto Maple Leafs" },
  { abbrev: "UTA", name: "Utah Hockey Club" },
  { abbrev: "VAN", name: "Vancouver Canucks" },
  { abbrev: "VGK", name: "Vegas Golden Knights" },
  { abbrev: "WPG", name: "Winnipeg Jets" },
  { abbrev: "WSH", name: "Washington Capitals" },
];

const els = {
  dateLabel: document.getElementById("dateLabel"),
  status: document.getElementById("status"),
  gamesList: document.getElementById("gamesList"),
  pickBtn: document.getElementById("pickBtn"),
  repickBtn: document.getElementById("repickBtn"),
  pickPanel: document.getElementById("pickPanel"),
  pickContent: document.getElementById("pickContent"),
  teamGrid: document.getElementById("teamGrid"),
  viaplayCount: document.getElementById("viaplayCount"),
};

const state = {
  games: [],
  pickedId: null,
  lastPickedPoolId: null,
  loading: true,
  error: null,
  selectedGameIds: new Set(),
};

function getHelsinkiDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatHelsinkiDateLong(d = new Date()) {
  return new Intl.DateTimeFormat("fi-FI", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatHelsinkiTime(iso) {
  return new Intl.DateTimeFormat("fi-FI", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function describeState(s) {
  switch (s) {
    case "LIVE":
      return { label: "Käynnissä", cls: "live", showScore: true };
    case "FINAL":
    case "OFF":
      return { label: "Päättynyt", cls: "final", showScore: true };
    default:
      return { label: "", cls: "", showScore: false };
  }
}

function logoUrl(abbrev) {
  return `${LOGO_BASE}/${abbrev}_light.svg`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function getViaplayGames() {
  return state.games.filter((g) => state.selectedGameIds.has(g.id));
}

function getGamesForTeam(abbrev) {
  return state.games.filter(
    (g) => g.awayTeam.abbrev === abbrev || g.homeTeam.abbrev === abbrev,
  );
}

function loadSelections() {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + getHelsinkiDateString());
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      state.selectedGameIds = new Set(arr.filter((x) => typeof x === "number"));
    }
  } catch (_err) {
    // ignore corrupt or unavailable storage
  }
}

function saveSelections() {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + getHelsinkiDateString(),
      JSON.stringify([...state.selectedGameIds]),
    );
  } catch (_err) {
    // localStorage may be unavailable (private mode, quota); ignore
  }
}

function renderDate() {
  els.dateLabel.textContent = formatHelsinkiDateLong();
}

function renderTeamGrid() {
  const gamesByTeam = new Map();
  for (const g of state.games) {
    if (!gamesByTeam.has(g.awayTeam.abbrev)) gamesByTeam.set(g.awayTeam.abbrev, []);
    if (!gamesByTeam.has(g.homeTeam.abbrev)) gamesByTeam.set(g.homeTeam.abbrev, []);
    gamesByTeam.get(g.awayTeam.abbrev).push(g);
    gamesByTeam.get(g.homeTeam.abbrev).push(g);
  }

  const list = els.teamGrid;
  list.innerHTML = "";
  for (const t of ALL_TEAMS) {
    const teamGames = gamesByTeam.get(t.abbrev) || [];
    const playsToday = teamGames.length > 0;
    const selectedCount = teamGames.filter((g) => state.selectedGameIds.has(g.id)).length;
    const selected = selectedCount > 0;
    const li = document.createElement("li");
    li.className = "team-cell";
    if (!playsToday) li.classList.add("disabled");
    if (selected) li.classList.add("selected");
    li.dataset.abbrev = t.abbrev;

    li.innerHTML = `
      <img class="logo" src="${escapeHtml(logoUrl(t.abbrev))}" alt="" loading="lazy" />
      <span class="abbrev">${escapeHtml(t.abbrev)}</span>
      <span class="name">${escapeHtml(t.name)}</span>
    `;
    const img = li.querySelector("img.logo");
    img.addEventListener("error", () => { img.style.visibility = "hidden"; });
    if (playsToday) {
      if (teamGames.length === 1) {
        li.addEventListener("click", () => toggleGame(teamGames[0].id));
      } else {
        li.addEventListener("click", (e) => {
          e.stopPropagation();
          openChooser(t.abbrev, li);
        });
      }
    }
    list.appendChild(li);
  }

  const poolSize = getViaplayGames().length;
  els.viaplayCount.textContent = `Viaplay-ottelut: ${poolSize}`;
}

function renderStatus() {
  const s = els.status;
  s.classList.remove("error");
  if (state.loading) {
    s.textContent = "Ladataan otteluita…";
    s.hidden = false;
  } else if (state.error) {
    s.classList.add("error");
    s.textContent = `Otteluiden haku epäonnistui: ${state.error}`;
    s.hidden = false;
  } else if (state.games.length === 0) {
    s.textContent = "Ei NHL-otteluita tänään.";
    s.hidden = false;
  } else {
    s.hidden = true;
  }
}

function renderGames() {
  const poolIds = new Set(getViaplayGames().map((g) => g.id));
  const list = els.gamesList;
  list.innerHTML = "";
  for (const g of state.games) {
    const info = describeState(g.gameState);
    const inPool = poolIds.has(g.id);
    const li = document.createElement("li");
    li.className = "game-card";
    if (info.cls) li.classList.add(info.cls);
    if (inPool) li.classList.add("viaplay");
    if (g.id === state.pickedId) li.classList.add("picked");

    li.innerHTML = `
      <div class="team-row">
        <img class="logo" src="${escapeHtml(logoUrl(g.awayTeam.abbrev))}" alt="" loading="lazy" />
        <span class="abbrev">${escapeHtml(g.awayTeam.abbrev)}</span>
        <span class="name">${escapeHtml(g.awayTeam.name.default)}</span>
        ${info.showScore ? `<span class="score">${g.awayTeam.score ?? 0}</span>` : ""}
      </div>
      <div class="team-row">
        <img class="logo" src="${escapeHtml(logoUrl(g.homeTeam.abbrev))}" alt="" loading="lazy" />
        <span class="abbrev">${escapeHtml(g.homeTeam.abbrev)}</span>
        <span class="name">${escapeHtml(g.homeTeam.name.default)}</span>
        ${info.showScore ? `<span class="score">${g.homeTeam.score ?? 0}</span>` : ""}
      </div>
      <div class="meta">
        ${inPool ? `<span class="badge viaplay">Viaplay</span>` : ""}
        ${info.label ? `<span class="badge ${info.cls}">${escapeHtml(info.label)}</span>` : ""}
        ${g.startTimeUTC ? `<span class="time">${escapeHtml(formatHelsinkiTime(g.startTimeUTC))}</span>` : ""}
      </div>
    `;

    li.querySelectorAll("img.logo").forEach((img) => {
      img.addEventListener("error", () => {
        img.style.visibility = "hidden";
      });
    });

    list.appendChild(li);
  }
}

function renderPick() {
  const pool = getViaplayGames();
  const pickedInPool = state.pickedId !== null && pool.some((g) => g.id === state.pickedId);
  if (!pickedInPool) {
    els.pickPanel.hidden = true;
    return;
  }
  const g = pool.find((x) => x.id === state.pickedId);
  const info = describeState(g.gameState);
  els.pickPanel.hidden = false;

  const time = g.startTimeUTC ? `Alkaa ${formatHelsinkiTime(g.startTimeUTC)}` : info.label;
  els.pickContent.innerHTML = `
    <div class="pick-game">
      <div class="teams">
        <span>${escapeHtml(g.awayTeam.abbrev)}</span>
        <span class="vs">@</span>
        <span>${escapeHtml(g.homeTeam.abbrev)}</span>
      </div>
      <div class="meta">${escapeHtml(time)} · ${escapeHtml(g.awayTeam.name.default)} @ ${escapeHtml(g.homeTeam.name.default)}</div>
    </div>
  `;
}

function updatePickButtons() {
  const pool = getViaplayGames();
  els.pickBtn.disabled = pool.length === 0;
  const pickedInPool = state.pickedId !== null && pool.some((g) => g.id === state.pickedId);
  els.repickBtn.disabled = pool.length === 0 || !pickedInPool;
}

function toggleGame(gameId) {
  if (state.selectedGameIds.has(gameId)) {
    state.selectedGameIds.delete(gameId);
  } else {
    state.selectedGameIds.add(gameId);
  }
  const pool = getViaplayGames();
  if (state.pickedId && !pool.some((g) => g.id === state.pickedId)) {
    state.pickedId = null;
    state.lastPickedPoolId = null;
  }
  saveSelections();
  renderTeamGrid();
  renderGames();
  renderPick();
  updatePickButtons();
}

let chooserDocClickHandler = null;
let chooserKeyHandler = null;

function openChooser(abbrev, anchorEl) {
  closeChooser();
  const games = getGamesForTeam(abbrev);
  const chooser = document.createElement("div");
  chooser.id = "matchupChooser";
  chooser.className = "matchup-chooser";
  chooser.setAttribute("role", "dialog");
  chooser.innerHTML = `
    <div class="chooser-header">${escapeHtml(abbrev)} — valitse ottelu</div>
    ${games.map((g) => {
      const sel = state.selectedGameIds.has(g.id);
      const vsLabel = `${escapeHtml(g.awayTeam.abbrev)} @ ${escapeHtml(g.homeTeam.abbrev)}`;
      const time = g.startTimeUTC ? escapeHtml(formatHelsinkiTime(g.startTimeUTC)) : "";
      return `<button type="button" class="matchup-option${sel ? " selected" : ""}" data-game-id="${g.id}">
        <span class="matchup-teams">${vsLabel}</span>
        ${time ? `<span class="matchup-time">${time}</span>` : ""}
      </button>`;
    }).join("")}
  `;
  document.body.appendChild(chooser);

  const rect = anchorEl.getBoundingClientRect();
  const cRect = chooser.getBoundingClientRect();
  let top = rect.bottom + window.scrollY + 6;
  if (top + cRect.height > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - cRect.height - 6;
  }
  let left = rect.left + window.scrollX;
  if (left + cRect.width > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - cRect.width - 8;
  }
  chooser.style.top = `${Math.max(0, top)}px`;
  chooser.style.left = `${Math.max(0, left)}px`;

  chooser.querySelectorAll(".matchup-option").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleGame(Number(btn.dataset.gameId));
      closeChooser();
    });
  });

  chooserDocClickHandler = (e) => {
    const cur = document.getElementById("matchupChooser");
    if (cur && !cur.contains(e.target)) closeChooser();
  };
  chooserKeyHandler = (e) => {
    if (e.key === "Escape") closeChooser();
  };
  setTimeout(() => {
    document.addEventListener("click", chooserDocClickHandler);
    document.addEventListener("keydown", chooserKeyHandler);
  }, 0);
}

function closeChooser() {
  if (chooserDocClickHandler) {
    document.removeEventListener("click", chooserDocClickHandler);
    chooserDocClickHandler = null;
  }
  if (chooserKeyHandler) {
    document.removeEventListener("keydown", chooserKeyHandler);
    chooserKeyHandler = null;
  }
  const existing = document.getElementById("matchupChooser");
  if (existing) existing.remove();
}

function pickGame() {
  const pool = getViaplayGames();
  if (pool.length === 0) return;
  let chosen;
  if (pool.length === 1) {
    chosen = pool[0];
  } else {
    do {
      chosen = pool[Math.floor(Math.random() * pool.length)];
    } while (chosen.id === state.lastPickedPoolId);
  }
  state.lastPickedPoolId = chosen.id;
  state.pickedId = chosen.id;
  renderGames();
  renderPick();
  updatePickButtons();
}

async function fetchGames() {
  const date = getHelsinkiDateString();
  const url = `${NHL_API_BASE}?date=${date}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.games = Array.isArray(data.games) ? data.games : [];
    state.error = null;
  } catch (err) {
    state.games = [];
    state.error = (err && err.message) ? err.message : "Verkkovirhe";
  } finally {
    state.loading = false;
  }
}

async function init() {
  loadSelections();
  renderDate();
  renderStatus();
  renderTeamGrid();
  renderGames();
  renderPick();
  updatePickButtons();

  els.pickBtn.addEventListener("click", pickGame);
  els.repickBtn.addEventListener("click", pickGame);

  await fetchGames();
  const pool = getViaplayGames();
  if (state.pickedId && !pool.some((g) => g.id === state.pickedId)) {
    state.pickedId = null;
    state.lastPickedPoolId = null;
  }
  renderStatus();
  renderTeamGrid();
  renderGames();
  renderPick();
  updatePickButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
