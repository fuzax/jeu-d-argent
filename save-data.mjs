const STORAGE_KEYS = {
  balance: "la-chance-balance",
  stats: "la-chance-stats",
  history: "la-chance-history",
  missions: "la-chance-missions",
  achievements: "la-chance-achievements",
  leaderboard: "la-chance-leaderboard",
  preferences: "la-chance-preferences",
  tournament: "la-chance-tournament",
  bonusClaimedOn: "la-chance-bonus-date",
};

const GAME_NAMES = ["Blackjack", "Roulette", "Machines à sous", "Pile ou face", "Dés", "Baccarat", "Hi-Lo", "Keno", "Poker", "Tournoi"];
const MISSION_IDS = ["play", "win", "variety", "play-five", "wager", "special"];
const ACHIEVEMENT_IDS = ["first-game", "ten-games", "five-wins", "all-tables", "net-profit"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const nonNegativeInteger = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const signedInteger = (value, fallback = 0) => Number.isSafeInteger(value) ? value : fallback;

function normalizeStats(value) {
  const stats = value && typeof value === "object" ? value : {};
  const games = nonNegativeInteger(stats.games);
  const wins = Math.min(games, nonNegativeInteger(stats.wins));
  const losses = Math.min(games - wins, nonNegativeInteger(stats.losses));
  const gamesByName = {};
  if (stats.gamesByName && typeof stats.gamesByName === "object" && !Array.isArray(stats.gamesByName)) {
    for (const name of GAME_NAMES) {
      const count = nonNegativeInteger(stats.gamesByName[name]);
      if (count > 0) gamesByName[name] = count;
    }
  }
  return { games, wins, losses, totalWagered: nonNegativeInteger(stats.totalWagered), net: signedInteger(stats.net), gamesByName };
}

function normalizeMissions(value) {
  const missions = value && typeof value === "object" ? value : {};
  return {
    date: typeof missions.date === "string" && DATE_PATTERN.test(missions.date) ? missions.date : "",
    played: nonNegativeInteger(missions.played),
    wins: nonNegativeInteger(missions.wins),
    wagered: nonNegativeInteger(missions.wagered),
    specialWins: nonNegativeInteger(missions.specialWins),
    games: Array.isArray(missions.games) ? [...new Set(missions.games.filter((game) => GAME_NAMES.includes(game)))] : [],
    claimed: Array.isArray(missions.claimed) ? [...new Set(missions.claimed.filter((id) => MISSION_IDS.includes(id)))] : [],
  };
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && GAME_NAMES.includes(entry.game) && typeof entry.detail === "string" && Number.isSafeInteger(entry.net) && typeof entry.time === "string")
    .slice(0, 5)
    .map((entry) => ({ game: entry.game, detail: entry.detail.slice(0, 100), net: entry.net, time: entry.time.slice(0, 24) }));
}

function normalizeLeaderboard(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry.name === "string" && Number.isSafeInteger(entry.score) && entry.score >= 0)
    .slice(0, 20)
    .map((entry) => ({ name: entry.name.trim().slice(0, 14) || "Joueur", score: entry.score }));
}

function normalizePreferences(value) {
  const preferences = value && typeof value === "object" ? value : {};
  return {
    name: typeof preferences.name === "string" ? preferences.name.trim().slice(0, 14) || "Joueur" : "Joueur",
    theme: ["emerald", "wine", "ocean"].includes(preferences.theme) ? preferences.theme : "emerald",
    cardBack: ["classic", "ruby", "ocean"].includes(preferences.cardBack) ? preferences.cardBack : "classic",
    sound: preferences.sound === true,
    animations: preferences.animations !== false,
  };
}

function normalizeTournament(value) {
  const tournament = value && typeof value === "object" ? value : {};
  const round = Number.isInteger(tournament.round) ? Math.min(5, Math.max(0, tournament.round)) : 0;
  return {
    active: tournament.active === true && round < 5,
    round,
    points: Number.isInteger(tournament.points) ? Math.min(10, Math.max(0, tournament.points)) : 0,
    entry: 100,
  };
}

export function createSaveData(state, savedAt = new Date().toISOString()) {
  return {
    format: "la-chance-save",
    version: 1,
    savedAt,
    balance: state.balance,
    stats: state.stats,
    history: state.history,
    missions: state.missions,
    achievements: state.achievements,
    leaderboard: state.leaderboard,
    preferences: state.preferences,
    tournament: state.tournament,
    bonusClaimedOn: state.bonusClaimedOn,
  };
}

export function normalizeSaveData(data) {
  if (!data || data.format !== "la-chance-save" || data.version !== 1) throw new TypeError("Ce fichier n’est pas une sauvegarde La Chance reconnue.");
  if (!Number.isSafeInteger(data.balance) || data.balance < 0) throw new TypeError("Le solde de la sauvegarde est invalide.");

  const bonusClaimedOn = typeof data.bonusClaimedOn === "string" && DATE_PATTERN.test(data.bonusClaimedOn) ? data.bonusClaimedOn : "";
  const values = {
    balance: String(data.balance),
    stats: JSON.stringify(normalizeStats(data.stats)),
    history: JSON.stringify(normalizeHistory(data.history)),
    missions: JSON.stringify(normalizeMissions(data.missions)),
    achievements: JSON.stringify(Array.isArray(data.achievements) ? [...new Set(data.achievements.filter((id) => ACHIEVEMENT_IDS.includes(id)))] : []),
    leaderboard: JSON.stringify(normalizeLeaderboard(data.leaderboard)),
    preferences: JSON.stringify(normalizePreferences(data.preferences)),
    tournament: JSON.stringify(normalizeTournament(data.tournament)),
    bonusClaimedOn,
  };
  return Object.entries(STORAGE_KEYS).map(([field, key]) => [key, values[field]]);
}
