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

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 8081;

// ==================================
// CONFIGURATION
// FIX: Reduced default from 10 to 8 for serverless CPU time limits (Vercel 10s max)
const PASSWORD_HASH_ROUNDS = parseInt(process.env.PASSWORD_HASH_ROUNDS) || 8;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-change-me';

// Supabase client for user database
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
let supabase = null;

if (supabaseUrl && (supabaseServiceKey || supabaseAnonKey)) {
    // Prefer Service Key for backend operations to bypass RLS
    supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);
    console.log(`✓ Supabase client initialized (${supabaseServiceKey ? 'Service' : 'Anon'} Role)`);
} else {
    console.warn('⚠ Supabase credentials not configured');
}

// MojoAuth for OTP (signup only)
const MOJOAUTH_API_KEY = process.env.MOJOAUTH_API_KEY;
const MOJOAUTH_API_BASE = 'https://api.mojoauth.com';

if (MOJOAUTH_API_KEY) {
    console.log('✓ MojoAuth API Key configured');
} else {
    console.warn('⚠ MojoAuth API Key not configured (OTPs will fail)');
}

// SERVERLESS: Pending signups stored in Supabase 'pending_signups' table (not in-memory)

// ==================================
// MIDDLEWARE
// ==================================
app.use(cors());
// FIX: Explicit body size limit for security (prevents large payload attacks)
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// ==================================
// HELPER FUNCTIONS
// ==================================

/**
 * Create a secure session token
 * In production, use proper JWT with signing
 */
function createSessionToken(userId, email, accountType = 'real') {
    const payload = {
        userId,
        email,
        accountType,
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
// AUTH ROUTES - HELPERS & CHECKS
// ==================================

/**
 * POST /auth/check-username
 * Checks if a username is available
 * Body: { username }
 */
app.post('/auth/check-username', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.length < 3) return res.json({ available: false });

        const { data } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', username) // Case-insensitive check
            .single();

        res.json({ available: !data });
    } catch (e) {
        // If error is "row not found" (PGRST116), it means available
        if (e.code === 'PGRST116') res.json({ available: true });
        else res.status(500).json({ error: 'Check failed' });
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
app.post('/auth/signup/start', async (req, res) => {
    try {
        const { email, username, password, confirmPassword } = req.body;

        // Validation
        if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
        if (!username || username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 characters' });
        if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
        if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });
        if (!MOJOAUTH_API_KEY) return res.status(500).json({ error: 'OTP service not configured' });

        // Check availability (Fail fast)
        const { data: existingUser } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).single();
        if (existingUser) return res.status(409).json({ error: 'Email already registered.' });

        const { data: existingProfile } = await supabase.from('profiles').select('id').ilike('username', username).single();
        if (existingProfile) return res.status(409).json({ error: 'Username already taken' });

        // Hash password BEFORE sending OTP (never store plaintext)
        const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);

        // Send OTP via MojoAuth (MojoAuth generates and delivers the OTP)
        const response = await fetch(`${MOJOAUTH_API_BASE}/users/emailotp?api_key=${MOJOAUTH_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.toLowerCase() })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MojoAuth OTP Request Error:', data);
            return res.status(response.status).json({ error: data.description || 'Failed to send verification code' });
        }

        // SERVERLESS FIX: Store pending signup in Supabase (replaces in-memory Map)
        const { error: upsertError } = await supabase
            .from('pending_signups')
            .upsert({
                email: email.toLowerCase(),
                username,
                password_hash: passwordHash,
                mojoauth_state_id: data.state_id,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
            }, { onConflict: 'email' });

        if (upsertError) {
            console.error('Pending signup store error:', upsertError);
            return res.status(500).json({ error: 'Failed to initiate signup' });
        }

        res.json({ message: 'Verification code sent to your email' });

    } catch (error) {
        console.error('Signup Start Error:', error);
        res.status(500).json({ error: 'Failed to start signup' });
    }
});

/**
 * POST /auth/signup/verify
 * Step 2: Verify OTP via MojoAuth, then create user in Supabase
 */
app.post('/auth/signup/verify', async (req, res) => {
    try {
        // Frontend sends email + otp (username/password from pending state)
        const { email, otp } = req.body;
        const normalizedEmail = email?.toLowerCase();

        if (!normalizedEmail || !otp) {
            return res.status(400).json({ error: 'Email and verification code are required' });
        }

        // SERVERLESS FIX: Get pending signup from Supabase (replaces in-memory Map)
        const { data: pending, error: pendingError } = await supabase
            .from('pending_signups')
            .select('*')
            .eq('email', normalizedEmail)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (pendingError || !pending) {
            return res.status(400).json({ error: 'No pending signup found or expired. Please start again.' });
        }

        // Verify OTP with MojoAuth (MojoAuth is the source of truth)
        const response = await fetch(`${MOJOAUTH_API_BASE}/users/emailotp/verify?api_key=${MOJOAUTH_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state_id: pending.mojoauth_state_id, otp })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MojoAuth Verify Error:', data);
            return res.status(response.status).json({ error: data.description || 'Invalid verification code' });
        }

        // OTP verified by MojoAuth! Now create user in Supabase.
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                email: normalizedEmail,
                password_hash: pending.password_hash,
                is_email_verified: true
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505') return res.status(409).json({ error: 'Email already registered' });
            return res.status(500).json({ error: 'Failed to create account' });
        }

        // SERVERLESS FIX: Delete pending signup from Supabase (replaces in-memory delete)
        await supabase.from('pending_signups').delete().eq('email', normalizedEmail);

        // Create profile
        await supabase.from('profiles').upsert({
            id: newUser.id,
            username: pending.username,
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(pending.username)}&background=667eea&color=fff`
        }, { onConflict: 'id' });

        // Create session
        const token = createSessionToken(newUser.id, newUser.email);
        console.log('New user created:', normalizedEmail);

        res.json({
            user: { id: newUser.id, email: newUser.email },
            token,
            message: 'Account created successfully'
        });

    } catch (error) {
        console.error('Signup Verify Error:', error);
        res.status(500).json({ error: 'Failed to complete signup' });
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
app.post('/auth/demo', async (req, res) => {
    try {
        const { displayName } = req.body;
        
        if (!displayName || displayName.length < 2) {
            return res.status(400).json({ error: 'Display name is required (min 2 chars)' });
        }

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        // Generate unique credentials
        const suffix = crypto.randomBytes(3).toString('hex');
        const username = `${displayName.replace(/\s+/g, '')}_${suffix}`.substring(0, 20);
        const internalEmail = `demo_${crypto.randomBytes(8).toString('hex')}@guessword.internal`;
        const internalPassword = crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(internalPassword, PASSWORD_HASH_ROUNDS);

        // Create User (with checking for account_type column existence safely)
        // We assume the column exists or we fallback to 'real' if not, 
        // but for demo we really want it. If insertion fails due to column missing, 
        // it means the SQL wasn't run.
        
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
                email: internalEmail,
                password_hash: passwordHash,
                is_email_verified: true,
                account_type: 'demo' // Requires manual SQL update
            })
            .select()
            .single();

        if (insertError) {
            console.error('Demo User Insert Error:', insertError);
            if (insertError.message.includes('account_type')) {
                return res.status(500).json({ error: 'Database mismatch: Please run the SQL update.' });
            }
            return res.status(500).json({ error: 'Failed to create demo account' });
        }

        // Random Avatar
        const avatars = [
            'https://api.dicebear.com/7.x/bottts/svg?seed=1',
            'https://api.dicebear.com/7.x/bottts/svg?seed=2',
            'https://api.dicebear.com/7.x/bottts/svg?seed=3',
            'https://api.dicebear.com/7.x/bottts/svg?seed=4',
            'https://api.dicebear.com/7.x/bottts/svg?seed=5'
        ];
        const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];

        // Create Profile
        await supabase.from('profiles').upsert({
            id: newUser.id,
            username: username,
            avatar_url: randomAvatar,
            is_demo: true // Requires manual SQL update
        });

        // Create session
        const token = createSessionToken(newUser.id, internalEmail, 'demo');

        console.log('Demo user created:', username);

        res.json({
            user: {
                id: newUser.id,
                email: 'Demo User',
                username: username,
                account_type: 'demo'
            },
            token,
            message: 'Demo account created'
        });

    } catch (error) {
        console.error('Demo Auth Error:', error);
        res.status(500).json({ error: 'Failed to start demo' });
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
        let { email, password } = req.body; // 'email' field can now contain username
        const identifier = email?.trim();

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Email/Username and password are required' });
        }
        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        let targetEmail = identifier;

        // If input is NOT an email, treat as username and lookup email
        if (!identifier.includes('@')) {
            const { data: profileData } = await supabase
                .from('profiles')
                .select('id')
                .ilike('username', identifier)
                .single();
            
            if (profileData) {
                const { data: userData } = await supabase
                    .from('users')
                    .select('email')
                    .eq('id', profileData.id)
                    .single();
                
                if (userData) targetEmail = userData.email;
                else return res.status(401).json({ error: 'Invalid username or password' });
            } else {
                 return res.status(401).json({ error: 'Invalid username or password' });
            }
        }

        // Proceed to authenticate with Email (targetEmail)
        const { data: user, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', targetEmail.toLowerCase())
            .single();

        if (findError || !user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (!user.is_email_verified) {
            return res.status(403).json({ error: 'Please verify your email first' });
        }

        const token = createSessionToken(user.id, user.email);

        console.log('User logged in:', targetEmail);

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
                email: payload.email,
                account_type: payload.accountType || 'real'
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

/**
 * DELETE /auth/me
 * Delete account and all associated data
 */
app.delete('/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        const userId = payload.userId;

        if (!supabase) return res.status(500).json({ error: 'Database error' });

        // Manual Cascade Delete
        // Tables: game_results, user_progress, user_mode_stats, user_overall_stats, profiles, users
        await supabase.from('game_results').delete().eq('user_id', userId);
        await supabase.from('user_progress').delete().eq('user_id', userId);
        await supabase.from('user_mode_stats').delete().eq('user_id', userId);
        await supabase.from('user_overall_stats').delete().eq('user_id', userId);
        await supabase.from('profiles').delete().eq('id', userId);
        
        const { error } = await supabase.from('users').delete().eq('id', userId);

        if (error) {
            console.error('Delete User Error:', error);
            return res.status(500).json({ error: 'Failed to delete user record' });
        }

        console.log('User deleted:', payload.email);
        res.json({ message: 'Account deleted permanently' });

    } catch (error) {
        console.error('Delete Account Error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

/**
 * POST /auth/profile
 * Update profile details (username)
 */
app.post('/auth/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
        
        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        const { username } = req.body;
        if (!username || username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters' });
        }

        // Check for uniqueness
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .neq('id', payload.userId)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const { error } = await supabase
            .from('profiles')
            .update({ username })
            .eq('id', payload.userId);

        if (error) throw error;

        res.json({ message: 'Profile updated' });

    } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * POST /auth/avatar
 * Upload/Update avatar
 * Expects { image: "base64..." }
 */
app.post('/auth/avatar', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
        
        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        const { image } = req.body; // Base64 string
        if (!image) return res.status(400).json({ error: 'No image provided' });

        // Decode base64 
        // Format: data:image/png;base64,.....
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid image format' });
        }

        const type = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const userId = payload.userId;
        const filename = `${userId}/avatar.png`; // Force PNG or detect from type

        // Upload to Supabase Storage
        // Note: This requires 'avatars' bucket to be Public or Auth policies set correctly
        const { data, error } = await supabase
            .storage
            .from('avatars')
            .upload(filename, buffer, {
                contentType: type,
                upsert: true
            });

        if (error) {
            console.error('Storage Upload Error:', error);
            // Fallback: If storage fails (permissions), we can't save.
            return res.status(500).json({ error: 'Failed to upload image. Storage not configured.' });
        }

        // Get Public URL
        const { data: { publicUrl } } = supabase
            .storage
            .from('avatars')
            .getPublicUrl(filename);
            
        // Update profile
        await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', userId);

        res.json({ message: 'Avatar updated', url: publicUrl });

    } catch (error) {
        console.error('Avatar Upload Error:', error);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});

/**
 * DELETE /auth/avatar
 * Remove custom avatar and reset to default
 */
app.delete('/auth/avatar', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
        
        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        const userId = payload.userId;

        // Reset to default avatar (ui-avatars)
        // We need the username to generate the default URL
        const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', userId)
            .single();

        const username = profile?.username || 'User';
        const defaultUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=667eea&color=fff`;

        // Update Profile
        await supabase
            .from('profiles')
            .update({ avatar_url: defaultUrl })
            .eq('id', userId);

        // Attempt to delete from storage (success not required for response)
        // Try all supported extensions since we don't store the exact filename in profile
        try {
            await supabase.storage.from('avatars').remove([`${userId}/avatar.png`]);
            await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
            await supabase.storage.from('avatars').remove([`${userId}/avatar.jpeg`]);
        } catch (e) {
            console.warn("Storage deletion failed (non-fatal):", e);
        }

        res.json({ message: 'Avatar removed', url: defaultUrl });

    } catch (error) {
        console.error('Avatar Remove Error:', error);
        res.status(500).json({ error: 'Failed to remove avatar' });
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
app.post('/api/generate-word', async (req, res) => {
    try {
        const { length, excludeWords = [] } = req.body;
        const apiKey = process.env.GEMINI_API_KEY; 

        if (!apiKey) {
            return res.status(500).json({ error: 'API Key not configured on server.' });
        }

        console.log(`[API] Request: ${length} letters, exclude ${excludeWords.length} words`);

        // Build exclusion instruction if words are provided
        const excludeInstruction = excludeWords.length > 0 
            ? `\n6. DO NOT use any of these words: ${excludeWords.slice(0, 100).join(', ')}.`
            : '';

        const prompt = `Generate a SINGLE random ${length}-letter English word. 
        Rules:
        1. Must be a real, common dictionary word.
        2. NO proper nouns (names, places).
        3. NO hyphens or spaces.
        4. Simple enough for a general audience.
        5. RETURN ONLY THE WORD IN UPPERCASE. NO JSON, NO MARKDOWN, NO EXPLANATION.${excludeInstruction}`;

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

        // Validate word is not in exclusion list
        if (excludeWords.includes(word)) {
            console.warn(`[API] Generated word ${word} is in exclusion list, returning anyway (client will fallback)`);
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
app.get('/api/achievements/user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        const { data: achievements, error } = await supabase
            .from('user_achievements')
            .select('achievement_id, earned_at')
            .eq('user_id', payload.userId);

        if (error) {
            console.error('Fetch achievements error:', error);
            return res.status(500).json({ error: 'Failed to fetch achievements' });
        }

        res.json({ achievements: achievements || [] });

    } catch (error) {
        console.error('Get Achievements Error:', error);
        res.status(500).json({ error: 'Failed to get achievements' });
    }
});

/**
 * POST /api/achievements/unlock
 * Unlock an achievement for the authenticated user
 * Body: { achievementId: string }
 */
app.post('/api/achievements/unlock', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifySessionToken(token);
        if (!payload) return res.status(401).json({ error: 'Invalid session' });

        // Demo users can't save achievements to DB
        if (payload.accountType === 'demo') {
            return res.json({ success: true, demo: true });
        }

        const { achievementId } = req.body;
        if (!achievementId) {
            return res.status(400).json({ error: 'Achievement ID is required' });
        }

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        // Verify achievement exists
        const { data: achievement, error: achError } = await supabase
            .from('achievements')
            .select('id')
            .eq('id', achievementId)
            .single();

        if (achError || !achievement) {
            return res.status(400).json({ error: 'Invalid achievement ID' });
        }

        // Insert (ignore duplicates)
        const { error } = await supabase
            .from('user_achievements')
            .upsert({
                user_id: payload.userId,
                achievement_id: achievementId,
                earned_at: new Date().toISOString()
            }, { onConflict: 'user_id,achievement_id' });

        if (error) {
            console.error('Unlock achievement error:', error);
            return res.status(500).json({ error: 'Failed to unlock achievement' });
        }

        console.log(`Achievement unlocked: ${achievementId} for user ${payload.userId}`);
        res.json({ success: true });

    } catch (error) {
        console.error('Unlock Achievement Error:', error);
        res.status(500).json({ error: 'Failed to unlock achievement' });
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
