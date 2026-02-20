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
      const name = document.getElementById('multi-player-name').value.trim();
      if (!name) return alert("Please enter your name!");
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
      const name = document.getElementById('multi-player-name').value.trim();
      const code = document.getElementById('party-code-input').value.trim().toUpperCase();
      if (!name) return alert("Please enter your name!");
      if (code.length !== 8) return alert("Invalid Party Code (8 chars)");
      
      this.state.playerName = name;

      socket.emit('join_party', { partyCode: code, playerName: name }, (res) => {
        if (res.success) {
          this.state.partyCode = code;
          this.state.isHost = false;
          this.state.playerId = socket.id;
          this.refreshLobbyUI('room', res.party);
        } else {
          alert("Error joining party: " + res.error);
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

    // Giver Actions
    document.getElementById('submit-word-hint-btn').addEventListener('click', () => {
        const word = document.getElementById('giver-word-input').value.trim();
        const hint = document.getElementById('giver-hint-input').value.trim();
        
        if (!word || word.length < 3) return alert("Word too short!");
        if (!hint) return alert("Hint required!");

        socket.emit('submit_word_hint', { partyCode: this.state.partyCode, word, hint }, (res) => {
            if (res.success) {
                document.getElementById('giver-view').classList.add('hidden');
                const stat = document.getElementById('giver-status-msg');
                stat.textContent = "Word submitted! Guesses starting...";
                stat.classList.remove('hidden');
                // Could switch to a spectator view or just wait
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
            if (res.correct) {
                stat.textContent = `Correct! +${res.points} points`;
                stat.style.color = 'var(--correct-color)';
                document.getElementById('multi-guess-input').disabled = true;
                document.getElementById('submit-multi-guess-btn').disabled = true;
            } else {
                stat.textContent = "Incorrect, try again!";
                stat.style.color = 'var(--absent-color)';
                // Shake effect?
                setTimeout(() => stat.textContent = "", 2000);
            }
        });
        document.getElementById('multi-guess-input').value = "";
        document.getElementById('multi-guess-input').focus();
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
              const slots = document.getElementById('multi-word-slots');
              slots.innerHTML = '';
              for(let i=0; i<wordLength; i++) {
                  const s = document.createElement('div');
                  s.className = 'word-slot'; 
                  s.textContent = '_';
                  slots.appendChild(s);
              }
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
         list.innerHTML = leaderboard.map((p, i) => 
             `<li><span class="rank">#${i+1}</span> <span class="name">${p.player_name}</span> <span class="score">${p.score}pts</span></li>`
         ).join('');
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
      } else {
          menu.classList.add('hidden');
          room.classList.remove('hidden');
          
          if (party) {
              document.getElementById('display-party-code').textContent = party.code;
              document.getElementById('player-count').textContent = party.party_players.length;
              
              const list = document.getElementById('lobby-player-list');
              list.innerHTML = party.party_players.map(p => 
                  `<li class="${p.is_host ? 'host' : ''} ${p.socket_id === this.state.playerId ? 'me' : ''}">
                     ${p.is_host ? '👑 ' : ''}${p.player_name} ${p.socket_id === this.state.playerId ? '(You)' : ''}
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
          document.getElementById('guesser-view').classList.add('hidden');
          document.getElementById('giver-word-input').value = '';
          document.getElementById('giver-hint-input').value = '';
          document.getElementById('giver-status-msg').classList.add('hidden');
      } else {
          document.getElementById('giver-view').classList.add('hidden');
          document.getElementById('guesser-view').classList.remove('hidden');
          document.getElementById('multi-hint-text').textContent = "Waiting for giver to choose word...";
          document.getElementById('multi-word-slots').innerHTML = "";
          document.getElementById('guesser-status-msg').textContent = "";
          document.getElementById('multi-guess-input').value = "";
      }
  }
};

window.Multiplayer = Multiplayer; // Expose globally
document.addEventListener('DOMContentLoaded', () => Multiplayer.init());
