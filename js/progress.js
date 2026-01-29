const ProgressSystem = {
    currentUserId: 'guest',
    data: null,

    // Map numeric difficulty to string keys
    modeMap: {
        3: 'easy',
        4: 'medium',
        5: 'hard'
    },

    init(userId = 'guest') {
        this.currentUserId = userId || 'guest';
        this.load();
    },

    getDefaultData() {
        return {
            easy: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, avgScore: 0, bestScore: 0 },
            medium: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, avgScore: 0, bestScore: 0 },
            hard: { gamesPlayed: 0, gamesWon: 0, totalScore: 0, avgScore: 0, bestScore: 0 },
            overall: { totalGames: 0, totalScore: 0, avgScore: 0 }
        };
    },

    getKey() {
        return `guessai_progress_${this.currentUserId}`;
    },

    load() {
        const key = this.getKey();
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                this.data = JSON.parse(stored);
            } else {
                this.data = this.getDefaultData();
            }
        } catch (e) {
            console.error("ProgressSystem: Failed to load data", e);
            this.data = this.getDefaultData();
        }
    },

    save() {
        if (!this.data) return;
        const key = this.getKey();
        try {
            localStorage.setItem(key, JSON.stringify(this.data));
        } catch (e) {
            console.error("ProgressSystem: Failed to save data", e);
        }
    },

    /**
     * @param {Object} result
     * @param {number} result.difficulty - 3, 4, 5
     * @param {number} result.score - Final word score
     * @param {boolean} result.solved - Whether the word was solved
     */
    recordGameResult({ difficulty, score, solved }) {
        if (!this.data) this.init(this.currentUserId);

        const modeKey = this.modeMap[difficulty];
        if (!modeKey) {
            console.error(`ProgressSystem: Invalid difficulty ${difficulty}`);
            return;
        }

        // Update Mode Stats
        const modeStats = this.data[modeKey];
        modeStats.gamesPlayed++;
        modeStats.totalScore += score;
        modeStats.avgScore = Math.floor(modeStats.totalScore / modeStats.gamesPlayed);
        modeStats.bestScore = Math.max(modeStats.bestScore, score);
        
        if (solved) {
            modeStats.gamesWon++;
        }

        // Update Overall Stats
        const overall = this.data.overall;
        overall.totalGames++;
        overall.totalScore += score;
        overall.avgScore = Math.floor(overall.totalScore / overall.totalGames);

        // Save
        this.save();
        // Stats saved
    },

    getStats() {
        if (!this.data) this.init(this.currentUserId);
        return this.data;
    }
};
