const STORAGE_KEY = "guess_the_word_data";

const defaultData = {
  stats: {
    gamesPlayed: 0,
    gamesWon: 0,
    winStreak: 0,
    maxStreak: 0,
    totalScore: 0,
    distribution: {
      3: { played: 0, won: 0 },
      4: { played: 0, won: 0 },
      5: { played: 0, won: 0 },
    },
  },
  settings: {
    soundEnabled: true,
    darkMode: false,
    apiKey: "", // Will use default if empty
  },
  achievements: [], // Array of achievement IDs
  gameState: null, // Resume feature
};

const Storage = {
  getData() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return defaultData;
      return { ...defaultData, ...JSON.parse(data) };
    } catch (e) {
      console.error("Storage Error (likely disabled or restricted):", e);
      return defaultData;
    }
  },

  saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  },

  updateStats(win, difficulty, score) {
    const data = this.getData();
    data.stats.gamesPlayed++;
    data.stats.distribution[difficulty].played++;

    if (win) {
      data.stats.gamesWon++;
      data.stats.distribution[difficulty].won++;
      data.stats.winStreak++;
      data.stats.maxStreak = Math.max(
        data.stats.winStreak,
        data.stats.maxStreak,
      );
      data.stats.totalScore += score;
    } else {
      data.stats.winStreak = 0;
    }

    this.saveData(data);
    return data.stats;
  },

  getSettings() {
    return this.getData().settings;
  },

  saveSettings(newSettings) {
    const data = this.getData();
    data.settings = { ...data.settings, ...newSettings };
    this.saveData(data);
  },

  unlockAchievement(id) {
    const data = this.getData();
    if (!data.achievements.includes(id)) {
      data.achievements.push(id);
      this.saveData(data);
      return true; // Newly unlocked
    }
    return false;
  },
};
