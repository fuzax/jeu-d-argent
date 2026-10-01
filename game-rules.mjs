export const KENO_MULTIPLIERS = [0, 0, 2, 4, 15, 100];

export function calculateSlotPayout(bet, symbols) {
  if (!Number.isSafeInteger(bet) || bet < 1 || !Array.isArray(symbols) || symbols.length !== 3) return 0;
  const multiplier = symbols[0] === symbols[1] && symbols[1] === symbols[2] ? 4 : new Set(symbols).size < 3 ? 2 : 0;
  const payout = bet * multiplier;
  return Number.isSafeInteger(payout) ? payout : 0;
}

export function calculateKenoPayout(bet, hits) {
  if (!Number.isSafeInteger(bet) || bet < 1 || !Number.isInteger(hits) || hits < 0 || hits > 5) return 0;
  const payout = bet * KENO_MULTIPLIERS[hits];
  return Number.isSafeInteger(payout) ? payout : 0;
}

export function tournamentReward(points) {
  if (points >= 8) return 700;
  if (points >= 6) return 250;
  if (points >= 4) return 100;
  if (points >= 2) return 35;
  return 0;
}

function pokerRankValue(rank) {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  return Number(rank);
}

export function evaluatePokerHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) throw new RangeError("Une main de poker contient exactement cinq cartes.");
  const values = cards.map((card) => pokerRankValue(card.rank)).sort((left, right) => right - left);
  if (values.some((value) => !Number.isInteger(value) || value < 2 || value > 14)) throw new TypeError("Rang de carte invalide.");
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const groups = [...counts].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(values)].sort((left, right) => right - left);
  let straightHigh = unique.length === 5 && unique[0] - unique[4] === 4 ? unique[0] : 0;
  if (!straightHigh && unique.join(",") === "14,5,4,3,2") straightHigh = 5;

  if (flush && straightHigh) return { score: [8, straightHigh], label: "Quinte flush" };
  if (groups[0][1] === 4) return { score: [7, groups[0][0], groups[1][0]], label: "Carré" };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { score: [6, groups[0][0], groups[1][0]], label: "Full" };
  if (flush) return { score: [5, ...values], label: "Couleur" };
  if (straightHigh) return { score: [4, straightHigh], label: "Quinte" };
  if (groups[0][1] === 3) return { score: [3, groups[0][0], ...groups.slice(1).map((group) => group[0])], label: "Brelan" };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { score: [2, groups[0][0], groups[1][0], groups[2][0]], label: "Double paire" };
  if (groups[0][1] === 2) return { score: [1, groups[0][0], ...groups.slice(1).map((group) => group[0])], label: "Paire" };
  return { score: [0, ...values], label: "Carte haute" };
}

export function comparePokerHands(left, right) {
  for (let index = 0; index < Math.max(left.score.length, right.score.length); index += 1) {
    const difference = (left.score[index] || 0) - (right.score[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function bestPokerHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) throw new RangeError("Il faut entre cinq et sept cartes pour évaluer une main.");
  let best = null;
  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            const hand = evaluatePokerHand([cards[first], cards[second], cards[third], cards[fourth], cards[fifth]]);
            if (!best || comparePokerHands(hand, best) > 0) best = hand;
          }
        }
      }
    }
  }
  return best;
}
