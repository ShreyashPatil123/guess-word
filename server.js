/**
 * Guess the Word Game - Backend Server
 *
 * Authentication System:
 * - MojoAuth: Used ONLY for OTP verification during SIGNUP
 * - Supabase: Stores users with hashed passwords
 * - bcrypt: Password hashing (never store plaintext)
 *
 * Security Rules:
 * - Signup requires OTP verification
 * - Login uses email + password only (no OTP)
 * - Passwords hashed with bcrypt before storage
 */

const fs = require('fs');
const path = require('path');
// Load .env allowing override for safety, but checking first
const dotenv = require("dotenv");
const envConfig = (() => {
  try {
    return dotenv.parse(fs.readFileSync(path.join(__dirname, '.env')));
  } catch (e) {
    // On Vercel, .env file doesn't exist; env vars are set in the dashboard
    console.log('ℹ️ No .env file found, using process.env (Vercel mode)');
    return {};
  }
})();

// 1. Snapshot Pre-load (OS Key)
const osKey = process.env.GEMINI_API_KEY;

// Load env vars
dotenv.config();

// 2. Parsed File Content
const fileKey = envConfig.GEMINI_API_KEY;

console.log("\n--- 🕵️ API KEY AUDIT ---");
console.log(`[OS/Shell] Key: ${osKey ? osKey.substring(0, 10) + '...' : 'UNDEFINED'}`);
console.log(`[.env File] Key: ${fileKey ? fileKey.substring(0, 10) + '...' : 'UNDEFINED'}`);

if (osKey && osKey !== fileKey) {
  console.error("🚨 CRITICAL MISMATCH: System is forcing an OLD key. Ignoring .env file.");
  console.log("👉 ACTION: Forcing override with .env value...");
  // FORCE Fix:
  process.env.GEMINI_API_KEY = fileKey;
  console.log("✅ FORCED .env key to be active.");
} else {
  console.log("✅ Key matches or loaded correctly.");
}
console.log("------------------------\n");
const express = require("express");
const cors = require("cors");

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { evaluateGuess } = require("./server/utils/gameLogic");

const app = express();
const PORT = process.env.PORT || 3000;

// ==================================
// CONFIGURATION
// FIX: Reduced default from 10 to 8 for serverless CPU time limits (Vercel 10s max)
const PASSWORD_HASH_ROUNDS = parseInt(process.env.PASSWORD_HASH_ROUNDS) || 8;
const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret-change-me";

// Supabase client for user database
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
let supabase = null;

if (supabaseUrl && (supabaseServiceKey || supabaseAnonKey)) {
  // Prefer Service Key for backend operations to bypass RLS
  supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
  console.log(
    `✓ Supabase client initialized (${supabaseServiceKey ? "Service" : "Anon"} Role)`,
  );
} else {
  console.warn("⚠ Supabase credentials not configured");
}

// MojoAuth for OTP (signup only)
const MOJOAUTH_API_KEY = process.env.MOJOAUTH_API_KEY;
const MOJOAUTH_API_BASE = "https://api.mojoauth.com";

if (MOJOAUTH_API_KEY) {
  console.log("✓ MojoAuth API Key configured");
} else {
  console.warn("⚠ MojoAuth API Key not configured (OTPs will fail)");
}

// SERVERLESS: Pending signups stored in Supabase 'pending_signups' table (not in-memory)

// ==================================
// MIDDLEWARE
// ==================================
app.use(cors());
// FIX: Explicit body size limit for security (prevents large payload attacks)
app.use(express.json({ limit: "5mb" }));
app.use(express.static(__dirname));

// ==================================
// GAME LOGIC & WORD BANK
// ==================================

const WORD_MARKDOWN_PATH = path.join(__dirname, 'data', 'master_word_bank.md');
const WORD_CACHE = {
    all: [] // Array of { word, category, pos, difficulty }
};
const HINT_CACHE = new Map(); // word -> hint string (populated on demand)
const ACTIVE_GAMES = new Map(); // userId -> { word, length, startTime, category, pos }

const CATEGORY_DEFINITIONS = {
    "Emotions & Feelings": "Related to a psychological state or mood.",
    "Actions & Movement Verbs": "Describes a physical action or process.",
    "Thinking & Communication Verbs": "Involves mental processes or speech.",
    "Home & Household Objects": "A common object found in a living space.",
    "Food & Drink": "Something edible or potable.",
    "Nature & Environment": "Related to the natural world or outdoors.",
    "Animals & Living Things": "A living creature or organism.",
    "People & Relationships": "Concerning humans or social bonds.",
    "Body & Health": "Relates to physical anatomy or well-being.",
    "⏰ Time & Sequence": "Deals with duration, order, or moments.",
    "Work & Career": "Related to professional life or employment.",
    "Money & Economy": "Involves finance, value, or trade.",
    "Education & Knowledge": "Pertains to learning or information.",
    "Arts & Creativity": "Connected to expression or culture.",
    "Sports & Games": "Related to competition or recreation.",
    "Travel & Places": "Involves locations or movement.",
    "Tools & Technology": "A device or instrument.",
    "Colours & Appearance": "Describes how something looks.",
    "Size, Shape & Quantity": "Describes dimensions or amounts.",
    "️ Texture, Temperature & Senses": "Related to physical sensation.",
    "Social & Society": "Pertains to community or interaction.",
    "️ Ethics, Law & Justice": "Related to rules, morals, or legality.",
    "Science & Nature Concepts": "A fundamental principle or natural phenomenon.",
    "Everyday Adjectives": "Used to describe common qualities.",
    "Mixed High-Frequency Words": "A very common word in the English language."
};

function loadWordsFromMarkdown() {
    try {
        if (!fs.existsSync(WORD_MARKDOWN_PATH)) {
            console.error("❌ Word bank file not found:", WORD_MARKDOWN_PATH);
            return;
        }

        const content = fs.readFileSync(WORD_MARKDOWN_PATH, 'utf-8');
        const lines = content.split('\n');
        let count = 0;
        let currentCategory = "General";

        lines.forEach(line => {
             // Track category headers: ## CATEGORY 01: 😊 Emotions & Feelings
             const catMatch = line.match(/^##\s+CATEGORY\s+\d+:\s*(.+)/i);
             if (catMatch) {
                 // Strip emoji and trim
                 currentCategory = catMatch[1].replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
                 return;
             }

             // Parse table rows: | 001 | love | 4 | Noun | Easy |
             const parts = line.split('|').map(p => p.trim());
             if (parts.length >= 6 && parts[2]) {
                 const word = parts[2].toUpperCase();
                 const pos = parts[4] || "Word";
                 const diff = parts[5] || "Medium";
                 // Skip header rows, separator rows, and short words
                 if (word === 'WORD' || word === '---' || word.length < 3) return;
                 if (/^[A-Z]{3,}$/.test(word)) {
                     WORD_CACHE.all.push({
                         word,
                         category: currentCategory,
                         pos: pos,
                         difficulty: diff
                     });
                     count++;
                 }
             }
        });

        console.log(`✅ Loaded ${count} words from Markdown into memory.`);
    } catch (e) {
        console.error("❌ Failed to load word bank:", e);
    }
}

// Load immediately on start
loadWordsFromMarkdown();

// Load pre-generated hints for 6+ letter words
try {
    const hintsPath = require('path').join(__dirname, 'data', 'hints.json');
    if (fs.existsSync(hintsPath)) {
        const hintsData = JSON.parse(fs.readFileSync(hintsPath, 'utf-8'));
        for (const [word, hint] of Object.entries(hintsData)) {
            HINT_CACHE.set(word, hint);
        }
        console.log(`💡 Loaded ${HINT_CACHE.size} pre-generated hints.`);
    }
} catch (e) {
    console.warn("⚠️ Could not load hints.json:", e.message);
}

// ==================================
// GAME ROUTES
// ==================================

/**
 * GET /api/game/start
 * Starts a new game with a RANDOM word from the bank.
 */
// ==================================
// GEMINI INTEGRATION & HINT LOGIC
// ==================================

// Helper to call Gemini AI (with timeout)
async function callGemini(prompt, systemInstruction = "You are a helpful game assistant.") {
    if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
        const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        console.log(`[Gemini] Using model: ${model}`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { responseMimeType: "application/json" }
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Gemini] API Usage Error (${response.status}):`, errorText);
            throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        // DEBUG LOG
        // console.log("[Gemini] Raw Response:", text);

        if (!text) {
             console.error("[Gemini] Empty response data:", JSON.stringify(data));
             throw new Error("Empty response from Gemini");
        }

        try {
            return JSON.parse(text); 
        } catch (e) {
            console.error("[Gemini] JSON Parse Error. Raw Text:", text);
            throw e;
        }

    } catch (error) {
        clearTimeout(timeout);
        console.error("[Gemini] Exception:", error.message);
        throw error;
    }
}


/**
 * POST /api/game/start
 * Starts a new game with a RANDOM word from the bank.
 */
app.post("/api/game/start", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        let userId = req.headers['x-guest-id'] || ("guest_" + Date.now()); 

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const payload = verifySessionToken(token);
            if (payload) userId = payload.userId;
        }

        if (WORD_CACHE.all.length === 0) {
            return res.status(500).json({ error: "Word bank is empty" });
        }

        // Pick completely random word object
        const validWords = WORD_CACHE.all;
        const entry = validWords[Math.floor(Math.random() * validWords.length)];
        
        // Create game session with EXPANDED state
        const game = {
            word: entry.word,
            length: entry.word.length,
            category: entry.category,
            pos: entry.pos,
            startTime: Date.now(),
            
            // New Progressive Hint State
            hintPack: null,              // Will hold { level1, level2, level3 }
            hintPackStatus: "pending",   // pending | ready | failed
            hintLevelUsed: 0,            // 0 = none, 1 = lvl1 used, etc.
            revealedPositions: {},       // Map-like Object { index: char }
            guesses: [],                 // Array of previous guesses
            scoreMultiplier: 1.0,        // Starts at 1.0 (100%)
            finalScore: 0                // Calculated at game end
        };
        
        // Store game state
        ACTIVE_GAMES.set(userId, game);

        // TRIGGER ASYNC HINT GENERATION (Fire & Forget)
        generateHintPack(userId, entry.word).catch(err => console.error("Async Hint Gen Failed:", err));

        res.json({ 
            length: entry.word.length,
            message: "Game started",
            // Client doesn't need hint immediately, it will request it via /api/game/hint
        });

    } catch (error) {
        console.error("Link Start Error:", error);
        res.status(500).json({ error: "Failed to start game" });
    }
});

// Async Hint Generator
async function generateHintPack(userId, word) {
    const game = ACTIVE_GAMES.get(userId);
    if (!game) return;

    try {
        const prompt = `Target word: ${word}`;
        const systemPrompt = `You are generating hints for a word-guessing game.

ABSOLUTE RULE:
Each hint MUST be specific to the target word.
Generic hints are INVALID and must NEVER be generated.

INVALID examples (do NOT do this):
- "It's a common English word"
- "Try guessing common letters"
- "You use this word often"
- "Think carefully"

If a hint could apply to many unrelated words, it is WRONG.

STRICT CONSTRAINTS:
- Do NOT reveal the word
- Do NOT mention letters
- Do NOT mention word length
- Do NOT give synonyms or rhymes
- Do NOT give spelling clues
- Each hint must relate to meaning, category, or real-world usage
- Each hint must be under 12 words
- Hints must grow progressively more specific

HINT LEVELS:
Level 1 → broad category
Level 2 → contextual usage
Level 3 → strong but non-revealing clue

Return ONLY valid JSON.
No explanations.
No markdown.
No extra text.

{
  "level1": "",
  "level2": "",
  "level3": ""
}`;

        const hints = await callGemini(prompt, systemPrompt);
        
        game.hintPack = hints;
        game.hintPackStatus = "ready";
        console.log(`[Hint] Generated successfully for ${word} (${userId})`);
        console.log(`[Hint] Generated successfully for ${word} (${userId})`);

    } catch (error) {
        console.error(`[Hint] Generation failed for ${word}:`, error.message);
        // Fallback Strategy (Semantic & No Letter Reveals)
        const wordLen = word.length;
        const pos = game.pos || "word"; 
        const category = game.category || "General";
        const concept = CATEGORY_DEFINITIONS[category] || "A common English word.";

        game.hintPack = {
            level1: `It is a ${wordLen}-letter ${pos}.`, // Structure
            level2: `${concept}`, // Concept (Vague Meaning)
            level3: `It belongs to the category: ${category}.` // Domain (Specific)
        };
        game.hintPackStatus = "ready"; // Ready with fallbacks
        console.warn(`[Hint] Using SEMANTIC FALLBACK hints for ${word}`);
    }

}

/**
 * POST /api/check-guess
 * Validates a user's guess
 */
app.post("/api/check-guess", async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const { guess } = req.body;
        
        if (!guess) return res.status(400).json({ error: "Guess required" });

        const game = ACTIVE_GAMES.get(userId);

        if (!game) {
             return res.status(404).json({ error: "No active game found. Start a new game." });
        }

        const target = game.word;
        const evaluation = evaluateGuess(guess.toUpperCase(), target);
        const correct = (guess.toUpperCase() === target);
        
        // Track Guess
        game.guesses.push(guess.toUpperCase());

        // Calculate Final Score if Correct
        if (correct) {
            // Assumed Base Score = 100
             game.finalScore = Math.round(100 * game.scoreMultiplier); 
        }

        res.json({
            correct,
            evaluation,
            solution: correct ? target : null,
            scoreMultiplier: game.scoreMultiplier,
            revealedPositions: game.revealedPositions
        });

    } catch (error) {
        console.error("Check Guess Error:", error);
        res.status(500).json({ error: "Validation failed" });
    }
});

// Helper: Evaluate Guess (moved to server/utils/gameLogic.js)

app.post("/api/game/reveal", (req, res) => {
    const authHeader = req.headers.authorization;
    let userId = req.headers['x-guest-id'] || 'guest';
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const payload = verifySessionToken(token);
        if (payload) userId = payload.userId;
    }
    
    const game = ACTIVE_GAMES.get(userId);
    if (!game) return res.status(404).json({ error: "No game" });
    res.json({ word: game.word });
});

// ==================================
// PROGRESSIVE HINT ENDPOINTS
// ==================================

/**
 * POST /api/game/hint
 * Returns the next available hint (Level 1 -> 2 -> 3)
 * Penalties: Lvl1 (10%), Lvl2 (20%), Lvl3 (30%)
 */
app.post("/api/game/hint", async (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const game = ACTIVE_GAMES.get(userId);
        
        if (!game) return res.status(404).json({ error: "No active game" });
        
        // Block if generation is still pending
        if (game.hintPackStatus === "pending") {
            // Simple polling wait (max 4 seconds)
            for (let i = 0; i < 20; i++) {
                await new Promise(r => setTimeout(r, 200));
                if (game.hintPackStatus !== "pending") break;
            }
        }

        // Determine current level to serve (next level)
        const nextLevel = game.hintLevelUsed + 1;

        if (nextLevel > 3) {
            return res.status(400).json({ error: "No more hints available" });
        }

        let hintText = null;
        let penalty = 0;

        // Level 1: Static from Pack
        if (nextLevel === 1) {
            hintText = game.hintPack?.level1 || "It's a common English word.";
        }
        // Level 2 & 3: Try Dynamic if guesses exist, else Fallback to Pack
        else if (nextLevel === 2 || nextLevel === 3) {
            // Only use dynamic if user has actually guessed (to give board-aware hints)
            if (game.guesses.length > 0) {
                 try {
                     // Generate Dynamic Hint
                     const dynamicHint = await generateDynamicHint(game.word, game.guesses);
                     if (dynamicHint) {
                         hintText = dynamicHint;
                     } else {
                         hintText = (nextLevel === 2) ? game.hintPack?.level2 : game.hintPack?.level3;
                     }
                 } catch (e) {
                     console.error("Dynamic hint failed:", e);
                     hintText = (nextLevel === 2) ? game.hintPack?.level2 : game.hintPack?.level3;
                 }
            } else {
                // No guesses? Use static pack.
                hintText = (nextLevel === 2) ? game.hintPack?.level2 : game.hintPack?.level3;
            }
        }

        // Fallbacks if pack missing
        if (!hintText) {
             if (nextLevel === 2) hintText = "Often used in daily life.";
             if (nextLevel === 3) hintText = "Try guessing common letters.";
        }
        
        // Calculate Score Penalty (cumulative)
        // Lvl 1: 0.10, Lvl 2: 0.20, Lvl 3: 0.30 (Total could be 0.60 if all used?)
        // OR is it replacement? Plan said "Score penalty: 10%" then "20%". 
        // Let's assume the cost of unlocking the hint is fixed per level.
        // But game.scoreMultiplier logic in updateScoreMultiplier handles the total reduction.
        
        game.hintLevelUsed = nextLevel;
        updateScoreMultiplier(game);

        res.json({
            hint: hintText,
            level: nextLevel,
            scoreMultiplier: game.scoreMultiplier
        });

    } catch (error) {
        console.error("Hint Error:", error);
        res.status(500).json({ error: "Failed to get hint" });
    }
});

// Dynamic Hint Generator (Level 2/3)
async function generateDynamicHint(word, guesses) {
    try {
        // Calculate board state for the prompt
        const targetArr = word.split('');
        const correctPositions = [];
        const wrongLetters = new Set();
        
        // simple analysis of best guess so far? or aggregate?
        // Let's aggregate knowns from all guesses
        guesses.forEach(g => {
            const gArr = g.split('');
            gArr.forEach((char, i) => {
                if (char === targetArr[i]) {
                    correctPositions.push(`${char} at #${i+1}`);
                } else if (!word.includes(char)) {
                    wrongLetters.add(char);
                }
            });
        });

        const prompt = `Target word: ${word}
Guesses so far: ${guesses.join(", ")}
Correct positions found: ${correctPositions.join(", ") || "None"}
Wrong letters: ${Array.from(wrongLetters).join(", ") || "None"}

Generate ONE helpful hint that narrows possibilities based on the current board state.`;

        const systemPrompt = `You generate adaptive hints for a word-guessing game.

CRITICAL:
Hints must respond to the current game state.
Hints must help strategically WITHOUT revealing the word.

BANNED:
- Generic advice
- Letter frequency tips
- Common-word hints
- Spelling clues

STRICT RULES:
- Do NOT reveal the word
- Do NOT mention letters or positions
- Do NOT mention word length
- Do NOT repeat previous hints
- Under 12 words
- Must be clearly useful given the guesses

Return ONLY plain text.
No quotes.
No explanations.`;

        const hint = await callGemini(prompt, systemPrompt);
        return hint.trim();

    } catch (error) {
        console.error("Dynamic Hint Gen Error:", error);
        return null;
    }
}


/**
 * POST /api/game/reveal-letter
 * Reveals a random unrevealed letter (NOT already guessed correctly)
 * Penalty: 15% per reveal
 */
app.post("/api/game/reveal-letter", (req, res) => {
    try {
        const userId = getUserIdFromReq(req);
        const game = ACTIVE_GAMES.get(userId);
        if (!game) return res.status(404).json({ error: "No active game" });

        const targetArr = game.word.split("");
        
        // Identify Indices that are ELIGIBLE for reveal
        // 1. Not already revealed by this feedback mechanism
        // 2. Not already guessed correctly by the user (Green tiles) in ANY previous guess?
        // Actually, we just check the "correct" positions map?
        // We don't have a simple map of "correct indices" stored, but we can iterate guesses.
        
        const knownIndices = new Set(
            Object.keys(game.revealedPositions).map(k => parseInt(k))
        );
        
        // Add indices that user already got Green
        game.guesses.forEach(g => {
            const gArr = g.split("");
            gArr.forEach((char, i) => {
               if (char === targetArr[i]) {
                   knownIndices.add(i);
               }
            });
        });

        // Available = All indices 0..L-1 MINUS knownIndices
        const available = [];
        for (let i = 0; i < game.word.length; i++) {
            if (!knownIndices.has(i)) {
                available.push(i);
            }
        }

        if (available.length === 0) {
            return res.status(400).json({ error: "No letters left to reveal!" });
        }

        // Pick Random
        const revealIdx = available[Math.floor(Math.random() * available.length)];
        const letter = targetArr[revealIdx];

        // Update State
        game.revealedPositions[revealIdx] = letter;
        updateScoreMultiplier(game);

        res.json({
            index: revealIdx,
            letter: letter,
            penalty: 0.15,
            scoreMultiplier: game.scoreMultiplier
        });

    } catch (e) {
        console.error("Reveal Error:", e);
        res.status(500).json({ error: "Reveal failed" });
    }
});

function getUserIdFromReq(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        const payload = verifySessionToken(token);
        if (payload) return payload.userId;
    }
    return req.headers['x-guest-id'] || 'guest';
}

function updateScoreMultiplier(game) {
    // semanticPenalty calculation from Plan Part 4
    // 0.10 for Lvl1 + 0.20 for Lvl2 + 0.30 for Lvl3 (Cumulative)
    // If hintLevelUsed = 1 -> 0.10
    // If hintLevelUsed = 2 -> 0.10 + 0.20 = 0.30
    // If hintLevelUsed = 3 -> 0.10 + 0.20 + 0.30 = 0.60
    
    let semanticPenalty = 0;
    if (game.hintLevelUsed >= 1) semanticPenalty += 0.10;
    if (game.hintLevelUsed >= 2) semanticPenalty += 0.20;
    if (game.hintLevelUsed >= 3) semanticPenalty += 0.30;

    // Letter Penalty: 0.15 * count
    const letterPenalty = Object.keys(game.revealedPositions).length * 0.15;

    const totalPenalty = semanticPenalty + letterPenalty; // Cap at 0.9 handled by max below?
    
    // Multiplier = 1 - total
    // Cap: Min 0.1 score multiplier (Max 0.9 penalty)
    game.scoreMultiplier = Math.max(0.1, 1.0 - totalPenalty);
    
    return game.scoreMultiplier;
}


// ==================================
// HELPER FUNCTIONS
// ==================================

/**
 * Create a secure session token
 * In production, use proper JWT with signing
 */
function createSessionToken(userId, email, accountType = "real") {
  const payload = {
    userId,
    email,
    accountType,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  // Simple encoding (use JWT in production)
  const data = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("hex");

  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

/**
 * Verify and decode a session token
 */
function verifySessionToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString());
    const { data, signature } = decoded;

    // Verify signature
    const expectedSig = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(data)
      .digest("hex");

    if (signature !== expectedSig) {
      return null;
    }

    const payload = JSON.parse(data);

    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

// ==================================
// AUTH ROUTES - HELPERS & CHECKS
// ==================================

/**
 * POST /auth/check-username
 * Checks if a username is available
 * Body: { username }
 */
app.post("/auth/check-username", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.length < 3) return res.json({ available: false });

    const { data } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username) // Case-insensitive check
      .single();

    res.json({ available: !data });
  } catch (e) {
    // If error is "row not found" (PGRST116), it means available
    if (e.code === "PGRST116") res.json({ available: true });
    else res.status(500).json({ error: "Check failed" });
  }
});

// ==================================
// FEEDBACK ROUTE
// ==================================

/**
 * POST /api/submit-feedback
 * Submits user feedback to the Supabase database.
 * Body: { username, name, contact, feedback_type, severity, message, screenshot_url }
 */
app.post("/api/submit-feedback", async (req, res) => {
  try {
    const { username, name, contact, feedback_type, severity, message, screenshot_url } = req.body;

    // Basic validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: "Name is required." });
    }
    if (!feedback_type || typeof feedback_type !== 'string' || feedback_type.trim() === '') {
      return res.status(400).json({ error: "Feedback type is required." });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 20) {
      return res.status(400).json({ error: "Message must be at least 20 characters long." });
    }

    if (!supabase) {
      console.error("Supabase client is not configured. Cannot save feedback.");
      return res.status(500).json({ error: "Internal server error: Database not configured." });
    }

    // Insert into Supabase
    const { data, error } = await supabase
      .from("feedback")
      .insert([
        {
          username: username || null,
          name: name.trim(),
          contact: contact ? contact.trim() : null,
          feedback_type: feedback_type.trim(),
          severity: severity ? severity.trim() : null,
          message: message.trim(),
          screenshot_url: screenshot_url ? screenshot_url.trim() : null
        }
      ]);

    if (error) {
      console.error("Error inserting feedback:", error);
      return res.status(500).json({ error: "Failed to submit feedback." });
    }

    res.status(200).json({ success: true, message: "Feedback submitted successfully." });
  } catch (e) {
    console.error("Unexpected error submitting feedback:", e);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

// ==================================
// AUTH ROUTES - SIGNUP (MojoAuth OTP)
// ==================================

/**
 * POST /auth/signup/start
 * Step 1: Validate input, send OTP via MojoAuth
 * MojoAuth is the source of truth for OTPs.
 */
app.post("/auth/signup/start", async (req, res) => {
  try {
    const { email, username, password, confirmPassword } = req.body;

    // Validation
    if (!email || !email.includes("@"))
      return res.status(400).json({ error: "Valid email is required" });
    if (!username || username.length < 3 || username.length > 20)
      return res
        .status(400)
        .json({ error: "Username must be 3-20 characters" });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res
        .status(400)
        .json({
          error: "Username can only contain letters, numbers, and underscores",
        });
    if (!password || password.length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    if (password !== confirmPassword)
      return res.status(400).json({ error: "Passwords do not match" });

    if (!supabase)
      return res.status(500).json({ error: "Database not configured" });
    if (!MOJOAUTH_API_KEY)
      return res.status(500).json({ error: "OTP service not configured" });

    // Check availability (Fail fast)
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .single();
    if (existingUser)
      return res.status(409).json({ error: "Email already registered." });

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .single();
    if (existingProfile)
      return res.status(409).json({ error: "Username already taken" });

    // Hash password BEFORE sending OTP (never store plaintext)
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

    // Send OTP via MojoAuth (MojoAuth generates and delivers the OTP)
    const response = await fetch(
      `${MOJOAUTH_API_BASE}/users/emailotp?api_key=${MOJOAUTH_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase() }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("MojoAuth OTP Request Error:", data);
      return res
        .status(response.status)
        .json({
          error: data.description || "Failed to send verification code",
        });
    }

    // SERVERLESS FIX: Store pending signup in Supabase (replaces in-memory Map)
    const { error: upsertError } = await supabase
      .from("pending_signups")
      .upsert(
        {
          email: email.toLowerCase(),
          username,
          password_hash: passwordHash,
          mojoauth_state_id: data.state_id,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        },
        { onConflict: "email" },
      );

    if (upsertError) {
      console.error("Pending signup store error:", upsertError);
      return res.status(500).json({ error: "Failed to initiate signup" });
    }

    res.json({ message: "Verification code sent to your email" });
  } catch (error) {
    console.error("Signup Start Error:", error);
    res.status(500).json({ error: "Failed to start signup" });
  }
});

/**
 * POST /auth/signup/verify
 * Step 2: Verify OTP via MojoAuth, then create user in Supabase
 */
app.post("/auth/signup/verify", async (req, res) => {
  try {
    // Frontend sends email + otp (username/password from pending state)
    const { email, otp } = req.body;
    const normalizedEmail = email?.toLowerCase();

    if (!normalizedEmail || !otp) {
      return res
        .status(400)
        .json({ error: "Email and verification code are required" });
    }

    // SERVERLESS FIX: Get pending signup from Supabase (replaces in-memory Map)
    const { data: pending, error: pendingError } = await supabase
      .from("pending_signups")
      .select("*")
      .eq("email", normalizedEmail)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (pendingError || !pending) {
      return res
        .status(400)
        .json({
          error: "No pending signup found or expired. Please start again.",
        });
    }

    // Verify OTP with MojoAuth (MojoAuth is the source of truth)
    const response = await fetch(
      `${MOJOAUTH_API_BASE}/users/emailotp/verify?api_key=${MOJOAUTH_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state_id: pending.mojoauth_state_id, otp }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("MojoAuth Verify Error:", data);
      return res
        .status(response.status)
        .json({ error: data.description || "Invalid verification code" });
    }

    // OTP verified by MojoAuth! Now create user in Supabase.
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        email: normalizedEmail,
        password_hash: pending.password_hash,
        is_email_verified: true,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505")
        return res.status(409).json({ error: "Email already registered" });
      return res.status(500).json({ error: "Failed to create account" });
    }

    // SERVERLESS FIX: Delete pending signup from Supabase (replaces in-memory delete)
    await supabase
      .from("pending_signups")
      .delete()
      .eq("email", normalizedEmail);

    // Create profile
    await supabase.from("profiles").upsert(
      {
        id: newUser.id,
        username: pending.username,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(pending.username)}&background=667eea&color=fff`,
      },
      { onConflict: "id" },
    );

    // Create session
    const token = createSessionToken(newUser.id, newUser.email);
    console.log("New user created:", normalizedEmail);

    res.json({
      user: { id: newUser.id, email: newUser.email, username: pending.username },
      token,
      message: "Account created successfully",
    });
  } catch (error) {
    console.error("Signup Verify Error:", error);
    res.status(500).json({ error: "Failed to complete signup" });
  }
});

// ==================================
// AUTH ROUTES - DEMO ACCOUNT
// ==================================

/**
 * POST /auth/demo
 * Create a throwaway demo account
 * Body: { displayName }
 */
app.post("/auth/demo", async (req, res) => {
  try {
    const { displayName } = req.body;

    if (!displayName || displayName.length < 2) {
      return res
        .status(400)
        .json({ error: "Display name is required (min 2 chars)" });
    }

    if (!supabase)
      return res.status(500).json({ error: "Database not configured" });

    // Generate unique credentials
    const suffix = crypto.randomBytes(3).toString("hex");
    const username = `${displayName.replace(/\s+/g, "")}_${suffix}`.substring(
      0,
      20,
    );
    const internalEmail = `demo_${crypto.randomBytes(8).toString("hex")}@guessword.internal`;
    const internalPassword = crypto.randomBytes(16).toString("hex");
    const passwordHash = await bcrypt.hash(
      internalPassword,
      PASSWORD_HASH_ROUNDS,
    );

    // Create User (with checking for account_type column existence safely)
    // We assume the column exists or we fallback to 'real' if not,
    // but for demo we really want it. If insertion fails due to column missing,
    // it means the SQL wasn't run.

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        email: internalEmail,
        password_hash: passwordHash,
        is_email_verified: true,
        account_type: "demo", // Requires manual SQL update
      })
      .select()
      .single();

    if (insertError) {
      console.error("Demo User Insert Error:", insertError);
      if (insertError.message.includes("account_type")) {
        return res
          .status(500)
          .json({ error: "Database mismatch: Please run the SQL update." });
      }
      return res.status(500).json({ error: "Failed to create demo account" });
    }

    // Random Avatar
    const avatars = [
      "https://api.dicebear.com/7.x/bottts/svg?seed=1",
      "https://api.dicebear.com/7.x/bottts/svg?seed=2",
      "https://api.dicebear.com/7.x/bottts/svg?seed=3",
      "https://api.dicebear.com/7.x/bottts/svg?seed=4",
      "https://api.dicebear.com/7.x/bottts/svg?seed=5",
    ];
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];

    // Create Profile
    await supabase.from("profiles").upsert({
      id: newUser.id,
      username: username,
      avatar_url: randomAvatar,
      is_demo: true, // Requires manual SQL update
    });

    // Create session
    const token = createSessionToken(newUser.id, internalEmail, "demo");

    console.log("Demo user created:", username);

    res.json({
      user: {
        id: newUser.id,
        email: "Demo User",
        username: username,
        account_type: "demo",
      },
      token,
      message: "Demo account created",
    });
  } catch (error) {
    console.error("Demo Auth Error:", error);
    res.status(500).json({ error: "Failed to start demo" });
  }
});

// ==================================
// AUTH ROUTES - LOGIN
// ==================================

/**
 * POST /auth/login
 * Email + Password login (NO OTP required)
 *
 * Body: { email, password }
 * Response: { user, token } on success
 */
app.post("/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body; // 'email' field can now contain username
    const identifier = email?.trim();

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "Email/Username and password are required" });
    }
    if (!supabase)
      return res.status(500).json({ error: "Database not configured" });

    let targetEmail = identifier;

    // If input is NOT an email, treat as username and lookup email
    if (!identifier.includes("@")) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", identifier)
        .single();

      if (profileData) {
        const { data: userData } = await supabase
          .from("users")
          .select("email")
          .eq("id", profileData.id)
          .single();

        if (userData) targetEmail = userData.email;
        else
          return res
            .status(401)
            .json({ error: "Invalid username or password" });
      } else {
        return res.status(401).json({ error: "Invalid username or password" });
      }
    }

    // Proceed to authenticate with Email (targetEmail)
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("email", targetEmail.toLowerCase())
      .single();

    if (findError || !user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (!user.is_email_verified) {
      return res.status(403).json({ error: "Please verify your email first" });
    }

    const token = createSessionToken(user.id, user.email);

    console.log("User logged in:", targetEmail);

    // Fetch username for the user
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: profile?.username || "Player"
      },
      token,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ==================================
// AUTH ROUTES - SESSION
// ==================================

/**
 * GET /auth/me
 * Get current logged-in user from session token
 */
app.get("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);

    if (!payload) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Fetch username
    console.log(`[AuthMe] Fetching profile for user: ${payload.userId}`);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", payload.userId)
      .single();
    
    if (profileError) {
      console.warn(`[AuthMe] Profile fetch error for ${payload.userId}:`, profileError.message);
    }
    console.log(`[AuthMe] Username found: ${profile?.username}`);

    res.json({
      user: {
        id: payload.userId,
        email: payload.email,
        username: profile?.username || "Player",
        account_type: payload.accountType || "real",
      },
    });
  } catch (error) {
    console.error("Auth Check Error:", error);
    res.status(500).json({ error: "Failed to verify session" });
  }
});

/**
 * POST /auth/logout
 * Client-side logout acknowledgment
 */
app.post("/auth/logout", (req, res) => {
  // Stateless auth - client clears token
  res.json({ message: "Logged out successfully" });
});

/**
 * DELETE /auth/me
 * Delete account and all associated data
 */
app.delete("/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    const userId = payload.userId;

    if (!supabase) return res.status(500).json({ error: "Database error" });

    // Manual Cascade Delete
    // Tables: game_results, user_progress, user_mode_stats, user_overall_stats, profiles, users
    await supabase.from("game_results").delete().eq("user_id", userId);
    await supabase.from("user_progress").delete().eq("user_id", userId);
    await supabase.from("user_mode_stats").delete().eq("user_id", userId);
    await supabase.from("user_overall_stats").delete().eq("user_id", userId);
    await supabase.from("profiles").delete().eq("id", userId);

    const { error } = await supabase.from("users").delete().eq("id", userId);

    if (error) {
      console.error("Delete User Error:", error);
      return res.status(500).json({ error: "Failed to delete user record" });
    }

    console.log("User deleted:", payload.email);
    res.json({ message: "Account deleted permanently" });
  } catch (error) {
    console.error("Delete Account Error:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/**
 * POST /auth/profile
 * Update profile details (username)
 */
app.post("/auth/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ error: "Not authenticated" });

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    const { username } = req.body;
    if (!username || username.length < 3) {
      return res
        .status(400)
        .json({ error: "Username must be at least 3 characters" });
    }

    // Check for uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", payload.userId)
      .single();

    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", payload.userId);

    if (error) throw error;

    res.json({ message: "Profile updated" });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * POST /auth/avatar
 * Upload/Update avatar
 * Expects { image: "base64..." }
 */
app.post("/auth/avatar", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ error: "Not authenticated" });

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    const { image } = req.body; // Base64 string
    if (!image) return res.status(400).json({ error: "No image provided" });

    // Decode base64
    // Format: data:image/png;base64,.....
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    const type = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const userId = payload.userId;
    const filename = `${userId}/avatar.png`; // Force PNG or detect from type

    // Upload to Supabase Storage
    // Note: This requires 'avatars' bucket to be Public or Auth policies set correctly
    const { data, error } = await supabase.storage
      .from("avatars")
      .upload(filename, buffer, {
        contentType: type,
        upsert: true,
      });

    if (error) {
      console.error("Storage Upload Error:", error);
      // Fallback: If storage fails (permissions), we can't save.
      return res
        .status(500)
        .json({ error: "Failed to upload image. Storage not configured." });
    }

    // Get Public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filename);

    // Update profile
    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    res.json({ message: "Avatar updated", url: publicUrl });
  } catch (error) {
    console.error("Avatar Upload Error:", error);
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

/**
 * DELETE /auth/avatar
 * Remove custom avatar and reset to default
 */
app.delete("/auth/avatar", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ error: "Not authenticated" });

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    const userId = payload.userId;

    // Reset to default avatar (ui-avatars)
    // We need the username to generate the default URL
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .single();

    const username = profile?.username || "User";
    const defaultUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`;

    // Update Profile
    await supabase
      .from("profiles")
      .update({ avatar_url: defaultUrl })
      .eq("id", userId);

    // Attempt to delete from storage (success not required for response)
    // Try all supported extensions since we don't store the exact filename in profile
    try {
      await supabase.storage.from("avatars").remove([`${userId}/avatar.png`]);
      await supabase.storage.from("avatars").remove([`${userId}/avatar.jpg`]);
      await supabase.storage.from("avatars").remove([`${userId}/avatar.jpeg`]);
    } catch (e) {
      console.warn("Storage deletion failed (non-fatal):", e);
    }

    res.json({ message: "Avatar removed", url: defaultUrl });
  } catch (error) {
    console.error("Avatar Remove Error:", error);
    res.status(500).json({ error: "Failed to remove avatar" });
  }
});

// ==================================
// GAME API ROUTES
// ==================================

/**
 * POST /api/generate-word
 * Generates a random word using Gemini API
 * Body: { length: number, excludeWords?: string[] }
 */
app.post("/api/generate-word", async (req, res) => {
  try {
    const { length, excludeWords = [] } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    // Use configured model or fallback to a stable default
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "API Key not configured on server." });
    }

    console.log(
      `[API] Request: ${length} letters, exclude ${excludeWords.length} words (Model: ${model})`,
    );

    // Generate a random seed for uniqueness
    const randomSeed = Date.now() + Math.floor(Math.random() * 1000000);

    // Build exclusion instruction if words are provided
    const excludeInstruction =
      excludeWords.length > 0
        ? `\n7. DO NOT use any of these previously used words: ${excludeWords.slice(0, 100).join(", ")}.`
        : "";

    const prompt = `[SEED: ${randomSeed}] Generate a SINGLE random ${length}-letter English word.
        
CRITICAL: Each request needs a COMPLETELY DIFFERENT word. Be creative and unpredictable.

Rules:
1. Must be a real, common dictionary word.
2. NO proper nouns (names, places, brands).
3. NO hyphens, spaces, or special characters.
4. Simple enough for a general audience.
5. Be creative! Choose from the ENTIRE English vocabulary - verbs, adjectives, nouns, adverbs.
6. RETURN ONLY THE WORD IN UPPERCASE. NO JSON, NO MARKDOWN, NO EXPLANATION.${excludeInstruction}

Think of an unusual but valid ${length}-letter word that would be fun to guess.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Gemini Error (${response.status}):`, errorText);
      throw new Error(`API Request Failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("Invalid response format from Gemini API");
    }

    const word = rawText
      .trim()
      .replace(/[^A-Z]/gi, "")
      .toUpperCase();

    // Validate word is not in exclusion list
    if (excludeWords.includes(word)) {
      console.warn(
        `[API] Generated word ${word} is in exclusion list, returning anyway (client will fallback)`,
      );
    }

    console.log(`[API] Generated: ${word}`);
    res.json({ word });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================================
// ACHIEVEMENTS API ROUTES
// ==================================

/**
 * GET /api/achievements/user
 * Get all achievements for the authenticated user
 */
app.get("/api/achievements/user", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    if (!supabase)
      return res.status(500).json({ error: "Database not configured" });

    const { data: achievements, error } = await supabase
      .from("user_achievements")
      .select("achievement_id, earned_at")
      .eq("user_id", payload.userId);

    if (error) {
      console.error("Fetch achievements error:", error);
      return res.status(500).json({ error: "Failed to fetch achievements" });
    }

    res.json({ achievements: achievements || [] });
  } catch (error) {
    console.error("Get Achievements Error:", error);
    res.status(500).json({ error: "Failed to get achievements" });
  }
});

/**
 * POST /api/achievements/unlock
 * Unlock an achievement for the authenticated user
 * Body: { achievementId: string }
 */
app.post("/api/achievements/unlock", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const token = authHeader.split(" ")[1];
    const payload = verifySessionToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid session" });

    // Demo users can't save achievements to DB
    if (payload.accountType === "demo") {
      return res.json({ success: true, demo: true });
    }

    const { achievementId } = req.body;
    if (!achievementId) {
      return res.status(400).json({ error: "Achievement ID is required" });
    }

    if (!supabase)
      return res.status(500).json({ error: "Database not configured" });

    // Verify achievement exists
    const { data: achievement, error: achError } = await supabase
      .from("achievements")
      .select("id")
      .eq("id", achievementId)
      .single();

    if (achError || !achievement) {
      return res.status(400).json({ error: "Invalid achievement ID" });
    }

    // Insert (ignore duplicates)
    const { error } = await supabase.from("user_achievements").upsert(
      {
        user_id: payload.userId,
        achievement_id: achievementId,
        earned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,achievement_id" },
    );

    if (error) {
      console.error("Unlock achievement error:", error);
      return res.status(500).json({ error: "Failed to unlock achievement" });
    }

    console.log(
      `Achievement unlocked: ${achievementId} for user ${payload.userId}`,
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Unlock Achievement Error:", error);
    res.status(500).json({ error: "Failed to unlock achievement" });
  }
});

const http = require("http");
const { Server } = require("socket.io");
const { setupSocketEvents } = require("./server/socketHandler");

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
setupSocketEvents(io);

// ==================================
// START SERVER
// ==================================
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🎮 Guess the Word Server`);
    console.log(`   Running at http://localhost:${PORT}`);
    console.log(`   Auth: Email + Password (OTP signup)\n`);
  });
}

module.exports = server;
