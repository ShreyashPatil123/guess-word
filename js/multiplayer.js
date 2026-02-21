// Multiplayer Client Logic
// Relies on socket.io client being loaded globally

const socket = io({ autoConnect: false });

const Multiplayer = {
  state: {
    partyCode: null,
    isHost: false,
    playerName: null,
    playerId: null, // Socket ID
    currentRound: 0,
    isGiver: false,
    timerInterval: null
  },

  init() {
    console.log("🎮 Multiplayer module initialized");
    this.bindEvents();
    this.bindSocketEvents();
  },

  // ─── UI BINDINGS ─────────────────────────────────────────────────────────────
  bindEvents() {
    // Mode Selection
    document.getElementById('mode-single-btn').addEventListener('click', () => {
      UI.closeModals();
      Game.start();
    });

    document.getElementById('mode-multi-btn').addEventListener('click', () => {
      document.getElementById('mode-select-modal').classList.add('hidden');
      UI.showModal('lobby-modal');
      this.refreshLobbyUI('menu');
      socket.connect();
    });

    // Lobby Actions
    document.getElementById('create-party-btn').addEventListener('click', () => {
      const name = Auth.currentUser?.username || "Guest_" + Math.random().toString(36).substr(2, 5);
      this.state.playerName = name;
      
      socket.emit('create_party', { playerName: name }, (res) => {
        if (res.success) {
          this.state.partyCode = res.partyCode;
          this.state.isHost = true;
          this.state.playerId = socket.id;
          this.refreshLobbyUI('room', res.party);
        } else {
          alert("Error creating party: " + res.error);
        }
      });
    });

    document.getElementById('join-party-btn').addEventListener('click', () => {
      const name = Auth.currentUser?.username || "Guest_" + Math.random().toString(36).substr(2, 5);
      const code = document.getElementById('party-code-input').value.trim().toUpperCase();
      if (code.length !== 8) return alert("Invalid Party Code (8 chars)");
      
      this.state.playerName = name;

      socket.emit('join_party', { partyCode: code, playerName: name }, (res) => {
        if (res.success) {
          this.state.partyCode = code;
          this.state.isHost = false;
          this.state.playerId = socket.id;
          this.refreshLobbyUI('room', res.party);
        } else {
          if (window.UI && UI.showToast) {
            UI.showToast(res.error);
          } else {
            alert("Error joining party: " + res.error);
          }
        }
      });
    });

    document.getElementById('leave-lobby-btn').addEventListener('click', () => {
        socket.disconnect(); // Will trigger removePlayer on server
        this.resetState();
        UI.closeModals();
        UI.showScreen('dashboard');
    });

    document.getElementById('start-multi-game-btn').addEventListener('click', () => {
        socket.emit('start_game', { partyCode: this.state.partyCode }, (res) => {
            if (res.error) alert(res.error);
        });
    });

    // Share/Copy Actions
    document.getElementById('copy-code-btn').addEventListener('click', () => {
        this.copyPartyCode();
    });

    document.getElementById('share-code-btn').addEventListener('click', () => {
        this.sharePartyInvite();
    });

    // Giver Actions
    document.getElementById('submit-word-hint-btn').addEventListener('click', () => {
        const word = document.getElementById('giver-word-input').value.trim();
        const hint = document.getElementById('giver-hint-input').value.trim();
        
        if (!word || word.length < 3) return alert("Word too short!");
        if (!hint) return alert("Hint required!");

        socket.emit('submit_word_hint', { partyCode: this.state.partyCode, word, hint }, (res) => {
            if (res.success) {
                // Hide inputs, keep card visible for guesses
                document.getElementById('giver-input-section').classList.add('hidden');
                
                // Show chosen word to Giver
                const wordDisplay = document.getElementById('giver-word-display');
                if (wordDisplay) {
                    document.getElementById('giver-current-word').textContent = word.toUpperCase();
                    wordDisplay.classList.remove('hidden');
                }

                const stat = document.getElementById('giver-status-msg');
                stat.textContent = "Word submitted! Guesses starting...";
                stat.classList.remove('hidden');
                
                // Show live guesses container for giver
                const guessContainer = document.getElementById('giver-live-guesses-container');
                if (guessContainer) guessContainer.classList.remove('hidden');
                document.getElementById('giver-live-guesses-list').innerHTML = ''; // Clear old rounds
            } else {
                alert(res.error);
            }
        });
    });

    // Guesser Actions
    document.getElementById('submit-multi-guess-btn').addEventListener('click', () => {
        const guess = document.getElementById('multi-guess-input').value.trim();
        if(!guess) return;

        socket.emit('submit_guess', { partyCode: this.state.partyCode, guess }, (res) => {
            const stat = document.getElementById('guesser-status-msg');
            if (res.evaluation) {
                this.updateMultiGrid(guess, res.evaluation);
            }

            if (res.correct) {
                stat.textContent = `Correct! +${res.points} points`;
                stat.style.color = 'var(--correct-color)';
                document.getElementById('multi-guess-input').disabled = true;
                document.getElementById('submit-multi-guess-btn').disabled = true;
            } else {
                stat.textContent = "Incorrect, try again!";
                stat.style.color = 'var(--absent-color)';
                setTimeout(() => {
                    stat.textContent = "";
                    // Reset grid to active state for next guess or leave keys?
                    // User wants "same working", so we keep the results shown? 
                    // Actually Wordle cleared on next row. Here we only have 1 row.
                    // Let's clear after a delay if they want to try again.
                    setTimeout(() => this.updateMultiGrid(""), 1000);
                }, 2000);
            }
        });
        document.getElementById('multi-guess-input').value = "";
        document.getElementById('multi-guess-input').focus();
    });

    // Real-time grid update while typing
    document.getElementById('multi-guess-input').addEventListener('input', (e) => {
        this.updateMultiGrid(e.target.value);
    });
  },

  resetState() {
      this.state = {
        partyCode: null,
        isHost: false,
        playerName: null,
        playerId: null,
        currentRound: 0,
        isGiver: false,
        timerInterval: null
      };
      if (this.state.timerInterval) clearInterval(this.state.timerInterval);
  },

  // ─── SOCKET EVENTS ───────────────────────────────────────────────────────────
  bindSocketEvents() {
      socket.on('lobby_updated', ({ party }) => {
          if (this.state.partyCode === party.code) {
              this.refreshLobbyUI('room', party);
          }
      });

      socket.on('game_started', ({ round, totalRounds, giverId, giverName }) => {
          UI.closeModals();
          UI.showScreen('multiplayer-game-screen');
          this.setupRound(round, giverId);
      });

      socket.on('round_hint_revealed', ({ hint, wordLength }) => {
          if (!this.state.isGiver) {
              document.getElementById('multi-hint-text').textContent = hint;
              // Use consistent grid creation to ensure .tile classes
              this.createMultiGrid(wordLength);

              document.getElementById('guesser-status-msg').textContent = "Guess the word!";
              document.getElementById('multi-guess-input').disabled = false;
              document.getElementById('submit-multi-guess-btn').disabled = false;
              document.getElementById('multi-guess-input').focus();
          }
      });

      socket.on('player_guessed_correct', ({ playerName, order, points }) => {
          // Toast or ticker?
          const msg = `${playerName} guessed it! (#${order}) +${points}`;
          // Show briefly
          const stat = this.state.isGiver ? document.getElementById('giver-status-msg') : document.getElementById('guesser-status-msg');
          const original = stat.textContent;
          stat.textContent = msg;
          setTimeout(() => { if(stat.textContent === msg) stat.textContent = original; }, 3000);

          // If Giver, also add to live feed as correct
          if (this.state.isGiver) {
              this.addGuessToLiveFeed(playerName, 'CORRECT!', true);
          }
      });

      socket.on('new_guess_received', ({ playerName, guess, correct }) => {
          if (this.state.isGiver) {
              this.addGuessToLiveFeed(playerName, guess, correct);
          }
      });

      socket.on('timer_tick', ({ timeLeft }) => {
          const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
          const s = (timeLeft % 60).toString().padStart(2, '0');
          document.getElementById('multi-timer').textContent = `${m}:${s}`;
      });

      socket.on('round_ended', ({ word, leaderboard }) => {
         // Show Round Results
         document.getElementById('giver-view').classList.add('hidden');
         document.getElementById('guesser-view').classList.add('hidden');
         document.getElementById('round-results-view').classList.remove('hidden');

         document.getElementById('round-word-reveal').textContent = word.toUpperCase();
         
         const list = document.getElementById('round-leaderboard-list');
         list.innerHTML = leaderboard.map((p, i) => {
             const rankClass = i === 0 ? 'podium-item first' : 'podium-item';
             return `<li class="${rankClass}">
                 <span class="rank">#${i+1}</span>
                 <span class="name">${p.player_name}</span>
                 <span class="score">${p.score}pts</span>
             </li>`;
         }).join('');
      });

      socket.on('next_round_starting', ({ round, giverId }) => {
          this.setupRound(round, giverId);
      });

      socket.on('game_over', ({ leaderboard }) => {
          // Reuse Final Results logic or redirect
          alert("Game Over! Winner: " + leaderboard[0].player_name);
          UI.showScreen('dashboard');
          this.resetState();
          socket.disconnect();
      });
  },

  // ─── HELPERS ──────────────────────────────────────────────────────────────────
  refreshLobbyUI(view, party = null) {
      const menu = document.getElementById('lobby-menu-view');
      const room = document.getElementById('lobby-room-view');

      if (view === 'menu') {
          menu.classList.remove('hidden');
          room.classList.add('hidden');
          
          // Populate username display
          const display = document.getElementById('multiplayer-username-display');
          if (display) {
              display.textContent = Auth.currentUser?.username || "Guest User";
          }
      } else {
          menu.classList.add('hidden');
          room.classList.remove('hidden');
          
          if (party) {
              document.getElementById('display-party-code').textContent = party.code;
              document.getElementById('player-count').textContent = party.party_players.length;
              
              const list = document.getElementById('lobby-player-list');
              list.innerHTML = party.party_players.map(p => 
                  `<li class="${p.is_host ? 'is-host' : ''} ${p.socket_id === this.state.playerId ? 'is-me' : ''}">
                     ${p.player_name} ${p.socket_id === this.state.playerId ? '(You)' : ''}
                   </li>`
              ).join('');

              const startBtn = document.getElementById('start-multi-game-btn');
              const waitMsg = document.getElementById('waiting-msg');
              
              if (this.state.isHost && party.party_players.length >= 2) {
                  startBtn.classList.remove('hidden');
                  waitMsg.classList.add('hidden');
              } else {
                  startBtn.classList.add('hidden');
                  waitMsg.classList.remove('hidden');
                  if (this.state.isHost) {
                      waitMsg.textContent = "Waiting for players...";
                  } else {
                      waitMsg.textContent = "Waiting for host to start...";
                  }
              }
          }
      }
  },

  setupRound(round, giverId) {
      this.state.currentRound = round;
      this.state.isGiver = (socket.id === giverId);
      
      document.getElementById('multi-round').textContent = round;
      document.getElementById('round-results-view').classList.add('hidden');

      if (this.state.isGiver) {
          document.getElementById('giver-view').classList.remove('hidden');
          document.getElementById('giver-input-section').classList.remove('hidden'); // Show inputs
          document.getElementById('guesser-view').classList.add('hidden');
          document.getElementById('giver-word-input').value = '';
          document.getElementById('giver-hint-input').value = '';
          document.getElementById('giver-status-msg').classList.add('hidden');
           
          const guessContainer = document.getElementById('giver-live-guesses-container');
          if (guessContainer) guessContainer.classList.add('hidden');
      } else {
          document.getElementById('giver-view').classList.add('hidden');
          document.getElementById('guesser-view').classList.remove('hidden');
          document.getElementById('multi-hint-text').textContent = "Waiting for giver to choose word...";
          document.getElementById('multi-word-slots').innerHTML = "";
          document.getElementById('guesser-status-msg').textContent = "";
          document.getElementById('multi-guess-input').value = "";
          document.getElementById('multi-guess-input').disabled = false;
          document.getElementById('submit-multi-guess-btn').disabled = false;

          // Clear previous grid, wait for hint event to know word length
          document.getElementById('multi-word-slots').innerHTML = "";
      }
  },

  createMultiGrid(cols) {
      const container = document.getElementById('multi-word-slots');
      container.innerHTML = '';
      container.style.setProperty('--letters-per-word', cols);
      
      // Multiplayer grids are typically 1 row at a time for the current guess, 
      // but we want to show past guesses too? 
      // User asked for "same UI as Singleplayers guess has".
      // Solo grid shows 6 rows. Multiplayer is "One Word. One Winner." 
      // Let's create a single active row for the guesser.
      for (let i = 0; i < cols; i++) {
          const tile = document.createElement('div');
          tile.className = 'tile empty';
          tile.dataset.index = i;
          container.appendChild(tile);
      }
  },

  updateMultiGrid(guess, evaluation = null) {
      const tiles = document.querySelectorAll('#multi-word-slots .tile');
      const letters = guess.toUpperCase().split('');

      tiles.forEach((tile, i) => {
          const char = letters[i] || '';
          tile.textContent = char;
          
          if (evaluation) {
              tile.dataset.state = evaluation[i];
          } else {
              tile.dataset.state = char ? 'active' : 'empty';
          }
      });
  },

  copyPartyCode() {
    if (!this.state.partyCode) return;
    navigator.clipboard.writeText(this.state.partyCode).then(() => {
        UI.showToast("Party Code copied!");
    });
  },

  sharePartyInvite() {
    if (!this.state.partyCode) return;
    
    const username = Auth.currentUser?.username || "A friend";
    const inviteTemplate = `⚔ Word Battle Invitation

${username} has challenged you to a live Guess The Word duel.

PARTY CODE: ${this.state.partyCode}

Real-time match.
One word.
One winner.

Enter the code to accept the challenge.`;

    if (navigator.share) {
        navigator.share({
            title: 'Guess the Word Challenge',
            text: inviteTemplate
        }).catch(err => {
            this.copyInviteToClipboard(inviteTemplate);
        });
    } else {
        this.copyInviteToClipboard(inviteTemplate);
    }
  },

  copyInviteToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        UI.showToast("Invitation copied to clipboard!");
    });
  },

  addGuessToLiveFeed(playerName, guess, correct) {
      const list = document.getElementById('giver-live-guesses-list');
      if (!list) return;

      const item = document.createElement('li');
      item.className = correct ? 'guess-item correct' : 'guess-item';
      item.innerHTML = `
          <span class="guesser-name">${playerName}</span>
          <span class="guess-val">${guess.toUpperCase()}</span>
      `;
      
      list.prepend(item); // Show newest first
  }
};

window.Multiplayer = Multiplayer; // Expose globally
document.addEventListener('DOMContentLoaded', () => Multiplayer.init());
