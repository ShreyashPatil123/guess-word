const Game = {
  config: {
    3: { time: 180, attempts: 6 },
    4: { time: 240, attempts: 7 },
    5: { time: 300, attempts: 8 },
  },

  state: {
    isPlaying: false,
    isPaused: false, // NEW: Pause state
    difficulty: 0,
    targetWord: "",
    guesses: [], // Array of { word: string, evaluation: string[] }
    currentGuess: "",
    currentAttempt: 0,
    timeLeft: 0,
    timerInterval: null,
    letterStates: {}, // {'A': 'correct', 'B': 'absent'}
    sessionScore: 0, // Accumulates across games
  },

  async start(difficulty) {
    try {
      // Init State
      this.resetState();
      this.state.difficulty = difficulty;
      this.state.timeLeft = this.config[difficulty].time;

      // Initialize Progress System for Current User
      // Auth.currentUser might be null if guest or not fully loaded,
      // but ProgressSystem handles null/guest.
      const userId = Auth.currentUser ? Auth.currentUser.id : "guest";
      ProgressSystem.init(userId);

      // FIX: Removed debug log for production

      // Switch screen immediately
      UI.showScreen("game");

      // Render basic UI
      const attempts = this.config[difficulty].attempts;
      UI.createGrid(attempts, difficulty);
      UI.generateKeyboard();
      UI.updateTimer(this.state.timeLeft);

      // Fetch Word
      // Small delay to allow UI to paint if main thread was blocked
      await new Promise((r) => setTimeout(r, 50));

      try {
        const word = await GeminiAPI.generateWord(difficulty);
        this.state.targetWord = word;
        this.state.isPlaying = true;
        this.startTimer();
        // Show pause button in header
        document.getElementById("pause-btn")?.classList.remove("hidden");
        // FIX: Removed target word debug log (security)
      } catch (apiError) {
        console.error("API Error in Game.start:", apiError);
        // Fallback is handled in GeminiAPI, but if we get here, something major failed.
        // We'll try one last synchronous fallback just in case.
        this.state.targetWord = GeminiAPI.getFallback(difficulty);
        this.state.isPlaying = true;
        this.startTimer();
        // Show pause button in header
        document.getElementById("pause-btn")?.classList.remove("hidden");
      }
    } catch (e) {
      console.error("CRITICAL Game Start Error:", e);
      alert("Error starting game: " + e.message);
      UI.showScreen("dashboard");
    }
  },

  resume() {
    const saved = Storage.getData().gameState;
    if (!saved) return;

    this.state = saved;

    UI.showScreen("game");
    UI.createGrid(
      this.config[this.state.difficulty].attempts,
      this.state.difficulty,
    );
    UI.generateKeyboard();

    // Restore visuals
    UI.updateGrid(
      this.state.guesses,
      this.state.currentAttempt,
      this.state.currentGuess,
      this.config[this.state.difficulty].attempts,
      this.state.difficulty,
    );
    UI.updateKeyboard(this.state.letterStates);
    UI.updateTimer(this.state.timeLeft);

    this.startTimer();
  },

  resetState() {
    // Clear timer if running
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);

    this.state = {
      isPlaying: false,
      isPaused: false,
      difficulty: 0,
      targetWord: "",
      guesses: [],
      currentGuess: "",
      currentAttempt: 0,
      timeLeft: 0,
      timerInterval: null,
      // Preserve sessionScore if resetState is called for new game?
      // Usually resetState is for a fresh game start.
      // Requirement: "Accumulate per word: Game.state.sessionScore += finalScore".
      // If I wipe it here, it won't accumulate.
      // I should capture the old sessionScore before resetting, or NOT reset it here.
      // Let's modify resetState to KEEP sessionScore if it exists.
      sessionScore: this.state?.sessionScore || 0,
      letterStates: {},
      gameFinalized: false, // Prevent duplicate stats recording
    };
  },

  restart() {
    if (this.state.difficulty > 0) {
      this.start(this.state.difficulty);
    } else {
      UI.showScreen("dashboard");
    }
  },

  startTimer() {
    if (this.state.timerInterval) clearInterval(this.state.timerInterval);
    this.state.timerInterval = setInterval(() => {
      // Don't tick if not playing OR if paused
      if (!this.state.isPlaying || this.state.isPaused) return;

      this.state.timeLeft--;
      UI.updateTimer(this.state.timeLeft);

      if (this.state.timeLeft <= 0) {
        this.endGame(false, "Time's Up!");
      }
    }, 1000);
  },

  // ========== PAUSE SYSTEM ==========

  pause() {
    if (!this.state.isPlaying || this.state.isPaused) return;
    this.state.isPaused = true;
    // Game paused
  },

  resumeFromPause() {
    if (!this.state.isPaused) return;
    this.state.isPaused = false;
    // Game resumed
  },

  quitToHome() {
    // Stop timer, reset state, go to dashboard
    this.resetState();
    // Hide pause button
    document.getElementById("pause-btn")?.classList.add("hidden");
    UI.showScreen("dashboard");
  },

  handleInput(key) {
    try {
      // Block input if not playing OR if paused
      if (!this.state.isPlaying || this.state.isPaused) return;

      const maxLen = this.state.difficulty;

      if (key === "BACKSPACE") {
        this.state.currentGuess = this.state.currentGuess.slice(0, -1);
        AudioController.play("click");
      } else if (key === "ENTER") {
        if (this.state.currentGuess.length == maxLen) {
          // Loose equality just in case
          this.submitGuess();
        } else {
          document
            .getElementById("grid-container")
            .classList.add("animate-shake");
          setTimeout(
            () =>
              document
                .getElementById("grid-container")
                .classList.remove("animate-shake"),
            500,
          );
          AudioController.play("wrong");
        }
      } else if (
        this.state.currentGuess.length < maxLen &&
        /^[A-Z]$/.test(key)
      ) {
        this.state.currentGuess += key;
        AudioController.play("click");
      }

      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        this.state.currentGuess,
        this.config[this.state.difficulty].attempts,
        this.state.difficulty,
      );
    } catch (error) {
      console.error("Input Error:", error);
      alert("Unexpected error handling input: " + error.message);
    }
  },

  submitGuess() {
    try {
      const guess = this.state.currentGuess;
      const target = this.state.targetWord;

      if (!target) throw new Error("Target word is missing!");

      // Evaluate
      const evaluation = this.evaluateGuess(guess, target);

      // Update State
      this.state.guesses.push({ word: guess, evaluation });

      // Update Keyboard & Letter States
      guess.split("").forEach((char, i) => {
        const status = evaluation[i];
        const current = this.state.letterStates[char];
        if (status === "correct") this.state.letterStates[char] = "correct";
        else if (status === "present" && current !== "correct")
          this.state.letterStates[char] = "present";
        else if (status === "absent" && !current)
          this.state.letterStates[char] = "absent";
      });

      // UI Updates
      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        "",
        this.config[this.state.difficulty].attempts,
        this.state.difficulty,
      );
      UI.updateKeyboard(this.state.letterStates);

      // Check Win/Loss
      if (guess === target) {
        AudioController.play("correct");
        setTimeout(() => {
          AudioController.play("win");
          this.endGame(true);
        }, 500);
        return;
      } else {
        AudioController.play("wrong");
      }

      this.state.currentAttempt++;
      this.state.currentGuess = "";

      if (
        this.state.currentAttempt >= this.config[this.state.difficulty].attempts
      ) {
        this.endGame(false, "Out of Attempts");
      } else {
        // Save state for resume
        this.saveProgress();
      }
    } catch (error) {
      console.error("Submit Error:", error);
      alert("Error submitting guess: " + error.message);
    }
  },

  evaluateGuess(guess, target) {
    const res = Array(guess.length).fill("absent");
    const targetArr = target.split("");
    const guessArr = guess.split("");

    // 1. Find Greens
    guessArr.forEach((char, i) => {
      if (char === targetArr[i]) {
        res[i] = "correct";
        targetArr[i] = null; // Mark as used
        guessArr[i] = null;
      }
    });

    // 2. Find Yellows
    guessArr.forEach((char, i) => {
      if (char && targetArr.includes(char)) {
        res[i] = "present";
        // Remove ONE instance from target to handle duplicates
        const idx = targetArr.indexOf(char);
        targetArr[idx] = null;
      }
    });

    return res;
  },

  saveProgress() {
    const data = Storage.getData();
    data.gameState = this.state;
    // Don't save interval ID
    data.gameState.timerInterval = null;
    Storage.saveData(data);
  },

  // Integrated Scoring Logic
  // Integrated Scoring Logic (Extended)
  calculateScore(win, timeRemaining, attempts) {
    const totalTime = this.config[this.state.difficulty].time;

    // Unified call for both Win and Loss
    // The scoring system now handles full word score + additive partials internally
    const scoreData = ScoringSystem.calculateWordScore({
      difficulty: this.state.difficulty,
      attemptsUsed: attempts, // 1-based
      maxAttempts: this.config[this.state.difficulty].attempts,
      isSolved: win,
      remainingTime: timeRemaining,
      totalTime: totalTime,
      guesses: this.state.guesses,
      targetWord: this.state.targetWord,
    });

    // Score calculated
    return scoreData.wordScore;
  },

  endGame(win, reason) {
    this.state.isPlaying = false;
    clearInterval(this.state.timerInterval);
    // Hide pause button
    document.getElementById("pause-btn")?.classList.add("hidden");

    // Clear saved game
    const data = Storage.getData();
    data.gameState = null;
    Storage.saveData(data);

    const score = this.calculateScore(
      win,
      this.state.timeLeft,
      this.state.currentAttempt + 1,
    );

    // Accumulate Session Score
    this.state.sessionScore += score;
    // Session score updated

    // Update Stats (Legacy Storage)
    const newStats = Storage.updateStats(win, this.state.difficulty, score);

    // NEW: Record Persistent Progress
    ProgressSystem.recordGameResult({
      difficulty: this.state.difficulty,
      score: score,
      solved: win,
    });

    // ==========================================
    // SUPABASE SCORING INTEGRATION
    // ==========================================
    if (window.supabase && Auth.currentUser && !this.state.gameFinalized) {
      this.state.gameFinalized = true;

      // Map difficulty to 'easy' | 'medium' | 'hard'
      const diffMap = { 3: "easy", 4: "medium", 5: "hard" };
      const mode = diffMap[this.state.difficulty];

      window.supabase
        .rpc("update_game_stats", {
          p_user_id: Auth.currentUser.id,
          p_mode: mode,
          p_score: score,
          p_solved: win,
        })
        .then(({ data, error }) => {
          if (error) console.error("Supabase RPC Error:", error);
          else console.log("Stats synced to Supabase:", data);

          // Invalidate Leaderboard Cache if needed
          if (typeof Leaderboard !== "undefined") Leaderboard.state.data = {};
        });
    }

    UI.updateScore(score);

    // Check Achievements
    const unlocked = Achievements.check(this.state, {
      win,
      timeTaken: this.config[this.state.difficulty].time - this.state.timeLeft,
      difficulty: this.state.difficulty,
      attempts: this.state.currentAttempt + 1,
      maxAttempts: this.config[this.state.difficulty].attempts,
    });

    if (unlocked && unlocked.length > 0) {
      unlocked.forEach((ach) => UI.showAchievement(ach));
    }

    // Show Result
    setTimeout(() => {
      const m = Math.floor(
        (this.config[this.state.difficulty].time - this.state.timeLeft) / 60,
      );
      const s =
        (this.config[this.state.difficulty].time - this.state.timeLeft) % 60;

      UI.showResult({
        win,
        word: this.state.targetWord,
        attempts: this.state.currentAttempt + (win ? 1 : 0),
        maxAttempts: this.config[this.state.difficulty].attempts,
        timeText: `${m}:${s.toString().padStart(2, "0")}`,
        score,
      });
    }, 1000);
  },
};
