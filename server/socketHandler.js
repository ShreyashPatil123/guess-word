const { generatePartyCode } = require('./utils/codeGenerator');
const {
  createParty, getParty, addPlayerToParty, removePlayerFromParty,
  lockParty, saveRound, getRound, saveGuess, advancePartyRound, finishParty
} = require('./partyStore');
const {
  calculatePoints, getFinalLeaderboard, TOTAL_ROUNDS, ROUND_TIMER_SECONDS
} = require('./gameManager');

// In-memory timer store
const roundTimers = new Map();

function setupSocketEvents(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Player connected: ${socket.id}`);

    // ─── CREATE PARTY ───────────────────────────────────────────────────────────
    socket.on('create_party', async ({ playerName }, callback) => {
      try {
        let partyCode;
        // Ensure unique code
        let retries = 0;
        do { 
            partyCode = generatePartyCode(); 
            retries++;
        } while (await getParty(partyCode) && retries < 5);

        const party = await createParty(partyCode, socket.id, playerName);
        socket.join(partyCode);
        callback({ success: true, partyCode, party });
      } catch (e) {
        console.error("Create Party Error:", e);
        callback({ success: false, error: e.message });
      }
    });

    // ─── JOIN PARTY ─────────────────────────────────────────────────────────────
    socket.on('join_party', async ({ partyCode, playerName }, callback) => {
      try {
        const result = await addPlayerToParty(partyCode, socket.id, playerName);
        if (result.error) return callback({ success: false, error: result.error });

        socket.join(partyCode);
        io.to(partyCode).emit('lobby_updated', { party: result.party });
        callback({ success: true, party: result.party });
      } catch (e) {
        console.error("Join Party Error:", e);
        callback({ success: false, error: e.message });
      }
    });

    // ─── START GAME ─────────────────────────────────────────────────────────────
    socket.on('start_game', async ({ partyCode }, callback) => {
      console.log(`[START_GAME] Request from ${socket.id} for party ${partyCode}`);
      try {
        const party = await getParty(partyCode);
        if (!party) {
             console.error(`[START_GAME] Party ${partyCode} not found`);
             return callback({ error: 'Party not found' });
        }
        
        console.log(`[START_GAME] Party found. Host: ${party.host_id}, Requester: ${socket.id}, Players: ${party.party_players.length}`);
        
        if (party.host_id !== socket.id) {
             console.error(`[START_GAME] Host mismatch. Party Host: ${party.host_id} !== Request Socket: ${socket.id}`);
             return callback({ error: 'Only the host can start' });
        }
        
        if (party.party_players.length < 2) {
             console.error(`[START_GAME] Not enough players. Count: ${party.party_players.length}`);
             return callback({ error: 'Need at least 2 players' });
        }

        await lockParty(partyCode); // Status -> 'in_progress'

        const giver = party.party_players[0]; // Round 1 giver
        console.log(`[START_GAME] Success. Emitting game_started to room ${partyCode}`);
        
        io.to(partyCode).emit('game_started', {
          round: 1, totalRounds: TOTAL_ROUNDS,
          giverId: giver.socket_id, giverName: giver.player_name
        });
        callback({ success: true });
      } catch (e) {
        console.error(`[START_GAME] Exception:`, e);
        callback({ error: e.message });
      }
    });

    // ─── SUBMIT WORD & HINT ─────────────────────────────────────────────────────
    socket.on('submit_word_hint', async ({ partyCode, word, hint }, callback) => {

      try {
        const party = await getParty(partyCode);
        if (!party) return callback({ error: 'Party not found' });

        const giver = party.party_players[party.current_giver_index % party.party_players.length];
        if (giver.socket_id !== socket.id) return callback({ error: 'You are not the word giver' });

        await saveRound(partyCode, party.current_round, word.toLowerCase().trim(), hint);

        socket.to(partyCode).emit('round_hint_revealed', {
          hint, wordLength: word.trim().length,
          round: party.current_round, giverName: giver.player_name
        });
        
        // Also tell the Giver it was successful so they change UI
        callback({ success: true });

        startRoundTimer(partyCode, io);
      } catch (e) {
        callback({ error: e.message });
      }
    });

    // ─── SUBMIT GUESS ────────────────────────────────────────────────────────────
    socket.on('submit_guess', async ({ partyCode, guess }, callback) => {
      try {
        const party = await getParty(partyCode);
        if (!party) return callback({ error: 'Party not found' });

        const round = await getRound(partyCode, party.current_round);

        if (!round) return callback({ error: 'No active round' });

        const player = party.party_players.find(p => p.socket_id === socket.id);
        const isCorrect = guess.toLowerCase().trim() === round.word;

        if (isCorrect) {
          // Count prior correct guesses
          const { count } = await require('./partyStore').getRoundGuessesCount(partyCode, party.current_round);
           
          const order = count + 1;
           const totalGuessers = party.party_players.length - 1;
           const points = calculatePoints(order - 1, totalGuessers);

           await saveGuess(partyCode, party.current_round, socket.id, player.player_name, order, points);

           const updatedParty = await getParty(partyCode);
           io.to(partyCode).emit('player_guessed_correct', {
             playerName: player.player_name, order, points,
             scores: updatedParty.party_players.map(p => ({
               name: p.player_name, score: p.score, id: p.socket_id
             }))
           });

           if (order >= totalGuessers) endRound(partyCode, io);
           callback({ success: true, correct: true, points });
        } else {
           callback({ success: true, correct: false });
        }
      } catch (e) {
        console.error(e);
        callback({ error: e.message });
      }
    });

    // ─── DISCONNECT ─────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const result = await removePlayerFromParty(socket.id);
      if (result.updated) {
          io.to(result.code).emit('lobby_updated', { party: result.party });
      }
      console.log(`🔌 Player disconnected: ${socket.id}`);
    });
  });
}

function startRoundTimer(partyCode, io) {
  let timeLeft = ROUND_TIMER_SECONDS;
  
  // Clear existing if any
  if (roundTimers.has(partyCode)) clearInterval(roundTimers.get(partyCode));

  const interval = setInterval(() => {
    timeLeft--;
    io.to(partyCode).emit('timer_tick', { timeLeft });
    if (timeLeft <= 0) { 
        clearInterval(interval); 
        roundTimers.delete(partyCode); 
        endRound(partyCode, io); 
    }
  }, 1000);
  
  roundTimers.set(partyCode, interval);
}

async function endRound(partyCode, io) {
  if (roundTimers.has(partyCode)) { 
      clearInterval(roundTimers.get(partyCode)); 
      roundTimers.delete(partyCode); 
  }

  const party = await getParty(partyCode);
  const round = await getRound(partyCode, party.current_round);
  
  // Get guesses for summary
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
  const { data: guesses } = await supabase.from('round_guesses').select('*').eq('party_code', partyCode).eq('round_number', party.current_round);

  const leaderboard = [...party.party_players].sort((a, b) => b.score - a.score);

  io.to(partyCode).emit('round_ended', {
    word: round?.word || '', 
    hint: round?.hint || '',
    guesses: guesses || [], 
    leaderboard, 
    round: party.current_round
  });

  setTimeout(async () => {
    const nextRound = party.current_round + 1;
    const nextGiverIndex = party.current_giver_index + 1;

    if (nextRound > TOTAL_ROUNDS) {
      await finishParty(partyCode);
      const finalParty = await getParty(partyCode);
      io.to(partyCode).emit('game_over', {
        leaderboard: getFinalLeaderboard(finalParty)
      });
    } else {
      await advancePartyRound(partyCode, nextRound, nextGiverIndex);
      const updatedParty = await getParty(partyCode);
      const giver = updatedParty.party_players[nextGiverIndex % updatedParty.party_players.length];
      io.to(partyCode).emit('next_round_starting', {
        round: nextRound, totalRounds: TOTAL_ROUNDS,
        giverId: giver.socket_id, giverName: giver.player_name
      });
    }
  }, 5000);
}

module.exports = { setupSocketEvents };
