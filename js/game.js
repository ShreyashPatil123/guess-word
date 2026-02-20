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
    // New Hint System State
    hintLevelUsed: 0, // 0=None, 1=Semantic, 2=Context, 3=Definition
    revealedPositions: {}, // Map index -> char
    scoreMultiplier: 1.0,
    hintPackStatus: "idle", // idle, pending, ready
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
  // GAME START
  // ========================================
  async start() {
    try {
      this.resetState();

      // Initialize Progress System
      const userId = (window.Auth && Auth.currentUser) ? Auth.currentUser.id : "guest";
      if (window.ProgressSystem) ProgressSystem.init(userId);

      // Show game screen immediately
      UI.showScreen("game");

      console.log("[Game] Requesting new game from server...");

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

      // Dynamic config
      const maxAttempts = length + 1;
      const timeLimit = length <= 4 ? 180 : length <= 6 ? 300 : 360;

      this.state.targetWordLength = length;
      this.state.maxAttempts = maxAttempts;
      this.state.timeLeft = timeLimit;
      this.state.isPlaying = true;

      // Initialize UI Elements for Hint System
      const hintBtn = document.getElementById('hint-btn');
      const revealBtn = document.getElementById('reveal-btn');
      const hintTextEl = document.querySelector('#hint-card .hint-text');

      if (hintBtn) {
        hintBtn.classList.remove('hidden', 'used');
        hintBtn.querySelector('#hint-cost').textContent = '-10%';
        hintBtn.title = "Get Hint (-10%)";
      }
      if (revealBtn) {
        revealBtn.classList.remove('hidden');
        revealBtn.classList.remove('used'); // Re-enable if disabled
        revealBtn.title = "Reveal Letter (-15%)";
      }
      if (hintTextEl) {
        hintTextEl.innerHTML = '<span class="hint-placeholder">Hints available (-10% penalty)</span>';
      }

      console.log(`[Game] Word length: ${length}, Attempts: ${maxAttempts}`);

      // Build UI
      UI.createGrid(maxAttempts, length);
      UI.generateKeyboard();
      UI.updateTimer(this.state.timeLeft);
      UI.updateScore(100); // Start with 100 potential
      // Empty grid initially
      UI.updateGrid([], 0, "", maxAttempts, length, this.state.revealedPositions);

      // Start timer
      this.startTimer();
      document.getElementById("pause-btn")?.classList.remove("hidden");

    } catch (e) {
      console.error("CRITICAL Game Start Error:", e);
      alert("Error starting game: " + e.message);
      UI.showScreen("dashboard");
    }
  },

  // ========================================
  // INPUT HANDLING (Updated for Reveals)
  // ========================================
  handleInput(key) {
    try {
      if (!this.state.isPlaying || this.state.isPaused) return;

      const maxLen = this.state.targetWordLength;
      let current = this.state.currentGuess;

      if (key === "BACKSPACE") {
        if (current.length > 0) {
          // Remove last char
          current = current.slice(0, -1);
          // If we land on a revealed position, keep removing until we hit a non-revealed slot
          // or empty string.
          while (current.length > 0 && this.state.revealedPositions[current.length - 1]) {
             current = current.slice(0, -1);
          }
          this.state.currentGuess = current;
          if (window.AudioController) AudioController.play("click");
        }
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
      } else if (current.length < maxLen && /^[A-Z]$/.test(key)) {
        // Prepare to append
        // Logic: Fill any revealed holes UP TO current length? 
        // No, currentGuess should already contain them if we did it right.
        
        let nextIdx = current.length;
        
        // Skip over any revealed letters immediately following current position
        // Actually, we need to append the revealed letter to the guess string
        while (this.state.revealedPositions[nextIdx]) {
            current += this.state.revealedPositions[nextIdx];
            nextIdx++;
        }
        
        // Now append the user's key if we still have room
        if (current.length < maxLen) {
            current += key;
            if (window.AudioController) AudioController.play("click");
            
            // Check if there are revealed letters *after* this new key
            let checkIdx = current.length;
            while (checkIdx < maxLen && this.state.revealedPositions[checkIdx]) {
                current += this.state.revealedPositions[checkIdx];
                checkIdx++;
            }
        }
        
        this.state.currentGuess = current;
      }

      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        this.state.currentGuess,
        this.state.maxAttempts,
        this.state.targetWordLength,
        this.state.revealedPositions
      );
    } catch (error) {
      console.error("Input Error:", error);
    }
  },

  // ========================================
  // GUESS SUBMISSION
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
        throw new Error("Validation failed");
      }

      const result = await res.json();
      // result: { correct, evaluation, solution, scoreMultiplier, revealedPositions }

      // Update score multiplier from server
      if (result.scoreMultiplier) {
          this.state.scoreMultiplier = result.scoreMultiplier;
          this.updateScoreDisplay();
      }
      
      // Sync revealed positions if server sent updates (e.g. from server-side logic)
      if (result.revealedPositions) {
           this.state.revealedPositions = result.revealedPositions;
      }

      const evaluation = result.evaluation;
      this.state.guesses.push({ word: guess, evaluation });

      // Update letter states
      guess.split("").forEach((char, i) => {
        const status = evaluation[i];
        const current = this.state.letterStates[char];
        if (status === "correct") this.state.letterStates[char] = "correct";
        else if (status === "present" && current !== "correct")
          this.state.letterStates[char] = "present";
        else if (status === "absent" && !current)
          this.state.letterStates[char] = "absent";
      });

      this.state.currentAttempt++;
      
      // Auto-fill new guess buffer with revealed letters
      let newBuffer = "";
      let idx = 0;
      while (idx < length && this.state.revealedPositions[idx]) {
          newBuffer += this.state.revealedPositions[idx];
          idx++;
      }
      this.state.currentGuess = newBuffer;

      // UI Updates
      UI.updateGrid(
        this.state.guesses,
        this.state.currentAttempt,
        this.state.currentGuess,
        this.state.maxAttempts,
        this.state.targetWordLength,
        this.state.revealedPositions
      );
      UI.updateKeyboard(this.state.letterStates);

      if (result.correct) {
        if (window.AudioController) AudioController.play("correct");
        setTimeout(() => {
          if (window.AudioController) AudioController.play("win");
          this.endGame(true, result.solution || guess);
        }, 500);
        return;
      }

      if (this.state.currentAttempt >= this.state.maxAttempts) {
        if (window.AudioController) AudioController.play("wrong");
        await this.revealAndEnd(); // Fetch solution
      } else {
        if (window.AudioController) AudioController.play("wrong");
      }

    } catch (error) {
      console.error("Submit Error:", error);
      alert("Error submitting guess: " + error.message);
    }
  },

  // ========================================
  // HINT SYSTEM (Progressive)
  // ========================================
  async requestHint() {
    if (!this.state.isPlaying) return;
    
    // Check if we are at max level (3)
    if (this.state.hintLevelUsed >= 3) {
        // Maybe regenerate level 3?
        // Current logic: just reuse or say "Max hints used"
        // Let's allow regeneration if implemented on server, but for now standard flow
    }

    const hintBtn = document.getElementById('hint-btn');
    const prevText = hintBtn ? hintBtn.innerHTML : '';
    
    if (hintBtn) {
        hintBtn.classList.add('loading'); // Add spinner style if exists
    }

    try {
      const res = await fetch("/api/game/hint", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
      
      if (res.status === 202) {
          // Pending
          UI.showAchievement({ title: "Thinking...", desc: "AI is generating a hint." }); // Reuse toast
          if (hintBtn) hintBtn.classList.remove('loading');
          return;
      }
      
      const data = await res.json();
      
      if (data.hint) {
        this.state.hintLevelUsed = data.level;
        this.state.scoreMultiplier = data.scoreMultiplier;
        
        this.showHintUI(data.hint, data.level);
        this.updateScoreDisplay();
        
        // Update Button for Next Level
        if (hintBtn) {
            hintBtn.classList.remove('loading');
            const cost = data.level === 1 ? '-20%' : data.level === 2 ? '-30%' : 'Max';
            hintBtn.querySelector('#hint-cost').textContent = cost;
            hintBtn.title = `Get Level ${data.level + 1} Hint (${cost})`;
            
            if (data.level >= 3) {
                // Keep enabled for regeneration? Or disable?
                // Plan says "Smart Hint Upgrade" allows regen.
                hintBtn.querySelector('#hint-cost').textContent = 'Refine';
                hintBtn.title = "Get Better Hint (Refresh)";
            }
        }
      } else if (data.message === "Pending") {
         UI.showAchievement({ title: "Thinking...", desc: "AI is generating a hint." });
      }
    } catch (e) {
      console.error("Hint Error:", e);
      if (hintBtn) hintBtn.classList.remove('loading');
    }
  },
  
  showHintUI(hintText, level) {
    const hintTextEl = document.querySelector('#hint-card .hint-text');
    if (hintTextEl) {
      const label = level === 1 ? "Structure" : level === 2 ? "Concept" : "Domain";
      hintTextEl.innerHTML = `
        <div class="hint-label">${label}</div>
        <div class="hint-content">${hintText}</div>
      `;
      
      const card = document.getElementById('hint-card');
      if (card) {
        card.classList.remove('flash-highlight');
        void card.offsetWidth;
        card.classList.add('flash-highlight');
      }
    }
  },

  // ========================================
  // REVEAL LETTER
  // ========================================
  async revealLetter() {
    if (!this.state.isPlaying) return;
    
    const revealBtn = document.getElementById('reveal-btn');
    if (!revealBtn || revealBtn.disabled) return;
    
    // Disable temporarily
    revealBtn.disabled = true;

    try {
      const res = await fetch("/api/game/reveal-letter", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
      
      const data = await res.json();
      
      if (data.error) {
          UI.showAchievement({ title: "Cannot Reveal", desc: data.error });
          revealBtn.disabled = false;
          return;
      }
      
      // { index, letter, scoreMultiplier }
      if (data.letter !== undefined && data.index !== undefined) {
          // Update State
          this.state.revealedPositions[data.index] = data.letter;
          this.state.scoreMultiplier = data.scoreMultiplier;
          
          this.updateScoreDisplay();
          
          // Re-sync input buffer with new revealed letter
          // We need to inject the letter into currentGuess at the right spot
          // Logic: just Re-build currentGuess based on what user typed + reveals
          // Actually, currentGuess might be "AB" and we revealed index 2 "C".
          // New buffer should be "ABC".
          // Simple approach: Clear buffer and re-handle inputs via simulation? No.
          // Better: Just apply the reveal logic used in handleInput.
          
          let newGuess = "";
          const userTypedChars = this.state.currentGuess.split('').filter((c, i) => !this.state.revealedPositions[i]); 
          // Wait, previous revealed positions might complicate this filtering.
          // Let's just trust that `this.state.currentGuess` *contains* all currently knowns in correct spots.
          // But now we have a NEW known.
          
          // Let's rebuild:
          // Take all NON-revealed chars from currentGuess.
          // (Actually, if we just revealed index 2, and currentGuess was length 2 "AB", now we want "AB C"?)
          // No, if I have "AB" and reveal index 2 "C", I want "ABC".
          
          // Let's assume currentGuess is correct up to its length.
          // We just revealed an index.
          // Check if that index is > currentGuess.length?
          // If revealed index is 4, and we have 2 chars. nothing changes in string yet.
          // If revealed index is 0, and we have "BC". String becomes "ABC"?
          
          // Wait, if I reveal index 0 'A', and I had typed 'B' (thinking it was first).
          // Does 'B' shift to index 1?
          // Wordle logic: NO. You typed 'B' at slot 0.
          // If slot 0 is revealed as 'A', your 'B' is invalid/overwritten?
          // Yes, revealed letters are immutable truths.
          // Any user input at that position is overwritten.
          
          // So:
          // 1. Map current user input chars?
          // Actually, if I reveal a letter, it's best to keep the user's valid guesses if possible, but simplest to specific index override.
          
          const maxLen = this.state.targetWordLength;
          let rebuilt = "";
          // We don't know which chars in currentGuess were user-typed vs previous reveals easily unless we tracked it.
          // But we can just iterate 0..maxLen
          for (let i = 0; i < maxLen; i++) {
              if (this.state.revealedPositions[i]) {
                  rebuilt += this.state.revealedPositions[i];
              } else {
                  // Use what was in currentGuess at this index?
                  // NOTE: This might preserve a wrong user guess at a now-revealed position?
                  // if i < currentGuess.length.
                  // If currentGuess[i] exists, keep it?
                  // BUT if we just revealed this position, we want the revealed char (handled by if clause).
                  // So we only keep `currentGuess[i]` if NOT revealed.
                  if (i < this.state.currentGuess.length) {
                      rebuilt += this.state.currentGuess[i];
                  } else {
                      break; // Stop rebuilding at end of length
                  }
              }
          }
          this.state.currentGuess = rebuilt;
          
          // Force update grid
          UI.updateGrid(
            this.state.guesses,
            this.state.currentAttempt,
            this.state.currentGuess,
            this.state.maxAttempts,
            this.state.targetWordLength,
            this.state.revealedPositions
          );
      }
      
    } catch (e) {
      console.error("Reveal Error:", e);
    } finally {
       revealBtn.disabled = false;
    }
  },

  updateScoreDisplay() {
      const potential = Math.round(100 * this.state.scoreMultiplier);
      const scoreEl = document.getElementById('current-score');
      if (scoreEl) {
          scoreEl.textContent = potential;
          if (this.state.scoreMultiplier < 1.0) {
              scoreEl.classList.add('penalty-active');
          }
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
    
    // UI Update
    UI.updateScore(score);

    // Show result
    setTimeout(() => {
        // Reuse UI.showResult
        // Just mocking attempts/time for now
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
            score: score,
        });
    }, 1000);
  },
  
  // ========================================
  // SCORING (Unused legacy or update helper)
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
        penaltyMultiplier: this.state.scoreMultiplier
      });
      return scoreData.wordScore;
    }
    // Simple fallback
    return win ? Math.round(100 * this.state.scoreMultiplier) : 0;
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
      hintLevelUsed: 0,
      revealedPositions: {},
       scoreMultiplier: 1.0,
      hintPackStatus: "idle",
    };
    
    // Reset Hint UI
    const hintTextEl = document.querySelector('#hint-card .hint-text');
    // Don't reset to empty, reset to Call to Action?
    // start() handles the initial UI setup.
    // Ensure button states cleared
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
       hintBtn.classList.remove('loading', 'used');
       hintBtn.title = 'Get Hint';
    }
    const revealBtn = document.getElementById('reveal-btn');
    if (revealBtn) {
        revealBtn.disabled = false;
    }
  },

  restart() {
    this.start();
  },

  resume() {
    this.start(); // Always start new for now
  },

  quitToHome() {
    this.resetState();
    document.getElementById("pause-btn")?.classList.add("hidden");
    UI.showScreen("dashboard");
  },

  saveProgress() {
      // No-op for now
  },
};
