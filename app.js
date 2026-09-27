"use strict";

const NHL_API_BASE = "/api/score";
const LOGO_BASE = "https://assets.nhle.com/logos/nhl/svg";
const TIMEZONE = "Europe/Helsinki";

const els = {
  dateLabel: document.getElementById("dateLabel"),
  status: document.getElementById("status"),
  gamesList: document.getElementById("gamesList"),
  pickBtn: document.getElementById("pickBtn"),
  repickBtn: document.getElementById("repickBtn"),
  pickPanel: document.getElementById("pickPanel"),
  pickContent: document.getElementById("pickContent"),
};

const state = {
  games: [],
  pickedId: null,
  lastPickIndex: null,
  loading: true,
  error: null,
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

function renderDate() {
  els.dateLabel.textContent = formatHelsinkiDateLong();
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
  const list = els.gamesList;
  list.innerHTML = "";
  for (const g of state.games) {
    const info = describeState(g.gameState);
    const li = document.createElement("li");
    li.className = "game-card";
    if (info.cls) li.classList.add(info.cls);
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
  const hasPick = state.pickedId !== null && state.games.some((g) => g.id === state.pickedId);
  if (!hasPick) {
    els.pickPanel.hidden = true;
    els.repickBtn.disabled = state.games.length === 0;
    return;
  }
  els.repickBtn.disabled = false;
  const g = state.games.find((x) => x.id === state.pickedId);
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
  const hasGames = state.games.length > 0;
  const hasPick = state.pickedId !== null;
  els.pickBtn.disabled = !hasGames;
  els.repickBtn.disabled = !hasGames || !hasPick;
}

function pickGame() {
  if (state.games.length === 0) return;
  let idx;
  if (state.games.length === 1) {
    idx = 0;
  } else {
    do {
      idx = Math.floor(Math.random() * state.games.length);
    } while (idx === state.lastPickIndex);
  }
  state.lastPickIndex = idx;
  state.pickedId = state.games[idx].id;
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
  renderDate();
  renderStatus();
  renderGames();
  renderPick();
  updatePickButtons();

  els.pickBtn.addEventListener("click", pickGame);
  els.repickBtn.addEventListener("click", pickGame);

  await fetchGames();
  renderStatus();
  renderGames();
  renderPick();
  updatePickButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
