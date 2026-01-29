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

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 8081;

// ==================================
// CONFIGURATION
// ==================================
const PASSWORD_HASH_ROUNDS = parseInt(process.env.PASSWORD_HASH_ROUNDS) || 10;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-change-me';

// Supabase client for user database
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('✓ Supabase client initialized');
} else {
    console.warn('⚠ Supabase credentials not configured');
}

// MojoAuth for OTP (signup only)
const MOJOAUTH_API_KEY = process.env.MOJOAUTH_API_KEY;
const MOJOAUTH_API_BASE = 'https://api.mojoauth.com';

if (MOJOAUTH_API_KEY) {
    console.log('✓ MojoAuth API Key configured');
} else {
    console.warn('⚠ MojoAuth API Key not configured');
}

// In-memory store for pending signups (production: use Redis)
// Stores: { email, passwordHash, stateId, expiresAt }
const pendingSignups = new Map();

// ==================================
// MIDDLEWARE
// ==================================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==================================
// HELPER FUNCTIONS
// ==================================

/**
 * Create a secure session token
 * In production, use proper JWT with signing
 */
function createSessionToken(userId, email) {
    const payload = {
        userId,
        email,
        iat: Date.now(),
        exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    // Simple encoding (use JWT in production)
    const data = JSON.stringify(payload);
    const signature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(data)
        .digest('hex');
    
    return Buffer.from(JSON.stringify({ data, signature })).toString('base64');
}

/**
 * Verify and decode a session token
 */
function verifySessionToken(token) {
    try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
        const { data, signature } = decoded;
        
        // Verify signature
        const expectedSig = crypto
            .createHmac('sha256', SESSION_SECRET)
            .update(data)
            .digest('hex');
        
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
// AUTH ROUTES - SIGNUP
// ==================================

/**
 * POST /auth/signup/start
 * Step 1 of signup: Validate input and send OTP
 * 
 * Body: { email, password, confirmPassword }
 * Response: { message } on success, { error } on failure
 */
app.post('/auth/signup/start', async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        // Validation
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // SECURITY: Password match check (defense in depth - frontend should also check)
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        if (!supabase) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Check if email already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .single();

        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered. Please login instead.' });
        }

        // SECURITY: Hash password BEFORE sending OTP
        // This way we never store plaintext even temporarily
        const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

        // Send OTP via MojoAuth
        if (!MOJOAUTH_API_KEY) {
            return res.status(500).json({ error: 'OTP service not configured' });
        }

        const response = await fetch(`${MOJOAUTH_API_BASE}/users/emailotp?api_key=${MOJOAUTH_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.toLowerCase() })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MojoAuth Error:', data);
            return res.status(response.status).json({ 
                error: data.description || 'Failed to send verification code' 
            });
        }

        // Store pending signup (expires in 10 minutes)
        pendingSignups.set(email.toLowerCase(), {
            email: email.toLowerCase(),
            passwordHash,
            stateId: data.state_id,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });

        // Clean up expired entries
        for (const [key, value] of pendingSignups) {
            if (value.expiresAt < Date.now()) {
                pendingSignups.delete(key);
            }
        }

        res.json({ message: 'Verification code sent to your email' });

    } catch (error) {
        console.error('Signup Start Error:', error);
        res.status(500).json({ error: 'Failed to start signup' });
    }
});

/**
 * POST /auth/signup/verify
 * Step 2 of signup: Verify OTP and create user
 * 
 * Body: { email, otp }
 * Response: { user, token } on success
 */
app.post('/auth/signup/verify', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const normalizedEmail = email?.toLowerCase();

        if (!normalizedEmail || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        // Get pending signup
        const pending = pendingSignups.get(normalizedEmail);

        if (!pending) {
            return res.status(400).json({ error: 'No pending signup found. Please start again.' });
        }

        if (pending.expiresAt < Date.now()) {
            pendingSignups.delete(normalizedEmail);
            return res.status(400).json({ error: 'Verification expired. Please start again.' });
        }

        // Verify OTP with MojoAuth
        const response = await fetch(`${MOJOAUTH_API_BASE}/users/emailotp/verify?api_key=${MOJOAUTH_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                state_id: pending.stateId,
                otp: otp
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MojoAuth Verify Error:', data);
            return res.status(response.status).json({ 
                error: data.description || 'Invalid verification code' 
            });
        }

        // OTP verified! Create user in Supabase
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                email: normalizedEmail,
                password_hash: pending.passwordHash,
                is_email_verified: true
            })
            .select()
            .single();

        if (insertError) {
            console.error('Supabase Insert Error:', insertError);
            
            // Handle race condition (user created between check and insert)
            if (insertError.code === '23505') {
                return res.status(409).json({ error: 'Email already registered' });
            }
            
            return res.status(500).json({ error: 'Failed to create account' });
        }

        // Clean up pending signup
        pendingSignups.delete(normalizedEmail);

        // Create profile for leaderboard
        const username = normalizedEmail.split('@')[0];
        await supabase.from('profiles').upsert({
            id: newUser.id,
            username: username,
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`
        }, { onConflict: 'id' });

        // Create session
        const token = createSessionToken(newUser.id, newUser.email);

        console.log('New user created:', normalizedEmail);

        res.json({
            user: {
                id: newUser.id,
                email: newUser.email
            },
            token,
            message: 'Account created successfully'
        });

    } catch (error) {
        console.error('Signup Verify Error:', error);
        res.status(500).json({ error: 'Failed to complete signup' });
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
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email?.toLowerCase();

        if (!normalizedEmail || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (!supabase) {
            return res.status(500).json({ error: 'Database not configured' });
        }

        // Find user by email
        const { data: user, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .single();

        if (findError || !user) {
            // SECURITY: Don't reveal if email exists or not
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // SECURITY: Verify password using bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            // SECURITY: Same error message to prevent email enumeration
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if email is verified
        if (!user.is_email_verified) {
            return res.status(403).json({ error: 'Please verify your email first' });
        }

        // Create session
        const token = createSessionToken(user.id, user.email);

        // Ensure profile exists for leaderboard
        const username = user.email.split('@')[0];
        await supabase.from('profiles').upsert({
            id: user.id,
            username: username,
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`
        }, { onConflict: 'id' });

        console.log('User logged in:', normalizedEmail);

        res.json({
            user: {
                id: user.id,
                email: user.email
            },
            token,
            message: 'Login successful'
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================================
// AUTH ROUTES - SESSION
// ==================================

/**
 * GET /auth/me
 * Get current logged-in user from session token
 */
app.get('/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);

        if (!payload) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }

        res.json({
            user: {
                id: payload.userId,
                email: payload.email
            }
        });

    } catch (error) {
        console.error('Auth Check Error:', error);
        res.status(500).json({ error: 'Failed to verify session' });
    }
});

/**
 * POST /auth/logout
 * Client-side logout acknowledgment
 */
app.post('/auth/logout', (req, res) => {
    // Stateless auth - client clears token
    res.json({ message: 'Logged out successfully' });
});

// ==================================
// GAME API ROUTES
// ==================================

/**
 * POST /api/generate-word
 * Generates a random word using Gemini API
 */
app.post('/api/generate-word', async (req, res) => {
    try {
        const { length } = req.body;
        const apiKey = process.env.GEMINI_API_KEY; 

        if (!apiKey) {
            return res.status(500).json({ error: 'API Key not configured on server.' });
        }

        const prompt = `Generate a SINGLE random ${length}-letter English word. 
        Rules:
        1. Must be a real, common dictionary word.
        2. NO proper nouns (names, places).
        3. NO hyphens or spaces.
        4. Simple enough for a general audience.
        5. RETURN ONLY THE WORD IN UPPERCASE. NO JSON, NO MARKDOWN, NO EXPLANATION.`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Request Failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
            throw new Error('Invalid response format from Gemini API');
        }

        const word = rawText.trim().replace(/[^A-Z]/gi, '').toUpperCase();
        
        res.json({ word });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==================================
// START SERVER
// ==================================
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🎮 Guess the Word Server`);
        console.log(`   Running at http://localhost:${PORT}`);
        console.log(`   Auth: Email + Password (OTP signup)\n`);
    });
}

module.exports = app;
