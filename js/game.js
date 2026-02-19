const Game = {
  state: {
    isPlaying: false,
    isPaused: false,
    targetWordLength: 0,
    currentGuess: "",
    guesses: [],
    currentAttempt: 0,
    timeLeft: 0,
    timerInterval: null,
    letterStates: {},
    sessionScore: 0,
    gameFinalized: false,
    maxAttempts: 6,
    hasHint: false,
    hintText: null,
  },

  // ========================================
  // AUTH HELPER
  // ========================================
  getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem("authToken");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      let guestId = localStorage.getItem("guestId");
      if (!guestId) {
        guestId = "guest_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("guestId", guestId);
      }
      headers["x-guest-id"] = guestId;
    }
    return headers;
  },

  // ========================================
  // GAME START (No difficulty — random word)
  // ========================================
  async start() {
    try {
      this.resetState();

      // Initialize Progress System
      const userId = (window.Auth && Auth.currentUser) ? Auth.currentUser.id : "guest";
      if (window.ProgressSystem) ProgressSystem.init(userId);

      // Show game screen immediately
      UI.showScreen("game");

      console.log("[Game] Requesting random word from server...");

      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start game");
      }

      const data = await res.json();
      const length = data.length;

      // Dynamic config based on word length
      const maxAttempts = length + 1; // e.g. 5-letter word → 6 attempts
      const timeLimit = length <= 4 ? 180 : length <= 6 ? 300 : 360;

      this.state.targetWordLength = length;
      this.state.maxAttempts = maxAttempts;
      this.state.timeLeft = timeLimit;
      this.state.isPlaying = true;

      // Check for hint availability
      if (data.hint) {
        this.state.hasHint = true;
        this.state.hintText = data.hint;
        this.showHintUI(data.hint);
        // Dim hint button as used
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
           hintBtn.classList.remove('hidden');
           hintBtn.classList.add('used');
        }
      } else if (data.hasHint) {
        this.state.hasHint = true;
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) hintBtn.classList.remove('hidden');
      }

      console.log(`[Game] Word length: ${length}, Attempts: ${maxAttempts}, Time: ${timeLimit}s`);

      // Build UI
      UI.createGrid(maxAttempts, length);
      UI.generateKeyboard();
      UI.updateTimer(this.state.timeLeft);
      UI.updateGrid([], 0, "", maxAttempts, length);

      // Start timer
      this.startTimer();

      // Show pause button
      document.getElementById("pause-btn")?.classList.remove("hidden");

    } catch (e) {
      console.error("CRITICAL Game Start Error:", e);
      alert("Error starting game: " + e.message);
      UI.showScreen("dashboard");
    }
  },

  // ========================================
  // INPUT HANDLING
  // ========================================
  handleInput(key) {
    try {
      if (!this.state.isPlaying || this.state.isPaused) return;

      const maxLen = this.state.targetWordLength;

      if (key === "BACKSPACE") {
        this.state.currentGuess = this.state.currentGuess.slice(0, -1);
        if (window.AudioController) AudioController.play("click");
      } else if (key === "ENTER") {
        if (this.state.currentGuess.length === maxLen) {
          this.submitGuess();
        } else {
          const grid = document.getElementById("grid-container");
          if (grid) {
            grid.classList.add("animate-shake");
            setTimeout(() => grid.classList.remove("animate-shake"), 500);
          }
          if (window.AudioController) AudioController.play("wrong");
        }
      } else if (this.state.currentGuess.length < maxLen && /^[A-Z]$/.test(key)) {
        this.state.currentGuess += key;
        if (window.AudioController) AudioController.play("click");
      }

      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        this.state.currentGuess,
        this.state.maxAttempts,
        this.state.targetWordLength,
      );
    } catch (error) {
      console.error("Input Error:", error);
    }
  },

  // ========================================
  // GUESS SUBMISSION (Server-side validation)
  // ========================================
  async submitGuess() {
    try {
      const guess = this.state.currentGuess;
      const length = this.state.targetWordLength;

      if (guess.length !== length) return;

      console.log(`[Game] Submitting guess: ${guess}`);

      const res = await fetch("/api/check-guess", {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ guess }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Validation failed");
      }

      const result = await res.json();
      // result: { correct, evaluation, solution }

      // Update state
      const evaluation = result.evaluation;
      this.state.guesses.push({ word: guess, evaluation });

      // Update letter states for keyboard coloring
      guess.split("").forEach((char, i) => {
        const status = evaluation[i];
        const current = this.state.letterStates[char];
        if (status === "correct") this.state.letterStates[char] = "correct";
        else if (status === "present" && current !== "correct")
          this.state.letterStates[char] = "present";
        else if (status === "absent" && !current)
          this.state.letterStates[char] = "absent";
      });

      // Advance attempt
      this.state.currentAttempt++;
      this.state.currentGuess = "";

      // UI Updates
      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        "",
        this.state.maxAttempts,
        this.state.targetWordLength,
      );
      UI.updateKeyboard(this.state.letterStates);

      // Check Win
      if (result.correct) {
        if (window.AudioController) AudioController.play("correct");
        setTimeout(() => {
          if (window.AudioController) AudioController.play("win");
          this.endGame(true, result.solution || guess);
        }, 500);
        return;
      }

      // Check Loss
      if (window.AudioController) AudioController.play("wrong");
      if (this.state.currentAttempt >= this.state.maxAttempts) {
        // Fetch the solution from server
        await this.revealAndEnd();
      }

    } catch (error) {
      console.error("Submit Error:", error);
      alert("Error submitting guess: " + error.message);
    }
  },

  // ========================================
  // REVEAL WORD & END GAME (Loss)
  // ========================================
  async revealAndEnd() {
    try {
      const res = await fetch("/api/game/reveal", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      const word = data.word || "???";
      this.endGame(false, word);
    } catch (e) {
      console.error("Reveal Error:", e);
      this.endGame(false, "???");
    }
  },

  // ========================================
  // GAME END
  // ========================================
  endGame(win, revealedWord) {
    this.state.isPlaying = false;
    clearInterval(this.state.timerInterval);
    document.getElementById("pause-btn")?.classList.add("hidden");

    // Clear saved game
    if (window.Storage) {
      const data = Storage.getData();
      data.gameState = null;
      Storage.saveData(data);
    }

    // Calculate score
    const score = this.calculateScore(win);
    this.state.sessionScore += score;

    // Update stats
    if (window.Storage) {
      Storage.updateStats(win, this.state.targetWordLength, score);
    }

    // Progress system
    if (window.ProgressSystem) {
      ProgressSystem.recordGameResult({
        difficulty: this.state.targetWordLength,
        score: score,
        solved: win,
      });
    }

    // Add solved word to history
    if (win && window.Storage && revealedWord) {
      Storage.addSolvedWord(revealedWord, this.state.targetWordLength);
    }

    // Supabase sync
    if (window.supabase && window.Auth && Auth.currentUser && !this.state.gameFinalized) {
      this.state.gameFinalized = true;
      const diffMap = { 3: "easy", 4: "medium", 5: "hard" };
      const mode = diffMap[this.state.targetWordLength] || "medium";

      window.supabase
        .rpc("update_game_stats", {
          p_user_id: Auth.currentUser.id,
          p_mode: mode,
          p_score: score,
          p_solved: win,
        })
        .then(({ error }) => {
          if (error) console.error("Supabase RPC Error:", error);
          if (typeof Leaderboard !== "undefined") Leaderboard.state.data = {};
        });
    }

    UI.updateScore(score);

    // Achievements
    if (window.Achievements) {
      const unlocked = Achievements.check(this.state, {
        win,
        timeTaken: (this.state.timeLeft > 0 ? 300 - this.state.timeLeft : 300),
        difficulty: this.state.targetWordLength,
        attempts: this.state.currentAttempt,
        maxAttempts: this.state.maxAttempts,
      });
      if (unlocked && unlocked.length > 0) {
        unlocked.forEach((ach) => UI.showAchievement(ach));
      }
    }

    // Show result
    setTimeout(() => {
      const totalTime = this.state.targetWordLength <= 4 ? 180 : this.state.targetWordLength <= 6 ? 300 : 360;
      const elapsed = totalTime - this.state.timeLeft;
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;

      UI.showResult({
        win,
        word: revealedWord,
        attempts: this.state.currentAttempt,
        maxAttempts: this.state.maxAttempts,
        timeText: `${m}:${s.toString().padStart(2, "0")}`,
        score,
      });
    }, 1000);
  },

  // ========================================
  // SCORING
  // ========================================
  calculateScore(win) {
    if (!win) return 0;
    if (window.ScoringSystem) {
      const totalTime = this.state.targetWordLength <= 4 ? 180 : this.state.targetWordLength <= 6 ? 300 : 360;
      const scoreData = ScoringSystem.calculateWordScore({
        difficulty: this.state.targetWordLength,
        attemptsUsed: this.state.currentAttempt,
        maxAttempts: this.state.maxAttempts,
        isSolved: win,
        remainingTime: this.state.timeLeft,
        totalTime: totalTime,
        guesses: this.state.guesses,
        targetWord: "",
      });
      return scoreData.wordScore;
    }
    // Simple fallback
    return win ? 100 : 0;
  },

  // ========================================
  // TIMER
  // ========================================
  startTimer() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    this.state.timerInterval = setInterval(() => {
      if (!this.state.isPlaying || this.state.isPaused) return;
      this.state.timeLeft--;
      UI.updateTimer(this.state.timeLeft);
      if (this.state.timeLeft <= 0) {
        this.revealAndEnd();
      }
    }, 1000);
  },

  // ========================================
  // PAUSE SYSTEM
  // ========================================
  pause() {
    if (!this.state.isPlaying || this.state.isPaused) return;
    this.state.isPaused = true;
  },

  resumeFromPause() {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
  },

  // ========================================
  // STATE MANAGEMENT
  // ========================================
  resetState() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    this.state = {
      isPlaying: false,
      isPaused: false,
      targetWordLength: 0,
      currentGuess: "",
      guesses: [],
      currentAttempt: 0,
      timeLeft: 0,
      timerInterval: null,
      letterStates: {},
      sessionScore: this.state?.sessionScore || 0,
      gameFinalized: false,
      maxAttempts: 6,
      hasHint: false,
      hintText: null,
    };
    
    // Reset Hint UI
    const hintTextEl = document.querySelector('#hint-card .hint-text');
    if (hintTextEl) hintTextEl.innerHTML = '<span class="hint-placeholder">Waiting for game...</span>';
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
       hintBtn.classList.add('hidden');
       hintBtn.classList.remove('used');
    }
  },

  // ========================================
  // HINT SYSTEM
  // ========================================
  async requestHint() {
    if (!this.state.isPlaying || !this.state.hasHint) return;
    
    // Already have hint? Just show it
    if (this.state.hintText) {
      this.showHintUI(this.state.hintText);
      return;
    }
    
    try {
      const res = await fetch("/api/game/hint", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
      const data = await res.json();
      if (data.hint) {
        this.state.hintText = data.hint;
        this.showHintUI(data.hint);
        // Hide hint button after use
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) hintBtn.classList.add('used');
      }
    } catch (e) {
      console.error("Hint Error:", e);
    }
  },
  
  showHintUI(hintText) {
    const hintTextEl = document.querySelector('#hint-card .hint-text');
    if (hintTextEl) {
      hintTextEl.innerHTML = `<span>${hintText}</span>`;
      
      const card = document.getElementById('hint-card');
      if (card) {
        card.classList.remove('flash-highlight');
        void card.offsetWidth; // Trigger reflow
        card.classList.add('flash-highlight');
      }
    }
  },

  restart() {
    this.start();
  },

  resume() {
    // Resume from saved state (legacy — simplified)
    const saved = window.Storage ? Storage.getData().gameState : null;
    if (!saved) return;
    // For now just start a new game (saved state won't have server word anymore)
    this.start();
  },

  quitToHome() {
    this.resetState();
    document.getElementById("pause-btn")?.classList.add("hidden");
    UI.showScreen("dashboard");
  },

  saveProgress() {
    // Simplified — server has the word, so we can't fully restore
    // But we save what we can for UI continuity
    if (window.Storage) {
      const data = Storage.getData();
      const stateCopy = { ...this.state };
      stateCopy.timerInterval = null;
      data.gameState = stateCopy;
      Storage.saveData(data);
    }
  },
};
