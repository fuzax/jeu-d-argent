import { bestPokerHand, calculateKenoPayout, calculateSlotPayout, comparePokerHands, tournamentReward } from "./game-rules.mjs";
import { createSaveData, normalizeSaveData } from "./save-data.mjs";

const STARTING_BALANCE = 2500;
const DAILY_BONUS = 250;
const HISTORY_LIMIT = 5;
const MISSIONS = [
  { id: "play", title: "Jouer 3 parties", target: 3, reward: 100 },
  { id: "win", title: "Remporter 2 parties", target: 2, reward: 150 },
  { id: "variety", title: "Essayer 3 jeux différents", target: 3, reward: 200 },
  { id: "play-five", title: "Jouer 5 parties", target: 5, reward: 100 },
  { id: "wager", title: "Miser 500 crédits au total", target: 500, reward: 200 },
  { id: "special", title: "Gagner au poker ou au tournoi", target: 1, reward: 250 },
];
const ACHIEVEMENTS = [
  { id: "first-game", title: "Première partie", icon: "♠", unlocked: (stats) => stats.games >= 1 },
  { id: "ten-games", title: "Habitué de la salle", icon: "✳", unlocked: (stats) => stats.games >= 10 },
  { id: "five-wins", title: "Cinq victoires", icon: "♛", unlocked: (stats) => stats.wins >= 5 },
  { id: "all-tables", title: "Grand tour", icon: "◎", unlocked: (stats) => Object.keys(stats.gamesByName).length >= 10 },
  { id: "net-profit", title: "Bilan positif de 1 000", icon: "◆", unlocked: (stats) => stats.net >= 1000 },
];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SLOT_SYMBOLS = ["🍒", "7", "◆", "♠", "🍋", "★"];

const state = {
  balance: loadBalance(),
  stats: loadStats(),
  history: loadHistory(),
  missions: loadMissions(),
  achievements: loadAchievements(),
  leaderboard: loadLeaderboard(),
  preferences: loadPreferences(),
  tournament: loadTournament(),
  bonusClaimedOn: loadBonusClaim(),
  game: "blackjack",
  blackjack: { phase: "ready", player: [], dealer: [], bet: 0, totalWager: 0, insuranceBet: 0, hitCount: 0 },
  roulettePick: { type: "outside", value: "red", label: "Rouge" },
  rouletteBusy: false,
  slotsBusy: false,
  coinPick: "heads",
  dicePick: "low",
  baccaratPick: "player",
  hiloPick: "higher",
  hiloCurrent: 2 + Math.floor(Math.random() * 13),
  kenoPicks: [],
  soundContext: null,
};

const money = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const balanceElement = document.querySelector("#balance");
const toastElement = document.querySelector("#toast");
let toastTimer;

function loadBalance() {
  try {
    const storedBalance = localStorage.getItem("la-chance-balance");
    if (storedBalance === null) return STARTING_BALANCE;
    const saved = Number(storedBalance);
    return Number.isSafeInteger(saved) && saved >= 0 ? saved : STARTING_BALANCE;
  } catch {
    return STARTING_BALANCE;
  }
}

function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-stats") || "{}");
    const count = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    return {
      games: count(saved.games),
      wins: count(saved.wins),
      losses: count(saved.losses),
      totalWagered: count(saved.totalWagered),
      net: Number.isFinite(saved.net) ? Math.trunc(saved.net) : 0,
      gamesByName: saved.gamesByName && typeof saved.gamesByName === "object" ? saved.gamesByName : {},
    };
  } catch {
    return { games: 0, wins: 0, losses: 0, totalWagered: 0, net: 0, gamesByName: {} };
  }
}

function loadMissions() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-missions") || "null");
    if (!saved || saved.date !== localDateKey()) return { date: localDateKey(), played: 0, wins: 0, wagered: 0, specialWins: 0, games: [], claimed: [] };
    return {
      date: saved.date,
      played: Number.isFinite(saved.played) ? Math.max(0, saved.played) : 0,
      wins: Number.isFinite(saved.wins) ? Math.max(0, saved.wins) : 0,
      wagered: Number.isFinite(saved.wagered) ? Math.max(0, saved.wagered) : 0,
      specialWins: Number.isFinite(saved.specialWins) ? Math.max(0, saved.specialWins) : 0,
      games: Array.isArray(saved.games) ? saved.games.filter((game) => typeof game === "string") : [],
      claimed: Array.isArray(saved.claimed) ? saved.claimed.filter((id) => MISSIONS.some((mission) => mission.id === id)) : [],
    };
  } catch {
    return { date: localDateKey(), played: 0, wins: 0, wagered: 0, specialWins: 0, games: [], claimed: [] };
  }
}

function loadAchievements() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-achievements") || "[]");
    return Array.isArray(saved) ? saved.filter((id) => ACHIEVEMENTS.some((achievement) => achievement.id === id)) : [];
  } catch {
    return [];
  }
}

function loadLeaderboard() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-leaderboard") || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((entry) => entry && typeof entry.name === "string" && Number.isFinite(entry.score) && entry.score >= 0).slice(0, 20);
  } catch {
    return [];
  }
}

function loadPreferences() {
  const defaults = { name: "Joueur", theme: "emerald", cardBack: "classic", sound: false, animations: true };
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-preferences") || "{}");
    return {
      name: typeof saved.name === "string" ? saved.name.slice(0, 14) : defaults.name,
      theme: ["emerald", "wine", "ocean"].includes(saved.theme) ? saved.theme : defaults.theme,
      cardBack: ["classic", "ruby", "ocean"].includes(saved.cardBack) ? saved.cardBack : defaults.cardBack,
      sound: saved.sound === true,
      animations: saved.animations !== false,
    };
  } catch {
    return defaults;
  }
}

function loadTournament() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-tournament") || "null");
    if (!saved || typeof saved.active !== "boolean") return { active: false, round: 0, points: 0, entry: 100 };
    return {
      active: saved.active && saved.round < 5,
      round: Number.isInteger(saved.round) ? Math.min(5, Math.max(0, saved.round)) : 0,
      points: Number.isInteger(saved.points) ? Math.max(0, saved.points) : 0,
      entry: 100,
    };
  } catch {
    return { active: false, round: 0, points: 0, entry: 100 };
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem("la-chance-history") || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((entry) => entry && typeof entry.game === "string" && typeof entry.detail === "string" && Number.isFinite(entry.net) && typeof entry.time === "string").slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function loadBonusClaim() {
  try {
    return localStorage.getItem("la-chance-bonus-date") || "";
  } catch {
    return "";
  }
}

function localDateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function writeLocalValue(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function saveBalance() {
  const saved = writeLocalValue("la-chance-balance", String(state.balance));
  if (!saved) showToast("Solde gardé pour cette session, mais non sauvegardé.");
  return saved;
}

function saveActivity() {
  try {
    localStorage.setItem("la-chance-stats", JSON.stringify(state.stats));
    localStorage.setItem("la-chance-history", JSON.stringify(state.history));
  } catch {
    showToast("Votre activité ne peut pas être sauvegardée.");
  }
}

function savePreferences() {
  const saved = writeLocalValue("la-chance-preferences", JSON.stringify(state.preferences));
  if (!saved) showToast("Préférences gardées pour cette session seulement.");
  return saved;
}

function renderBalance() {
  balanceElement.textContent = money.format(state.balance);
  document.querySelectorAll(".bet-input").forEach((input) => {
    input.max = String(state.balance);
  });
  const saved = saveBalance();
  updateLeaderboard();
  return saved;
}

function renderActivity() {
  const { games, wins, totalWagered, net } = state.stats;
  document.querySelector("#gamesPlayed").textContent = money.format(games);
  document.querySelector("#winsCount").textContent = money.format(wins);
  document.querySelector("#totalWagered").textContent = money.format(totalWagered);
  const netElement = document.querySelector("#netResult");
  netElement.textContent = net > 0 ? `+${money.format(net)}` : net < 0 ? `−${money.format(Math.abs(net))}` : "0";
  netElement.classList.toggle("is-positive", net > 0);
  netElement.classList.toggle("is-negative", net < 0);
  document.querySelector("#activityCount").textContent = `${money.format(games)} ${games === 1 ? "PARTIE" : "PARTIES"}`;

  const history = document.querySelector("#activityHistory");
  if (state.history.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Vos parties terminées apparaîtront ici.";
    history.replaceChildren(empty);
    return;
  }

  history.replaceChildren(...state.history.map((entry) => {
    const row = document.createElement("div");
    row.className = "activity-entry";
    const description = document.createElement("div");
    description.className = "activity-entry-main";
    const game = document.createElement("span");
    game.className = "activity-entry-game";
    game.textContent = entry.game;
    const detail = document.createElement("span");
    detail.className = "activity-entry-detail";
    detail.textContent = `${entry.detail} · ${entry.time}`;
    const result = document.createElement("span");
    result.className = `activity-entry-net${entry.net > 0 ? " is-positive" : entry.net < 0 ? " is-negative" : ""}`;
    result.textContent = `${entry.net > 0 ? "+" : entry.net < 0 ? "−" : ""}${money.format(Math.abs(entry.net))} CR`;
    description.append(game, detail);
    row.append(description, result);
    return row;
  }));
}

function renderDailyBonus() {
  const button = document.querySelector("#dailyBonusButton");
  const claimed = state.bonusClaimedOn === localDateKey();
  button.disabled = claimed;
  button.innerHTML = claimed ? "Déjà récupéré <span aria-hidden=\"true\">✓</span>" : "Récupérer <span aria-hidden=\"true\">→</span>";
}

function recordGame(game, detail, wager, payout) {
  const net = payout - wager;
  state.stats.games += 1;
  if (net > 0) state.stats.wins += 1;
  if (net < 0) state.stats.losses += 1;
  state.stats.totalWagered += wager;
  state.stats.net += net;
  state.stats.gamesByName[game] = (state.stats.gamesByName[game] || 0) + 1;
  state.history.unshift({ game, detail, net, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) });
  state.history = state.history.slice(0, HISTORY_LIMIT);
  saveActivity();
  renderActivity();
  updateMissionProgress(game, net > 0, wager);
  updateAchievements();
  playSound(net > 0 ? "win" : net < 0 ? "loss" : "draw");
}

function missionProgress(mission) {
  if (mission.id === "play") return state.missions.played;
  if (mission.id === "win") return state.missions.wins;
  if (mission.id === "variety") return state.missions.games.length;
  if (mission.id === "play-five") return state.missions.played;
  if (mission.id === "wager") return state.missions.wagered;
  return state.missions.specialWins;
}

function renderMissions() {
  document.querySelector("#missionDate").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
  const list = document.querySelector("#missionList");
  list.replaceChildren(...MISSIONS.map((mission) => {
    const progress = Math.min(mission.target, missionProgress(mission));
    const claimed = state.missions.claimed.includes(mission.id);
    const row = document.createElement("div");
    row.className = "mission-row";
    const info = document.createElement("div");
    info.className = "mission-info";
    const title = document.createElement("strong");
    title.textContent = mission.title;
    const status = document.createElement("span");
    status.textContent = claimed ? "Récompense récupérée" : `${progress} / ${mission.target} · +${mission.reward} CR`;
    const meter = document.createElement("progress");
    meter.max = mission.target;
    meter.value = progress;
    info.append(title, status, meter);
    const button = document.createElement("button");
    button.className = "mission-claim";
    button.type = "button";
    button.textContent = claimed ? "✓" : "Récupérer";
    button.disabled = claimed || progress < mission.target;
    button.setAttribute("aria-label", claimed ? `${mission.title}, récompense récupérée` : `Récupérer ${mission.reward} crédits pour ${mission.title}`);
    button.addEventListener("click", () => claimMission(mission.id));
    row.append(info, button);
    return row;
  }));
}

function updateMissionProgress(game, won, wager) {
  if (state.missions.date !== localDateKey()) state.missions = { date: localDateKey(), played: 0, wins: 0, wagered: 0, specialWins: 0, games: [], claimed: [] };
  state.missions.played += 1;
  if (won) state.missions.wins += 1;
  state.missions.wagered += wager;
  if (won && ["Poker", "Tournoi"].includes(game)) state.missions.specialWins += 1;
  if (!state.missions.games.includes(game)) state.missions.games.push(game);
  if (!writeLocalValue("la-chance-missions", JSON.stringify(state.missions))) showToast("Progression des missions non sauvegardée sur cet appareil.");
  renderMissions();
}

function claimMission(id) {
  const mission = MISSIONS.find((item) => item.id === id);
  if (!mission || state.missions.claimed.includes(id) || missionProgress(mission) < mission.target) return;
  const previousMissions = JSON.stringify(state.missions);
  const claimed = [...state.missions.claimed, id];
  const newBalance = state.balance + mission.reward;
  if (!Number.isSafeInteger(newBalance) || !writeLocalValue("la-chance-missions", JSON.stringify({ ...state.missions, claimed }))) {
    showToast("Récompense non récupérée : sauvegarde indisponible.");
    return;
  }
  if (!writeLocalValue("la-chance-balance", String(newBalance))) {
    writeLocalValue("la-chance-missions", previousMissions);
    showToast("Récompense non récupérée : solde impossible à sauvegarder.");
    return;
  }
  state.missions.claimed = claimed;
  state.balance = newBalance;
  renderBalance();
  renderMissions();
  showToast(`Mission accomplie : +${mission.reward} crédits !`);
  playSound("reward");
}

function updateAchievements() {
  const newlyUnlocked = ACHIEVEMENTS.filter((item) => !state.achievements.includes(item.id) && item.unlocked(state.stats));
  if (newlyUnlocked.length === 0) return;
  state.achievements.push(...newlyUnlocked.map((item) => item.id));
  const saved = writeLocalValue("la-chance-achievements", JSON.stringify(state.achievements));
  renderAchievements();
  showToast(saved ? `Nouveau succès : ${newlyUnlocked[0].title} !` : `Succès obtenu pour cette session : ${newlyUnlocked[0].title}.`);
}

function renderAchievements() {
  document.querySelector("#achievementCount").textContent = `${state.achievements.length} / ${ACHIEVEMENTS.length}`;
  const list = document.querySelector("#achievementList");
  list.replaceChildren(...ACHIEVEMENTS.map((achievement) => {
    const unlocked = state.achievements.includes(achievement.id);
    const row = document.createElement("div");
    row.className = `achievement-row${unlocked ? " is-unlocked" : ""}`;
    const icon = document.createElement("span");
    icon.className = "achievement-icon";
    icon.textContent = unlocked ? achievement.icon : "·";
    const title = document.createElement("span");
    title.textContent = achievement.title;
    const marker = document.createElement("span");
    marker.className = "achievement-marker";
    marker.textContent = unlocked ? "OBTENU" : "À DÉBLOQUER";
    row.append(icon, title, marker);
    return row;
  }));
}

function updateLeaderboard() {
  const name = (state.preferences.name || "Joueur").trim().slice(0, 14) || "Joueur";
  let entry = state.leaderboard.find((item) => item.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"));
  if (!entry) {
    entry = { name, score: state.balance };
    state.leaderboard.push(entry);
  } else {
    entry.name = name;
    entry.score = Math.max(entry.score, state.balance);
  }
  state.leaderboard.sort((left, right) => right.score - left.score);
  state.leaderboard = state.leaderboard.slice(0, 20);
  try {
    localStorage.setItem("la-chance-leaderboard", JSON.stringify(state.leaderboard));
  } catch {
    showToast("Le classement local n’a pas pu être sauvegardé.");
  }
  renderLeaderboard();
}

function renderLeaderboard() {
  const list = document.querySelector("#leaderboardList");
  if (state.leaderboard.length === 0) {
    list.innerHTML = "<li class=\"leaderboard-empty\">Jouez pour inscrire un record.</li>";
    return;
  }
  list.replaceChildren(...state.leaderboard.slice(0, 5).map((entry, index) => {
    const row = document.createElement("li");
    row.className = "leaderboard-row";
    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = entry.name;
    const score = document.createElement("strong");
    score.textContent = `${money.format(entry.score)} CR`;
    row.append(rank, name, score);
    return row;
  }));
}

function applyPreferences() {
  document.body.dataset.tableTheme = state.preferences.theme;
  document.body.dataset.cardBack = state.preferences.cardBack;
  document.body.classList.toggle("no-animations", !state.preferences.animations);
  document.querySelector("#playerName").value = state.preferences.name;
  document.querySelector("#tableTheme").value = state.preferences.theme;
  document.querySelector("#cardBack").value = state.preferences.cardBack;
  document.querySelector("#soundToggle").checked = state.preferences.sound;
  document.querySelector("#animationsToggle").checked = state.preferences.animations;
}

function playSound(type) {
  if (!state.preferences.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    state.soundContext ||= new AudioContext();
    const oscillator = state.soundContext.createOscillator();
    const volume = state.soundContext.createGain();
    const frequencies = { win: 660, loss: 190, draw: 380, reward: 880 };
    oscillator.frequency.value = frequencies[type] || 440;
    oscillator.type = "sine";
    volume.gain.setValueAtTime(0.08, state.soundContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, state.soundContext.currentTime + 0.18);
    oscillator.connect(volume);
    volume.connect(state.soundContext.destination);
    oscillator.start();
    oscillator.stop(state.soundContext.currentTime + 0.18);
  } catch {
    state.preferences.sound = false;
    document.querySelector("#soundToggle").checked = false;
  }
}

function claimDailyBonus() {
  if (state.bonusClaimedOn === localDateKey()) return;
  const today = localDateKey();
  const newBalance = state.balance + DAILY_BONUS;
  if (!Number.isSafeInteger(newBalance) || !writeLocalValue("la-chance-bonus-date", today)) {
    showToast("Bonus non récupéré : sauvegarde indisponible.");
    return;
  }
  if (!writeLocalValue("la-chance-balance", String(newBalance))) {
    writeLocalValue("la-chance-bonus-date", state.bonusClaimedOn);
    showToast("Bonus non récupéré : solde impossible à sauvegarder.");
    return;
  }
  state.bonusClaimedOn = today;
  state.balance = newBalance;
  renderBalance();
  renderDailyBonus();
  showToast("250 crédits ajoutés à votre solde.");
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("is-visible"), 2600);
}

function readBet(input) {
  const bet = Math.floor(Number(input.value));
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    showToast("La mise minimum est de 1 crédit.");
    input.focus();
    return null;
  }
  if (bet > state.balance) {
    showToast("Votre mise dépasse votre solde.");
    input.focus();
    return null;
  }
  input.value = String(bet);
  return bet;
}

function changeBalance(amount) {
  const nextBalance = state.balance + amount;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    showToast("Cette opération dépasse la limite de crédits autorisée.");
    return false;
  }
  state.balance = nextBalance;
  return renderBalance();
}

function setGame(game) {
  state.game = game;
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.game === game;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".game-view").forEach((view) => {
    const active = view.id === `${game}View`;
    view.classList.toggle("is-visible", active);
    view.hidden = !active;
  });
}

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isNatural(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function drawCard() {
  return { rank: RANKS[Math.floor(Math.random() * RANKS.length)], suit: SUITS[Math.floor(Math.random() * SUITS.length)] };
}

function makeCardElement(card, hidden = false) {
  const element = document.createElement("div");
  element.className = `playing-card${hidden ? " is-hidden" : ""}${["♥", "♦"].includes(card.suit) ? " is-red" : ""}`;
  if (hidden) return element;
  element.innerHTML = `<span class="card-corner">${card.rank}<small>${card.suit}</small></span><span class="card-center" aria-hidden="true">${card.suit}</span><span class="card-corner card-bottom" aria-hidden="true">${card.rank}<small>${card.suit}</small></span>`;
  element.setAttribute("aria-label", `${card.rank} ${card.suit}`);
  return element;
}

function renderHand(hand, container, hideHoleCard = false) {
  container.replaceChildren(...hand.map((card, index) => makeCardElement(card, hideHoleCard && index === 1)));
}

function renderBlackjack() {
  const game = state.blackjack;
  const playerCards = document.querySelector("#playerCards");
  const dealerCards = document.querySelector("#dealerCards");
  const waitingForInsurance = game.phase === "insurance";
  const dealerHoleIsHidden = game.phase === "player" || waitingForInsurance;
  renderHand(game.player, playerCards);
  renderHand(game.dealer, dealerCards, dealerHoleIsHidden);
  document.querySelector("#playerTotal").textContent = game.player.length ? String(handValue(game.player)) : "";
  document.querySelector("#dealerTotal").textContent = game.dealer.length ? String(dealerHoleIsHidden ? cardValue(game.dealer[0]) : handValue(game.dealer)) : "";

  const isPlaying = game.phase === "player";
  document.querySelector("#dealButton").hidden = isPlaying || waitingForInsurance;
  document.querySelectorAll(".blackjack-actions").forEach((button) => button.remove());
  const actionGroup = document.querySelector("#blackjackActions");
  if (waitingForInsurance) {
    const cannotInsure = state.balance < game.insuranceBet;
    actionGroup.innerHTML = `<button class="primary-button blackjack-actions" id="insuranceButton" type="button" ${cannotInsure ? "disabled" : ""}>Assurer · ${money.format(game.insuranceBet)} CR</button><button class="secondary-button blackjack-actions" id="skipInsuranceButton" type="button">Continuer</button>`;
    document.querySelector("#insuranceButton").addEventListener("click", takeInsurance);
    document.querySelector("#skipInsuranceButton").addEventListener("click", declineInsurance);
  } else if (isPlaying) {
    actionGroup.innerHTML = '<button class="secondary-button blackjack-actions" id="hitButton" type="button">Tirer <span aria-hidden="true">＋</span></button><button class="secondary-button blackjack-actions" id="standButton" type="button">Rester</button>';
    if (game.hitCount === 0 && state.balance >= game.bet) {
      actionGroup.insertAdjacentHTML("beforeend", '<button class="primary-button blackjack-actions" id="doubleButton" type="button">Doubler <span aria-hidden="true">×2</span></button>');
    }
    document.querySelector("#hitButton").addEventListener("click", hit);
    document.querySelector("#standButton").addEventListener("click", stand);
    document.querySelector("#doubleButton")?.addEventListener("click", doubleDown);
  } else {
    actionGroup.replaceChildren();
    document.querySelector("#dealButton").hidden = false;
  }

  document.querySelector("#blackjackStatus").textContent = waitingForInsurance ? "CHOIX D’ASSURANCE" : isPlaying ? "À VOUS DE JOUER" : game.phase === "over" ? "FIN DE LA MANCHE" : "À VOUS DE DISTRIBUER";
  document.querySelector("#blackjackMessage").textContent = game.message || (waitingForInsurance ? `Le croupier montre un As. Assurance : ${money.format(game.insuranceBet)} crédits.` : isPlaying ? "Tirer une carte ou rester ?" : "La table est à vous.");
}

function deal() {
  if (state.blackjack.phase === "player" || state.blackjack.phase === "insurance") return;
  const input = document.querySelector("#blackjackBet");
  const bet = readBet(input);
  if (bet === null) return;
  state.blackjack = { phase: "player", player: [drawCard(), drawCard()], dealer: [drawCard(), drawCard()], bet, totalWager: bet, insuranceBet: 0, insuranceTaken: false, hitCount: 0, message: "" };
  changeBalance(-bet);
  if (state.blackjack.dealer[0].rank === "A") {
    state.blackjack.phase = "insurance";
    state.blackjack.insuranceBet = Math.ceil(bet / 2);
    renderBlackjack();
    return;
  }
  renderBlackjack();
  resolveOpening();
}

function takeInsurance() {
  const game = state.blackjack;
  if (game.phase !== "insurance" || state.balance < game.insuranceBet) return;
  changeBalance(-game.insuranceBet);
  game.totalWager += game.insuranceBet;
  game.insuranceTaken = true;
  resolveOpening();
}

function declineInsurance() {
  if (state.blackjack.phase === "insurance") resolveOpening();
}

function resolveOpening() {
  const game = state.blackjack;
  const playerNatural = isNatural(game.player);
  const dealerNatural = isNatural(game.dealer);
  if (playerNatural || dealerNatural) {
    const insurancePayout = dealerNatural && game.insuranceTaken ? game.insuranceBet * 3 : 0;
    if (playerNatural && dealerNatural) finishBlackjack(game.insuranceTaken ? "Égalité. Assurance gagnante !" : "Égalité. Votre mise vous est rendue.", game.bet + insurancePayout);
    else if (playerNatural) finishBlackjack("Blackjack ! Belle main.", game.bet + Math.floor(game.bet * 1.5));
    else finishBlackjack(insurancePayout ? "Le croupier a un blackjack. Assurance gagnante !" : "Le croupier a un blackjack.", insurancePayout);
    return;
  }
  game.phase = "player";
  game.message = "Tirer une carte ou rester ?";
  renderBlackjack();
}

function hit() {
  const game = state.blackjack;
  if (game.phase !== "player") return;
  game.player.push(drawCard());
  game.hitCount += 1;
  if (handValue(game.player) > 21) finishBlackjack("Plus de 21. La manche est au croupier.", 0);
  else renderBlackjack();
}

function stand() {
  const game = state.blackjack;
  if (game.phase !== "player") return;
  while (handValue(game.dealer) < 17) game.dealer.push(drawCard());
  const player = handValue(game.player);
  const dealer = handValue(game.dealer);
  if (dealer > 21 || player > dealer) finishBlackjack(dealer > 21 ? "Le croupier dépasse 21. Vous gagnez !" : "Votre main l’emporte !", game.bet * 2);
  else if (player === dealer) finishBlackjack("Égalité. Votre mise vous est rendue.", game.bet);
  else finishBlackjack("Le croupier l’emporte cette fois.", 0);
}

function doubleDown() {
  const game = state.blackjack;
  if (game.phase !== "player" || game.hitCount !== 0 || state.balance < game.bet) return;
  changeBalance(-game.bet);
  game.totalWager += game.bet;
  game.bet *= 2;
  game.player.push(drawCard());
  game.hitCount += 1;
  if (handValue(game.player) > 21) finishBlackjack("Plus de 21. La manche est au croupier.", 0);
  else stand();
}

function finishBlackjack(message, payout) {
  const game = state.blackjack;
  if (game.phase !== "player" && game.phase !== "insurance") return;
  const wager = game.totalWager;
  game.phase = "over";
  game.message = message;
  changeBalance(payout);
  recordGame("Blackjack", message, wager, payout);
  renderBlackjack();
}

function buildRouletteGrid() {
  const grid = document.querySelector("#numberGrid");
  const zero = document.createElement("button");
  zero.type = "button";
  zero.className = "number-cell zero-number";
  zero.textContent = "0";
  zero.dataset.number = "0";
  grid.append(zero);
  for (let number = 1; number <= 36; number += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `number-cell ${RED_NUMBERS.has(number) ? "red-number" : "black-number"}`;
    cell.textContent = String(number);
    cell.dataset.number = String(number);
    grid.append(cell);
  }
  grid.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-number]");
    if (!cell) return;
    state.roulettePick = { type: "number", value: Number(cell.dataset.number), label: `N° ${cell.dataset.number}` };
    renderRouletteSelection();
  });
}

function renderRouletteSelection() {
  document.querySelectorAll(".outside-bet").forEach((button) => button.classList.toggle("is-selected", state.roulettePick.type === "outside" && button.dataset.bet === state.roulettePick.value));
  document.querySelectorAll(".number-cell").forEach((button) => button.classList.toggle("is-selected", state.roulettePick.type === "number" && Number(button.dataset.number) === state.roulettePick.value));
  document.querySelector("#rouletteSelection").innerHTML = `Sélection : <b>${state.roulettePick.label}</b>`;
}

function outsideBetWins(kind, number) {
  if (kind === "red") return RED_NUMBERS.has(number);
  if (kind === "black") return number > 0 && !RED_NUMBERS.has(number);
  if (kind === "even") return number > 0 && number % 2 === 0;
  if (kind === "odd") return number % 2 === 1;
  if (kind === "low") return number >= 1 && number <= 18;
  return number >= 19 && number <= 36;
}

async function spinRoulette() {
  if (state.rouletteBusy) return;
  const bet = readBet(document.querySelector("#rouletteBet"));
  if (bet === null) return;
  state.rouletteBusy = true;
  changeBalance(-bet);
  document.querySelector("#spinButton").disabled = true;
  document.querySelector("#rouletteStatus").textContent = "LA BILLE TOURNE";
  document.querySelector("#rouletteResult").textContent = "Rien n’est joué…";
  const result = Math.floor(Math.random() * 37);
  const rotations = 720 + Math.floor(Math.random() * 720);
  const wheel = document.querySelector("#rouletteWheel");
  wheel.style.transform = `rotate(${rotations}deg)`;
  await new Promise((resolve) => setTimeout(resolve, 1300));
  document.querySelector("#wheelNumber").textContent = String(result);
  wheel.style.transform = `rotate(${rotations + Math.floor(Math.random() * 30)}deg)`;
  const won = state.roulettePick.type === "number" ? result === state.roulettePick.value : outsideBetWins(state.roulettePick.value, result);
  const payout = won ? bet * (state.roulettePick.type === "number" ? 36 : 2) : 0;
  if (payout) changeBalance(payout);
  const color = result === 0 ? "vert" : RED_NUMBERS.has(result) ? "rouge" : "noir";
  document.querySelector("#rouletteResult").textContent = won ? `Le ${result} ${color} ! Vous remportez ${money.format(payout)} crédits.` : `Le ${result} ${color}. La bille a choisi son camp.`;
  recordGame("Roulette", `N° ${result} ${color}${won ? " · gagné" : " · perdu"}`, bet, payout);
  document.querySelector("#rouletteStatus").textContent = "FIN DU TOUR";
  document.querySelector("#spinButton").disabled = false;
  state.rouletteBusy = false;
}

async function spinSlots() {
  if (state.slotsBusy) return;
  const bet = readBet(document.querySelector("#slotsBet"));
  if (bet === null) return;
  state.slotsBusy = true;
  changeBalance(-bet);
  const button = document.querySelector("#spinSlotsButton");
  button.disabled = true;
  document.querySelector("#slotsStatus").textContent = "LES ROULEAUX TOURNENT";
  document.querySelector("#slotsResult").textContent = "";
  const reels = ["#reelOne", "#reelTwo", "#reelThree"].map((selector) => document.querySelector(selector));
  const results = reels.map(() => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]);
  const animation = setInterval(() => {
    reels.forEach((reel) => { reel.textContent = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)]; });
  }, 90);
  await new Promise((resolve) => setTimeout(resolve, 750));
  clearInterval(animation);
  reels.forEach((reel, index) => { reel.textContent = results[index]; });
  const isTriple = results[0] === results[1] && results[1] === results[2];
  const isPair = !isTriple && new Set(results).size < 3;
  const payout = calculateSlotPayout(bet, results);
  if (payout) changeBalance(payout);
  document.querySelector("#slotsResult").textContent = isTriple ? `Trois symboles ! Vous remportez ${money.format(payout)} crédits.` : isPair ? `Une paire ! ${money.format(payout)} crédits dans votre poche.` : "Pas de combinaison cette fois. Un autre tour ?";
  recordGame("Machines à sous", isTriple ? "Trois symboles" : isPair ? "Une paire" : "Pas de combinaison", bet, payout);
  document.querySelector("#slotsStatus").textContent = "FIN DU TOUR";
  button.disabled = false;
  state.slotsBusy = false;
}

function startInstantBet(inputSelector) {
  const bet = readBet(document.querySelector(inputSelector));
  if (bet === null) return null;
  changeBalance(-bet);
  return bet;
}

function settleInstantBet(game, detail, bet, payout, resultSelector, message) {
  if (payout > 0) changeBalance(payout);
  document.querySelector(resultSelector).textContent = message;
  recordGame(game, detail, bet, payout);
}

function flipCoin() {
  const bet = startInstantBet("#coinBet");
  if (bet === null) return;
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === state.coinPick;
  const label = result === "heads" ? "Pile" : "Face";
  const coin = document.querySelector("#coinDisplay");
  coin.textContent = result === "heads" ? "P" : "F";
  coin.classList.toggle("is-flipped", result === "tails");
  settleInstantBet("Pile ou face", `${label}${won ? " · gagné" : " · perdu"}`, bet, won ? bet * 2 : 0, "#coinResult", won ? `${label} ! Vous remportez ${money.format(bet * 2)} crédits.` : `${label} ! Pas cette fois.`);
}

function rollDice() {
  const bet = startInstantBet("#diceBet");
  if (bet === null) return;
  const first = 1 + Math.floor(Math.random() * 6);
  const second = 1 + Math.floor(Math.random() * 6);
  const total = first + second;
  const faces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  document.querySelector("#dieOne").textContent = faces[first];
  document.querySelector("#dieTwo").textContent = faces[second];
  document.querySelector("#diceTotal").textContent = String(total);
  const won = state.dicePick === "seven" ? total === 7 : state.dicePick === "low" ? total >= 2 && total <= 6 : total >= 8 && total <= 12;
  const pushed = total === 7 && state.dicePick !== "seven";
  const payout = pushed ? bet : won ? bet * (state.dicePick === "seven" ? 5 : 2) : 0;
  const detail = `Dés ${first} + ${second} = ${total} · ${pushed ? "égalité" : won ? "gagné" : "perdu"}`;
  const message = pushed ? "Sept ! Votre mise vous est rendue." : won ? `Total ${total} ! Vous remportez ${money.format(payout)} crédits.` : `Total ${total}. La prochaine sera peut-être la bonne.`;
  settleInstantBet("Dés", detail, bet, payout, "#diceResult", message);
}

function drawBaccaratCard() {
  return RANKS[Math.floor(Math.random() * RANKS.length)];
}

function baccaratCardValue(rank) {
  if (rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(rank)) return 0;
  return Number(rank);
}

function baccaratTotal(hand) {
  return hand.reduce((total, rank) => total + baccaratCardValue(rank), 0) % 10;
}

function bankerDraws(bankerTotal, playerThirdCard) {
  if (playerThirdCard === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThirdCard !== 8;
  if (bankerTotal === 4) return playerThirdCard >= 2 && playerThirdCard <= 7;
  if (bankerTotal === 5) return playerThirdCard >= 4 && playerThirdCard <= 7;
  if (bankerTotal === 6) return playerThirdCard === 6 || playerThirdCard === 7;
  return false;
}

function dealBaccarat() {
  const bet = startInstantBet("#baccaratBet");
  if (bet === null) return;
  const player = [drawBaccaratCard(), drawBaccaratCard()];
  const banker = [drawBaccaratCard(), drawBaccaratCard()];
  let playerTotal = baccaratTotal(player);
  let bankerScore = baccaratTotal(banker);
  let playerThirdCard = null;
  if (playerTotal < 8 && bankerScore < 8) {
    if (playerTotal <= 5) {
      playerThirdCard = drawBaccaratCard();
      player.push(playerThirdCard);
      playerTotal = baccaratTotal(player);
    }
    if (bankerDraws(bankerScore, playerThirdCard)) banker.push(drawBaccaratCard());
    bankerScore = baccaratTotal(banker);
  }
  const winner = playerTotal > bankerScore ? "player" : bankerScore > playerTotal ? "banker" : "tie";
  const payouts = { player: bet * 2, banker: Math.floor(bet * 1.95), tie: bet * 9 };
  const payout = winner === state.baccaratPick ? payouts[winner] : 0;
  document.querySelector("#baccaratPlayerCards").textContent = player.join(" · ");
  document.querySelector("#baccaratBankerCards").textContent = banker.join(" · ");
  document.querySelector("#baccaratPlayerTotal").textContent = String(playerTotal);
  document.querySelector("#baccaratBankerTotal").textContent = String(bankerScore);
  const winnerLabel = { player: "Joueur", banker: "Banquier", tie: "Égalité" }[winner];
  const pickedLabel = { player: "Joueur", banker: "Banquier", tie: "Égalité" }[state.baccaratPick];
  settleInstantBet("Baccarat", `${winnerLabel} ${playerTotal}–${bankerScore} ${winner === state.baccaratPick ? "· gagné" : "· perdu"}`, bet, payout, "#baccaratResult", winner === state.baccaratPick ? `${winnerLabel} gagne ! ${money.format(payout)} crédits versés.` : `${winnerLabel} gagne (${playerTotal}–${bankerScore}). Votre choix : ${pickedLabel}.`);
}

function hiloRankLabel(rank) {
  return ({ 11: "V", 12: "D", 13: "R", 14: "A" })[rank] || String(rank);
}

function guessHilo() {
  const bet = startInstantBet("#hiloBet");
  if (bet === null) return;
  const previous = state.hiloCurrent;
  const next = 2 + Math.floor(Math.random() * 13);
  const won = state.hiloPick === "higher" ? next > previous : next < previous;
  const tied = next === previous;
  const payout = tied ? bet : won ? bet * 2 : 0;
  document.querySelector("#hiloCurrentCard").textContent = hiloRankLabel(previous);
  document.querySelector("#hiloNextCard").textContent = hiloRankLabel(next);
  document.querySelector("#hiloNextCard").classList.remove("hilo-card-hidden");
  state.hiloCurrent = next;
  const message = tied ? "Même carte : votre mise vous est rendue." : won ? `Bonne intuition ! ${money.format(payout)} crédits versés.` : "La carte est sortie dans l’autre sens.";
  settleInstantBet("Hi-Lo", `Carte ${hiloRankLabel(previous)} → ${hiloRankLabel(next)} · ${tied ? "égalité" : won ? "gagné" : "perdu"}`, bet, payout, "#hiloResult", message);
}

function renderKenoSelection() {
  document.querySelectorAll(".keno-number").forEach((button) => button.classList.toggle("is-selected", state.kenoPicks.includes(Number(button.dataset.number))));
  document.querySelector("#kenoSelection").textContent = `${state.kenoPicks.length} / 5 numéros choisis`;
  document.querySelector("#drawKenoButton").disabled = state.kenoPicks.length !== 5;
}

function buildKenoGrid() {
  const grid = document.querySelector("#kenoGrid");
  for (let number = 1; number <= 20; number += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "keno-number";
    button.textContent = String(number);
    button.dataset.number = String(number);
    grid.append(button);
  }
  grid.addEventListener("click", (event) => {
    const button = event.target.closest(".keno-number");
    if (!button) return;
    const number = Number(button.dataset.number);
    if (state.kenoPicks.includes(number)) state.kenoPicks = state.kenoPicks.filter((pick) => pick !== number);
    else if (state.kenoPicks.length < 5) state.kenoPicks.push(number);
    else showToast("Choisissez cinq numéros au maximum.");
    renderKenoSelection();
  });
  renderKenoSelection();
}

function drawKeno() {
  if (state.kenoPicks.length !== 5) return;
  const bet = startInstantBet("#kenoBet");
  if (bet === null) return;
  const draw = new Set();
  while (draw.size < 5) draw.add(1 + Math.floor(Math.random() * 20));
  const hits = state.kenoPicks.filter((number) => draw.has(number)).length;
  const payout = calculateKenoPayout(bet, hits);
  document.querySelectorAll(".keno-number").forEach((button) => button.classList.toggle("is-hit", draw.has(Number(button.dataset.number))));
  const drawnNumbers = [...draw].sort((left, right) => left - right).join(", ");
  const message = hits < 2 ? `${hits} bon numéro. Pas de gain cette fois. Tirage : ${drawnNumbers}.` : `${hits} bons numéros ! ${money.format(payout)} crédits versés. Tirage : ${drawnNumbers}.`;
  settleInstantBet("Keno", `${hits} bon${hits === 1 ? "" : "s"} numéro${hits === 1 ? "" : "s"} · ${drawnNumbers}`, bet, payout, "#kenoResult", message);
}

function selectChoice(selector, attribute, value) {
  document.querySelectorAll(selector).forEach((button) => button.classList.toggle("is-selected", button.getAttribute(attribute) === value));
}

function saveTournament() {
  const saved = writeLocalValue("la-chance-tournament", JSON.stringify(state.tournament));
  if (!saved) showToast("Tournoi gardé pour cette session seulement.");
  return saved;
}

function renderTournament() {
  const tournament = state.tournament;
  document.querySelector("#tournamentRound").textContent = `${tournament.round} / 5 LANCERS`;
  document.querySelector("#tournamentPoints").textContent = String(tournament.points);
  document.querySelector("#tournamentStatus").textContent = tournament.active ? "TOURNOI EN COURS" : tournament.round === 5 ? "TOURNOI TERMINÉ" : "INSCRIPTION : 100 CR";
  document.querySelector("#tournamentButton").innerHTML = tournament.active ? "Lancer les dés <span>→</span>" : tournament.round === 5 ? "Rejouer <span>→</span>" : "Commencer <span>→</span>";
}

function playTournament() {
  const tournament = state.tournament;
  if (!tournament.active) {
    if (state.balance < tournament.entry) {
      showToast("Il vous faut 100 crédits pour participer.");
      return;
    }
    changeBalance(-tournament.entry);
    state.tournament = { active: true, round: 0, points: 0, entry: 100 };
    document.querySelector("#tournamentResult").textContent = "Inscription validée. Lancez les dés pour la première manche.";
  } else {
    const first = 1 + Math.floor(Math.random() * 6);
    const second = 1 + Math.floor(Math.random() * 6);
    const total = first + second;
    const earned = total === 7 ? 2 : total >= 8 ? 1 : 0;
    tournament.round += 1;
    tournament.points += earned;
    document.querySelector("#tournamentDice").innerHTML = `${first} <span>+</span> ${second} <span>=</span> ${total}`;
    if (tournament.round === 5) {
      tournament.active = false;
      const payout = tournamentReward(tournament.points);
      changeBalance(payout);
      document.querySelector("#tournamentResult").textContent = payout ? `Épreuve terminée : ${tournament.points} points. Vous remportez ${money.format(payout)} crédits !` : `Épreuve terminée : ${tournament.points} point${tournament.points === 1 ? "" : "s"}. Pas de récompense cette fois.`;
      recordGame("Tournoi", `${tournament.points} points sur 10`, tournament.entry, payout);
    } else {
      document.querySelector("#tournamentResult").textContent = total === 7 ? `Un sept : +2 points ! Manche ${tournament.round} sur 5.` : total >= 8 ? `Total ${total} : +1 point. Manche ${tournament.round} sur 5.` : `Total ${total} : aucun point. Manche ${tournament.round} sur 5.`;
    }
    playSound(earned > 0 ? "win" : "draw");
  }
  saveTournament();
  renderTournament();
}

function makePokerDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function dealPoker() {
  const bet = startInstantBet("#pokerBet");
  if (bet === null) return;
  const deck = makePokerDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];
  const community = deck.splice(0, 5);
  const playerHand = bestPokerHand([...player, ...community]);
  const dealerHand = bestPokerHand([...dealer, ...community]);
  const comparison = comparePokerHands(playerHand, dealerHand);
  const payout = comparison > 0 ? bet * 2 : comparison === 0 ? bet : 0;
  document.querySelector("#pokerPlayerCards").replaceChildren(...player.map((card) => makeCardElement(card)));
  document.querySelector("#pokerDealerCards").replaceChildren(...dealer.map((card) => makeCardElement(card)));
  document.querySelector("#pokerCommunityCards").replaceChildren(...community.map((card) => makeCardElement(card)));
  document.querySelector("#pokerPlayerHand").textContent = playerHand.label;
  document.querySelector("#pokerDealerHand").textContent = dealerHand.label;
  const message = comparison > 0 ? `Votre ${playerHand.label.toLowerCase()} l’emporte ! ${money.format(payout)} crédits versés.` : comparison === 0 ? `Égalité avec ${playerHand.label.toLowerCase()} : mise rendue.` : `Le croupier l’emporte avec ${dealerHand.label.toLowerCase()}.`;
  document.querySelector("#pokerResult").textContent = message;
  document.querySelector("#pokerStatus").textContent = comparison > 0 ? "VOUS GAGNEZ" : comparison === 0 ? "ÉGALITÉ" : "LE CROUPIER GAGNE";
  if (payout > 0) changeBalance(payout);
  recordGame("Poker", `${playerHand.label} contre ${dealerHand.label}`, bet, payout);
}

function exportSave() {
  const data = createSaveData(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `la-chance-${localDateKey()}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.querySelector("#saveStatus").textContent = "Sauvegarde téléchargée.";
}

async function importSaveFile(file) {
  if (!file) return;
  if (file.size > 1_000_000) {
    showToast("Fichier trop volumineux pour une sauvegarde.");
    return;
  }
  let entries;
  try {
    entries = normalizeSaveData(JSON.parse(await file.text()));
  } catch {
    showToast("Fichier de sauvegarde invalide ou illisible.");
    return;
  }
  if (!window.confirm("Importer cette sauvegarde remplacera les données actuelles. Continuer ?")) return;

  let previous;
  try {
    previous = entries.map(([key]) => [key, localStorage.getItem(key)]);
    for (const [key, value] of entries) localStorage.setItem(key, value);
  } catch {
    if (previous) {
      for (const [key, value] of previous) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {
          break;
        }
      }
    }
    showToast("Import annulé : impossible de sauvegarder toutes les données.");
    return;
  }

  document.querySelector("#saveStatus").textContent = "Sauvegarde importée. Rechargement…";
  window.setTimeout(() => window.location.reload(), 300);
}

document.querySelectorAll(".nav-item[data-game]").forEach((button) => button.addEventListener("click", () => setGame(button.dataset.game)));
document.querySelector("#dealButton").addEventListener("click", deal);
document.querySelector("#spinButton").addEventListener("click", spinRoulette);
document.querySelector("#spinSlotsButton").addEventListener("click", spinSlots);
document.querySelector("#flipButton").addEventListener("click", flipCoin);
document.querySelector("#rollDiceButton").addEventListener("click", rollDice);
document.querySelector("#dealBaccaratButton").addEventListener("click", dealBaccarat);
document.querySelector("#guessHiloButton").addEventListener("click", guessHilo);
document.querySelector("#drawKenoButton").addEventListener("click", drawKeno);
document.querySelector("#dealPokerButton").addEventListener("click", dealPoker);
document.querySelector("#tournamentButton").addEventListener("click", playTournament);
document.querySelectorAll("[data-coin-pick]").forEach((button) => button.addEventListener("click", () => {
  state.coinPick = button.dataset.coinPick;
  selectChoice("[data-coin-pick]", "data-coin-pick", state.coinPick);
}));
document.querySelectorAll("[data-dice-pick]").forEach((button) => button.addEventListener("click", () => {
  state.dicePick = button.dataset.dicePick;
  selectChoice("[data-dice-pick]", "data-dice-pick", state.dicePick);
}));
document.querySelectorAll("[data-baccarat-pick]").forEach((button) => button.addEventListener("click", () => {
  state.baccaratPick = button.dataset.baccaratPick;
  selectChoice("[data-baccarat-pick]", "data-baccarat-pick", state.baccaratPick);
}));
document.querySelectorAll("[data-hilo-pick]").forEach((button) => button.addEventListener("click", () => {
  state.hiloPick = button.dataset.hiloPick;
  selectChoice("[data-hilo-pick]", "data-hilo-pick", state.hiloPick);
}));
document.querySelector("#dailyBonusButton").addEventListener("click", claimDailyBonus);
document.querySelector("#clearHistoryButton").addEventListener("click", () => {
  if (state.history.length === 0) return;
  state.history = [];
  saveActivity();
  renderActivity();
  showToast("L’historique récent a été effacé.");
});
document.querySelector("#playerName").addEventListener("change", (event) => {
  state.preferences.name = event.target.value.trim().slice(0, 14) || "Joueur";
  event.target.value = state.preferences.name;
  savePreferences();
  updateLeaderboard();
});
document.querySelector("#tableTheme").addEventListener("change", (event) => {
  state.preferences.theme = event.target.value;
  savePreferences();
  applyPreferences();
});
document.querySelector("#cardBack").addEventListener("change", (event) => {
  state.preferences.cardBack = event.target.value;
  savePreferences();
  applyPreferences();
});
document.querySelector("#soundToggle").addEventListener("change", (event) => {
  state.preferences.sound = event.target.checked;
  savePreferences();
  if (state.preferences.sound) playSound("reward");
});
document.querySelector("#animationsToggle").addEventListener("change", (event) => {
  state.preferences.animations = event.target.checked;
  savePreferences();
  applyPreferences();
});
document.querySelector("#exportSaveButton").addEventListener("click", exportSave);
document.querySelector("#importSaveButton").addEventListener("click", () => document.querySelector("#importSaveInput").click());
document.querySelector("#importSaveInput").addEventListener("change", async (event) => {
  await importSaveFile(event.target.files[0]);
  event.target.value = "";
});
document.querySelectorAll(".outside-bet").forEach((button) => button.addEventListener("click", () => {
  state.roulettePick = { type: "outside", value: button.dataset.bet, label: button.textContent };
  renderRouletteSelection();
}));
document.querySelectorAll(".quick-bets button").forEach((button) => button.addEventListener("click", () => {
  const input = button.closest(".wager-block").querySelector(".bet-input");
  input.value = String(Math.min(state.balance, Math.max(1, Number(input.value) || 0) + Number(button.dataset.add)));
}));
document.querySelectorAll(".bet-input").forEach((input) => input.addEventListener("change", () => {
  const value = Math.floor(Number(input.value));
  if (!Number.isFinite(value) || value < 1) input.value = "1";
  else if (value > state.balance) input.value = String(state.balance);
}));
document.querySelector("#resetButton").addEventListener("click", () => {
  if (!window.confirm("Réinitialiser votre solde à 2 500 crédits ?")) return;
  state.balance = STARTING_BALANCE;
  state.blackjack = { phase: "ready", player: [], dealer: [], bet: 0, hitCount: 0, message: "" };
  renderBalance();
  renderBlackjack();
  showToast("Votre solde est de retour à 2 500 crédits.");
});

buildRouletteGrid();
buildKenoGrid();
renderRouletteSelection();
renderBlackjack();
renderBalance();
renderDailyBonus();
renderActivity();
renderMissions();
renderAchievements();
renderLeaderboard();
applyPreferences();
updateAchievements();
renderTournament();
document.querySelector("#hiloCurrentCard").textContent = hiloRankLabel(state.hiloCurrent);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}