/**
 * Party CRUD operations — all backed by the existing Supabase project.
 * Replaces the old in-memory Map store entirely.
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

// Initialize Supabase Client (Service Role for backend)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY; 

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Stats: Supabase credentials missing (partyStore.js)");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createParty(partyCode, hostSocketId, hostName) {
  // Insert the party row
  const { error: partyError } = await supabase
    .from('parties')
    .insert({ code: partyCode, host_id: hostSocketId, status: 'waiting' });

  if (partyError) throw partyError;

  // Insert the host as first player
  const { error: playerError } = await supabase
    .from('party_players')
    .insert({ party_code: partyCode, socket_id: hostSocketId, player_name: hostName, is_host: true });

  if (playerError) throw playerError;

  return getParty(partyCode);
}

async function getParty(partyCode) {
  const { data: party, error } = await supabase
    .from('parties')
    .select('*, party_players(*)')
    .eq('code', partyCode)
    .single();

  if (error) return null;
  return party;
}

async function addPlayerToParty(partyCode, socketId, playerName) {
  const party = await getParty(partyCode);
  if (!party) return { error: 'Party not found' };
  if (party.status !== 'waiting') return { error: 'Game already started' };
  if (party.party_players.length >= 8) return { error: 'max no of players are already in the PARTY' };

  const { error } = await supabase
    .from('party_players')
    .insert({ party_code: partyCode, socket_id: socketId, player_name: playerName, is_host: false });

  if (error) return { error: error.message };
  return { success: true, party: await getParty(partyCode) };
}

async function removePlayerFromParty(socketId) {
  // Find which party this player is in
  const { data: playerRow } = await supabase
    .from('party_players')
    .select('party_code, is_host')
    .eq('socket_id', socketId)
    .single();

  if (!playerRow) return { notFound: true };

  const { party_code: code, is_host: wasHost } = playerRow;

  await supabase.from('party_players').delete().eq('socket_id', socketId);

  // Check if party is empty
  const party = await getParty(code);
  if (!party || !party.party_players || party.party_players.length === 0) {
    await supabase.from('parties').delete().eq('code', code);
    return { deleted: true, code };
  }

  // Promote a new host if needed
  if (wasHost && party.party_players.length > 0) {
    const newHost = party.party_players[0];
    await supabase.from('party_players').update({ is_host: true }).eq('socket_id', newHost.socket_id);
    await supabase.from('parties').update({ host_id: newHost.socket_id }).eq('code', code);
  }

  return { updated: true, party: await getParty(code), code };
}

async function lockParty(partyCode) {
  await supabase.from('parties').update({ status: 'in_progress', current_round: 1 }).eq('code', partyCode);
}

async function saveRound(partyCode, roundNumber, word, hint) {
  await supabase.from('game_rounds').insert({ party_code: partyCode, round_number: roundNumber, word, hint });
}

async function getRound(partyCode, roundNumber) {
  const { data } = await supabase
    .from('game_rounds')
    .select('*')
    .eq('party_code', partyCode)
    .eq('round_number', roundNumber)
    .single();
  return data;
}

async function saveGuess(partyCode, roundNumber, playerId, playerName, guessOrder, points) {
  await supabase.from('round_guesses').insert({
    party_code: partyCode, round_number: roundNumber,
    player_id: playerId, player_name: playerName,
    guess_order: guessOrder, points
  });
  // Update cumulative score on the player row via RPC
  await supabase.rpc('increment_player_score', { p_socket_id: playerId, p_points: points });
}

async function advancePartyRound(partyCode, nextRound, nextGiverIndex) {
  await supabase.from('parties').update({
    current_round: nextRound,
    current_giver_index: nextGiverIndex
  }).eq('code', partyCode);
}

async function finishParty(partyCode) {
  await supabase.from('parties').update({ status: 'finished' }).eq('code', partyCode);
}

async function getRoundGuessesCount(partyCode, roundNumber) {
  const { count, error } = await supabase
    .from('round_guesses')
    .select('*', { count: 'exact', head: true })
    .eq('party_code', partyCode)
    .eq('round_number', roundNumber);
    
  if (error) return { count: 0 };
  return { count };
}

module.exports = {
  createParty, getParty, addPlayerToParty, removePlayerFromParty,
  lockParty, saveRound, getRound, saveGuess, advancePartyRound, finishParty,
  getRoundGuessesCount
};
