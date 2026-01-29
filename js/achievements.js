const ACHIEVEMENT_LIST = [
    { id: 'first_win', title: 'First Steps', desc: 'Win your first game', points: 100 },
    { id: 'speed_demon', title: 'Speed Demon', desc: 'Win in under 60 seconds', points: 500 },
    { id: 'expert_mind', title: 'Expert Mind', desc: 'Win a Hard game', points: 300 },
    { id: 'lucky', title: 'Lucky Guess', desc: 'Win on the first attempt', points: 1000 },
    { id: 'close_call', title: 'Close Call', desc: 'Win on the last attempt', points: 200 }
];

const Achievements = {
    check(state, gameResult) {
        if (!gameResult.win) return;

        const newUnlocks = [];

        // 1. First Win
        if (Storage.getData().stats.gamesWon === 1) {
            this.unlock('first_win', newUnlocks);
        }

        // 2. Speed Demon
        if (gameResult.timeTaken < 60) {
            this.unlock('speed_demon', newUnlocks);
        }

        // 3. Expert Mind
        if (gameResult.difficulty === 5) {
            this.unlock('expert_mind', newUnlocks);
        }

        // 4. Lucky
        if (gameResult.attempts === 1) {
            this.unlock('lucky', newUnlocks);
        }

        // 5. Close Call
        if (gameResult.attempts === gameResult.maxAttempts) {
            this.unlock('close_call', newUnlocks);
        }

        return newUnlocks;
    },

    unlock(id, list) {
        if (Storage.unlockAchievement(id)) {
            const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
            if (ach) list.push(ach);
        }
    }
};
