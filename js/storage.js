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
  // Word history for repetition prevention
  wordHistory: {
    words: [],           // Array of solved words
    currentIndex: 0,     // Circular buffer pointer
    totalSolved: 0,      // Lifetime counter
    maxSize: 1000        // Maximum history size
  }
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

  // =============================================
  // WORD HISTORY METHODS (Repetition Prevention)
  // =============================================

  // Get solved words for exclusion
  getSolvedWords(difficulty = null) {
    const data = this.getData();
    const history = data.wordHistory || { words: [] };

    if (difficulty) {
      // Filter by difficulty
      return history.words
        .filter(entry => entry.difficulty === difficulty)
        .map(entry => entry.word.toUpperCase());
    }

    // Return all words
    return history.words.map(entry => entry.word.toUpperCase());
  },

  // Add word to history (circular buffer)
  addSolvedWord(word, difficulty) {
    const data = this.getData();

    // Initialize if missing
    if (!data.wordHistory) {
      data.wordHistory = {
        words: [],
        currentIndex: 0,
        totalSolved: 0,
        maxSize: 1000
      };
    }

    const history = data.wordHistory;
    const wordEntry = {
      word: word.toUpperCase(),
      difficulty: difficulty,
      solvedAt: Date.now(),
      index: history.totalSolved
    };

    // Circular buffer logic
    if (history.words.length < history.maxSize) {
      // Still filling buffer
      history.words.push(wordEntry);
    } else {
      // Buffer full, overwrite oldest entry
      history.words[history.currentIndex] = wordEntry;
      history.currentIndex = (history.currentIndex + 1) % history.maxSize;
    }

    history.totalSolved++;

    try {
      this.saveData(data);
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.error('[Storage] Quota exceeded, trimming history');
        data.wordHistory.words = data.wordHistory.words.slice(-500);
        this.saveData(data);
      }
    }

    console.log(`[Storage] Added word: ${word} (Total: ${history.totalSolved}, Buffer: ${history.words.length})`);
  },

  // Get word history statistics
  getWordHistoryStats() {
    const data = this.getData();
    const history = data.wordHistory || { words: [], totalSolved: 0 };

    return {
      totalSolved: history.totalSolved,
      bufferSize: history.words.length,
      maxSize: history.maxSize || 1000,
      byDifficulty: {
        3: history.words.filter(w => w.difficulty === 3).length,
        4: history.words.filter(w => w.difficulty === 4).length,
        5: history.words.filter(w => w.difficulty === 5).length
      }
    };
  },

  // Clear word history (for settings/reset)
  clearWordHistory() {
    const data = this.getData();
    data.wordHistory = {
      words: [],
      currentIndex: 0,
      totalSolved: 0,
      maxSize: 1000
    };
    this.saveData(data);
    console.log('[Storage] Word history cleared');
  },

  // Check if word was recently solved
  isWordInHistory(word, difficulty = null) {
    const solvedWords = this.getSolvedWords(difficulty);
    return solvedWords.includes(word.toUpperCase());
  },

  // Migrate existing users to new schema
  migrateToWordHistory() {
    const data = this.getData();

    if (!data.wordHistory) {
      console.log('[Storage] Migrating to word history system...');
      data.wordHistory = {
        words: [],
        currentIndex: 0,
        totalSolved: 0,
        maxSize: 1000
      };
      this.saveData(data);
      console.log('[Storage] Migration complete');
    }
  }
};
