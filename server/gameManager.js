const TOTAL_ROUNDS = 5;
const ROUND_TIMER_SECONDS = 60;

function calculatePoints(guessOrderPosition, totalGuessers) {
    if (guessOrderPosition === 0) return 100;
    if (guessOrderPosition === 1) return 80;
    if (guessOrderPosition === 2) return 60;
    return Math.max(10, 50 - (guessOrderPosition * 10));
}

function getFinalLeaderboard(party) {
    return party.party_players.sort((a, b) => b.score - a.score);
}

module.exports = {
    TOTAL_ROUNDS,
    ROUND_TIMER_SECONDS,
    calculatePoints,
    getFinalLeaderboard
};
