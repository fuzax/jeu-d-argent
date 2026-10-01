import test from "node:test";
import assert from "node:assert/strict";
import {
  bestPokerHand,
  calculateKenoPayout,
  calculateSlotPayout,
  comparePokerHands,
  evaluatePokerHand,
  KENO_MULTIPLIERS,
  tournamentReward,
} from "../game-rules.mjs";
import { createSaveData, normalizeSaveData } from "../save-data.mjs";

const card = (rank, suit) => ({ rank, suit });

function choose(total, count) {
  let result = 1;
  for (let index = 1; index <= count; index += 1) result = result * (total - index + 1) / index;
  return result;
}

test("machines à sous ont un rendement inférieur à 100 %", () => {
  const symbols = ["cerise", "sept", "diamant", "pique", "citron", "etoile"];
  let totalPayout = 0;
  for (const first of symbols) {
    for (const second of symbols) {
      for (const third of symbols) totalPayout += calculateSlotPayout(100, [first, second, third]);
    }
  }
  assert.equal(totalPayout, 20400);
  assert.equal(totalPayout / (symbols.length ** 3 * 100), 204 / 216);
  assert.equal(calculateSlotPayout(100, ["A", "A", "A"]), 400);
  assert.equal(calculateSlotPayout(100, ["A", "A", "B"]), 200);
  assert.equal(calculateSlotPayout(100, ["A", "B", "C"]), 0);
  assert.equal(calculateSlotPayout(Number.MAX_SAFE_INTEGER, ["A", "A", "A"]), 0);
});

test("les gains du keno restent sous la mise moyenne", () => {
  const winningCounts = [0, 0, 2, 4, 15, 100];
  const totalCombinations = choose(20, 5);
  let expectedPayout = 0;
  for (let hits = 0; hits <= 5; hits += 1) {
    expectedPayout += choose(5, hits) * choose(15, 5 - hits) * calculateKenoPayout(1, hits);
  }
  assert.deepEqual(KENO_MULTIPLIERS, winningCounts);
  assert.equal(expectedPayout, 14525);
  assert(expectedPayout / totalCombinations < 1);
  assert.equal(calculateKenoPayout(50, 5), 5000);
  assert.equal(calculateKenoPayout(50, 6), 0);
  assert.equal(calculateKenoPayout(Number.MAX_SAFE_INTEGER, 5), 0);
});

test("tournoi ne distribue pas plus que son droit d’entrée en moyenne", () => {
  let outcomes = new Map([[0, 1]]);
  for (let round = 0; round < 5; round += 1) {
    const next = new Map();
    for (const [score, count] of outcomes) {
      for (const [points, diceWays] of [[0, 15], [2, 6], [1, 15]]) {
        const total = score + points;
        next.set(total, (next.get(total) || 0) + count * diceWays);
      }
    }
    outcomes = next;
  }
  const totalWays = 36 ** 5;
  const expectedPayout = [...outcomes].reduce((sum, [score, ways]) => sum + ways * tournamentReward(score), 0);
  const expectedReturn = expectedPayout / totalWays;
  assert(Math.abs(expectedReturn - 94.24) < 0.01);
  assert(expectedReturn < 100);
  assert.equal(tournamentReward(8), 700);
  assert.equal(tournamentReward(1), 0);
});

test("classe les neuf combinaisons de poker", () => {
  const hands = [
    [card("A", "S"), card("K", "S"), card("Q", "S"), card("J", "S"), card("10", "S")],
    [card("9", "S"), card("9", "H"), card("9", "D"), card("9", "C"), card("A", "S")],
    [card("Q", "S"), card("Q", "H"), card("Q", "D"), card("8", "S"), card("8", "H")],
    [card("A", "H"), card("J", "H"), card("8", "H"), card("5", "H"), card("2", "H")],
    [card("9", "S"), card("8", "H"), card("7", "D"), card("6", "C"), card("5", "S")],
    [card("Q", "S"), card("Q", "H"), card("Q", "D"), card("8", "C"), card("5", "S")],
    [card("K", "S"), card("K", "H"), card("8", "D"), card("8", "C"), card("A", "S")],
    [card("A", "S"), card("A", "H"), card("K", "D"), card("8", "C"), card("5", "S")],
    [card("A", "S"), card("K", "H"), card("10", "D"), card("7", "C"), card("2", "S")],
  ];
  const labels = hands.map((hand) => evaluatePokerHand(hand).label);
  assert.deepEqual(labels, ["Quinte flush", "Carré", "Full", "Couleur", "Quinte", "Brelan", "Double paire", "Paire", "Carte haute"]);
  for (let index = 0; index < hands.length - 1; index += 1) {
    assert(comparePokerHands(evaluatePokerHand(hands[index]), evaluatePokerHand(hands[index + 1])) > 0);
  }
});

test("gère la quinte basse, les kickers et la meilleure main de sept cartes", () => {
  const wheel = evaluatePokerHand([card("A", "S"), card("2", "H"), card("3", "D"), card("4", "C"), card("5", "S")]);
  assert.deepEqual(wheel.score, [4, 5]);

  const pairWithKing = evaluatePokerHand([card("A", "S"), card("A", "H"), card("K", "D"), card("8", "C"), card("5", "S")]);
  const pairWithQueen = evaluatePokerHand([card("A", "D"), card("A", "C"), card("Q", "D"), card("8", "H"), card("5", "C")]);
  assert(comparePokerHands(pairWithKing, pairWithQueen) > 0);

  const sevenCards = [card("A", "S"), card("K", "S"), card("Q", "S"), card("J", "S"), card("10", "S"), card("2", "H"), card("3", "D")];
  assert.equal(bestPokerHand(sevenCards).label, "Quinte flush");
});

test("exporte et restaure une sauvegarde valide", () => {
  const savedAt = "2026-10-01T12:00:00.000Z";
  const state = {
    balance: 2750,
    stats: { games: 4, wins: 2, losses: 2, totalWagered: 300, net: 50, gamesByName: { Poker: 2 } },
    history: [{ game: "Poker", detail: "Paire contre brelan", net: -50, time: "12:00" }],
    missions: { date: "2026-10-01", played: 4, wins: 2, wagered: 300, specialWins: 1, games: ["Poker"], claimed: ["play"] },
    achievements: ["first-game"],
    leaderboard: [{ name: "Joueur", score: 2750 }],
    preferences: { name: "Joueur", theme: "ocean", cardBack: "ruby", sound: true, animations: false },
    tournament: { active: true, round: 2, points: 3, entry: 100 },
    bonusClaimedOn: "2026-10-01",
  };
  const exported = createSaveData(state, savedAt);
  const values = Object.fromEntries(normalizeSaveData(exported));
  assert.equal(exported.savedAt, savedAt);
  assert.equal(values["la-chance-balance"], "2750");
  assert.equal(JSON.parse(values["la-chance-history"])[0].game, "Poker");
  assert.equal(JSON.parse(values["la-chance-tournament"]).round, 2);
  assert.equal(values["la-chance-bonus-date"], "2026-10-01");
});

test("refuse les fichiers invalides et nettoie les données importées", () => {
  assert.throws(() => normalizeSaveData({ format: "autre", version: 1, balance: 0 }), /sauvegarde/);
  assert.throws(() => normalizeSaveData({ format: "la-chance-save", version: 1, balance: -1 }), /solde/);

  const values = Object.fromEntries(normalizeSaveData({
    format: "la-chance-save",
    version: 1,
    balance: 100,
    stats: { games: 3, wins: 9, losses: 9, gamesByName: { Inconnu: 9, Poker: 2 } },
    history: [{ game: "<img>", detail: "bad", net: 0, time: "12:00" }],
    missions: { date: "2026-10-01", played: 2, games: ["Inconnu", "Poker"], claimed: ["unknown", "play"] },
    achievements: ["unknown", "first-game"],
    leaderboard: [{ name: "<img>", score: 100 }],
    preferences: { theme: "unknown", cardBack: "unknown" },
    tournament: { active: true, round: 99, points: 99 },
  }));
  const stats = JSON.parse(values["la-chance-stats"]);
  assert.equal(stats.wins, 3);
  assert.equal(stats.losses, 0);
  assert.deepEqual(stats.gamesByName, { Poker: 2 });
  assert.deepEqual(JSON.parse(values["la-chance-history"]), []);
  assert.deepEqual(JSON.parse(values["la-chance-missions"]).games, ["Poker"]);
  assert.deepEqual(JSON.parse(values["la-chance-missions"]).claimed, ["play"]);
  assert.deepEqual(JSON.parse(values["la-chance-achievements"]), ["first-game"]);
  assert.equal(JSON.parse(values["la-chance-preferences"]).theme, "emerald");
  assert.equal(JSON.parse(values["la-chance-tournament"]).active, false);
  assert.equal(JSON.parse(values["la-chance-leaderboard"])[0].name, "<img>");
});
