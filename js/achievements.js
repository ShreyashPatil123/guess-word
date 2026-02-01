/**
 * Achievements Module - Complete Implementation
 * 
 * Features:
 * - 20 achievements across 4 categories
 * - Supabase database sync
 * - Local fallback for demo users
 * - Real-time unlock detection
 */

const ACHIEVEMENT_LIST = [
    // Gameplay (5)
    { id: 'first_win', title: 'First Steps', desc: 'Win your first game', icon: '🎯', points: 100, rarity: 'common', category: 'gameplay' },
    { id: 'speed_demon', title: 'Speed Demon', desc: 'Win in under 60 seconds', icon: '⚡', points: 500, rarity: 'rare', category: 'gameplay' },
    { id: 'lucky_guess', title: 'Lucky Guess', desc: 'Win on first attempt', icon: '🍀', points: 1000, rarity: 'legendary', category: 'gameplay' },
    { id: 'close_call', title: 'Close Call', desc: 'Win on last attempt', icon: '😅', points: 200, rarity: 'common', category: 'gameplay' },
    { id: 'marathon_runner', title: 'Marathon Runner', desc: 'Play 50 games total', icon: '🏃', points: 300, rarity: 'rare', category: 'gameplay' },
    
    // Mastery (5)
    { id: 'expert_mind', title: 'Expert Mind', desc: 'Win a Hard (5-letter) game', icon: '🧠', points: 300, rarity: 'rare', category: 'mastery' },
    { id: 'medium_well', title: 'Medium Well', desc: 'Win a Medium (4-letter) game', icon: '📗', points: 150, rarity: 'common', category: 'mastery' },
    { id: 'easy_start', title: 'Easy Start', desc: 'Win an Easy (3-letter) game', icon: '📘', points: 100, rarity: 'common', category: 'mastery' },
    { id: 'perfectionist', title: 'Perfectionist', desc: 'Score 1000+ points in one game', icon: '💯', points: 500, rarity: 'epic', category: 'mastery' },
    { id: 'streak_master', title: 'Streak Master', desc: 'Win 5 games in a row', icon: '🔥', points: 400, rarity: 'epic', category: 'mastery' },
    
    // Collection (5)
    { id: 'wordsmith', title: 'Wordsmith', desc: 'Guess 100 unique words', icon: '📚', points: 500, rarity: 'rare', category: 'collection' },
    { id: 'alphabet_hunter', title: 'Alphabet Hunter', desc: 'Use all 26 letters', icon: '🔤', points: 300, rarity: 'rare', category: 'collection' },
    { id: 'triple_threat', title: 'Triple Threat', desc: 'Win in each difficulty', icon: '🏆', points: 250, rarity: 'rare', category: 'collection' },
    { id: 'centurion', title: 'Centurion', desc: 'Play 100 games total', icon: '💪', points: 600, rarity: 'epic', category: 'collection' },
    { id: 'double_down', title: 'Double Down', desc: 'Win 2 games back-to-back', icon: '👯', points: 200, rarity: 'common', category: 'collection' },
    
    // Special (5)
    { id: 'night_owl', title: 'Night Owl', desc: 'Play between midnight and 5am', icon: '🦉', points: 150, rarity: 'common', category: 'special' },
    { id: 'early_bird', title: 'Early Bird', desc: 'Play between 5am and 8am', icon: '🐦', points: 150, rarity: 'common', category: 'special' },
    { id: 'weekend_warrior', title: 'Weekend Warrior', desc: 'Win 3 games on a weekend', icon: '⚔️', points: 250, rarity: 'rare', category: 'special' },
    { id: 'comeback_kid', title: 'Comeback Kid', desc: 'Win after losing 3 in a row', icon: '🔙', points: 400, rarity: 'epic', category: 'special' },
    { id: 'full_house', title: 'Full House', desc: 'Unlock all other achievements', icon: '👑', points: 2000, rarity: 'legendary', category: 'special' }
];

const Achievements = {
    // State
    unlockedIds: new Set(),
    isLoading: false,
    currentFilter: 'all',
    
    // DOM Elements
    elements: {},

    /**
     * Initialize achievements module
     */
    async init() {
        this.elements = {
            backdrop: document.getElementById('achievements-modal-backdrop'),
            modal: document.getElementById('achievements-modal'),
            grid: document.getElementById('achievements-grid'),
            closeBtn: document.getElementById('close-achievements-btn'),
            unlockedCount: document.getElementById('ach-unlocked-count'),
            totalCount: document.getElementById('ach-total-count'),
            totalPoints: document.getElementById('ach-total-points'),
            filterBtns: document.querySelectorAll('.ach-filter-btn')
        };

        this.setupListeners();
        
        // Load from local storage first (for immediate display)
        this.loadFromLocal();
        
        // Then sync with server if logged in
        await this.syncWithServer();
    },

    /**
     * Setup event listeners
     */
    setupListeners() {
        // Close button
        this.elements.closeBtn?.addEventListener('click', () => this.close());
        
        // Backdrop click to close
        this.elements.backdrop?.addEventListener('click', (e) => {
            if (e.target === this.elements.backdrop) this.close();
        });
        
        // Filter buttons
        this.elements.filterBtns?.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentFilter = btn.dataset.filter;
                this.elements.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderGrid();
            });
        });
        
        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.elements.backdrop.classList.contains('hidden')) {
                this.close();
            }
        });
    },

    /**
     * Open achievements modal
     */
    open() {
        this.elements.backdrop?.classList.remove('hidden');
        this.renderGrid();
        this.updateStats();
    },

    /**
     * Close achievements modal
     */
    close() {
        this.elements.backdrop?.classList.add('hidden');
    },

    /**
     * Load achievements from local storage
     */
    loadFromLocal() {
        try {
            const data = Storage.getData();
            if (data.achievements && Array.isArray(data.achievements)) {
                this.unlockedIds = new Set(data.achievements);
            }
        } catch (e) {
            console.error('Failed to load achievements from local storage:', e);
        }
    },

    /**
     * Save achievements to local storage
     */
    saveToLocal() {
        try {
            const data = Storage.getData();
            data.achievements = Array.from(this.unlockedIds);
            Storage.save();
        } catch (e) {
            console.error('Failed to save achievements to local storage:', e);
        }
    },

    /**
     * Sync achievements with server (for registered users)
     */
    async syncWithServer() {
        const user = Auth?.currentUser;
        if (!user || user.account_type === 'demo') return;

        try {
            const token = localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch(`/api/achievements/user`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.achievements) {
                    data.achievements.forEach(a => this.unlockedIds.add(a.achievement_id));
                    this.saveToLocal();
                }
            }
        } catch (e) {
            console.error('Failed to sync achievements with server:', e);
        }
    },

    /**
     * Render the achievements grid
     */
    renderGrid() {
        if (!this.elements.grid) return;

        const filtered = this.currentFilter === 'all' 
            ? ACHIEVEMENT_LIST 
            : ACHIEVEMENT_LIST.filter(a => a.category === this.currentFilter);

        this.elements.grid.innerHTML = filtered.map(ach => {
            const isUnlocked = this.unlockedIds.has(ach.id);
            return `
                <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}" data-id="${ach.id}">
                    ${isUnlocked ? '<span class="unlocked-badge">✓</span>' : ''}
                    <div class="ach-card-icon">${ach.icon}</div>
                    <div class="ach-card-title">${ach.title}</div>
                    <div class="ach-card-desc">${ach.desc}</div>
                    <div class="ach-card-meta">
                        <span class="ach-card-points">${ach.points} pts</span>
                        <span class="ach-card-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Update stats display
     */
    updateStats() {
        const unlocked = this.unlockedIds.size;
        const total = ACHIEVEMENT_LIST.length;
        const points = ACHIEVEMENT_LIST
            .filter(a => this.unlockedIds.has(a.id))
            .reduce((sum, a) => sum + a.points, 0);

        if (this.elements.unlockedCount) this.elements.unlockedCount.textContent = unlocked;
        if (this.elements.totalCount) this.elements.totalCount.textContent = total;
        if (this.elements.totalPoints) this.elements.totalPoints.textContent = points;
    },

    /**
     * Check for achievements after a game
     */
    check(state, gameResult) {
        const newUnlocks = [];
        const data = Storage.getData();
        const stats = data.stats || {};

        // Helper function
        const tryUnlock = (id) => {
            if (!this.unlockedIds.has(id)) {
                this.unlockedIds.add(id);
                const ach = ACHIEVEMENT_LIST.find(a => a.id === id);
                if (ach) newUnlocks.push(ach);
            }
        };

        // === GAMEPLAY ===
        // First Win
        if (gameResult.win && stats.gamesWon === 1) {
            tryUnlock('first_win');
        }

        // Speed Demon (< 60 seconds)
        if (gameResult.win && gameResult.timeTaken < 60) {
            tryUnlock('speed_demon');
        }

        // Lucky Guess (first attempt)
        if (gameResult.win && gameResult.attempts === 1) {
            tryUnlock('lucky_guess');
        }

        // Close Call (last attempt)
        if (gameResult.win && gameResult.attempts === gameResult.maxAttempts) {
            tryUnlock('close_call');
        }

        // Marathon Runner (50 games)
        if (stats.gamesPlayed >= 50) {
            tryUnlock('marathon_runner');
        }

        // === MASTERY ===
        // Expert Mind (5-letter win)
        if (gameResult.win && gameResult.difficulty === 5) {
            tryUnlock('expert_mind');
        }

        // Medium Well (4-letter win)
        if (gameResult.win && gameResult.difficulty === 4) {
            tryUnlock('medium_well');
        }

        // Easy Start (3-letter win)
        if (gameResult.win && gameResult.difficulty === 3) {
            tryUnlock('easy_start');
        }

        // Perfectionist (1000+ points)
        if (gameResult.score >= 1000) {
            tryUnlock('perfectionist');
        }

        // Streak Master (5 wins in a row)
        if (stats.winStreak >= 5) {
            tryUnlock('streak_master');
        }

        // === COLLECTION ===
        // Centurion (100 games)
        if (stats.gamesPlayed >= 100) {
            tryUnlock('centurion');
        }

        // Double Down (2 back-to-back wins)
        if (stats.winStreak >= 2) {
            tryUnlock('double_down');
        }

        // Triple Threat (win in all difficulties)
        const modeWins = stats.modeWins || {};
        if (modeWins['3'] && modeWins['4'] && modeWins['5']) {
            tryUnlock('triple_threat');
        }

        // === SPECIAL ===
        const hour = new Date().getHours();
        const day = new Date().getDay();

        // Night Owl (midnight to 5am)
        if (hour >= 0 && hour < 5) {
            tryUnlock('night_owl');
        }

        // Early Bird (5am to 8am)
        if (hour >= 5 && hour < 8) {
            tryUnlock('early_bird');
        }

        // Weekend Warrior (win on weekend)
        if (gameResult.win && (day === 0 || day === 6)) {
            const weekendWins = (stats.weekendWins || 0) + 1;
            stats.weekendWins = weekendWins;
            if (weekendWins >= 3) {
                tryUnlock('weekend_warrior');
            }
        }

        // Comeback Kid (win after 3 losses)
        if (gameResult.win && stats.lossStreak >= 3) {
            tryUnlock('comeback_kid');
        }

        // Full House (all other achievements)
        if (this.unlockedIds.size === ACHIEVEMENT_LIST.length - 1 && !this.unlockedIds.has('full_house')) {
            tryUnlock('full_house');
        }

        // Save and sync
        if (newUnlocks.length > 0) {
            this.saveToLocal();
            this.syncUnlocksToServer(newUnlocks);
        }

        return newUnlocks;
    },

    /**
     * Sync newly unlocked achievements to server
     */
    async syncUnlocksToServer(achievements) {
        const user = Auth?.currentUser;
        if (!user || user.account_type === 'demo') return;

        const token = localStorage.getItem('authToken');
        if (!token) return;

        for (const ach of achievements) {
            try {
                await fetch(`/api/achievements/unlock`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ achievementId: ach.id })
                });
            } catch (e) {
                console.error('Failed to sync achievement:', ach.id, e);
            }
        }
    },

    /**
     * Get achievement by ID
     */
    getById(id) {
        return ACHIEVEMENT_LIST.find(a => a.id === id);
    },

    /**
     * Check if achievement is unlocked
     */
    isUnlocked(id) {
        return this.unlockedIds.has(id);
    },

    // ===== ACHIEVEMENTS PAGE METHODS =====

    pageElements: {},
    pageFilter: 'all',

    /**
     * Initialize achievements page elements
     */
    initPage() {
        this.pageElements = {
            screen: document.getElementById('achievements-screen'),
            grid: document.getElementById('achievements-page-grid'),
            backBtn: document.getElementById('achievements-back-btn'),
            filterTabs: document.querySelectorAll('.ach-filter-tab'),
            unlocked: document.getElementById('ach-page-unlocked'),
            total: document.getElementById('ach-page-total'),
            points: document.getElementById('ach-page-points'),
            progress: document.getElementById('ach-page-progress')
        };

        // Back button
        this.pageElements.backBtn?.addEventListener('click', () => this.closePage());

        // Filter tabs
        this.pageElements.filterTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                this.pageFilter = tab.dataset.filter;
                this.pageElements.filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderPageGrid();
            });
        });
    },

    /**
     * Open achievements page
     */
    openPage() {
        console.log('[Achievements] openPage() called');
        
        // Hide only screens within game-container, not all screens
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        }

        // Show achievements screen
        const screen = document.getElementById('achievements-screen');
        if (screen) {
            screen.classList.remove('hidden');
            console.log('[Achievements] Screen shown');
        } else {
            console.error('[Achievements] Screen element not found!');
        }

        // Render content
        this.renderPageGrid();
        this.updatePageStats();
    },

    /**
     * Close achievements page and go back to dashboard
     */
    closePage() {
        this.pageElements.screen?.classList.add('hidden');
        document.getElementById('dashboard')?.classList.remove('hidden');
    },

    /**
     * Render achievements page grid
     */
    renderPageGrid() {
        if (!this.pageElements.grid) return;

        const filtered = this.pageFilter === 'all'
            ? ACHIEVEMENT_LIST
            : ACHIEVEMENT_LIST.filter(a => a.category === this.pageFilter);

        this.pageElements.grid.innerHTML = filtered.map(ach => {
            const isUnlocked = this.unlockedIds.has(ach.id);
            return `
                <div class="ach-page-card ${isUnlocked ? 'unlocked' : 'locked'}">
                    ${isUnlocked ? '<span class="ach-unlocked-badge">✓ UNLOCKED</span>' : ''}
                    <div class="ach-page-card-header">
                        <div class="ach-page-icon">${ach.icon}</div>
                        <div class="ach-page-info">
                            <div class="ach-page-title">${ach.title}</div>
                            <div class="ach-page-desc">${ach.desc}</div>
                        </div>
                    </div>
                    <div class="ach-page-footer">
                        <span class="ach-page-points">⭐ ${ach.points} pts</span>
                        <span class="ach-page-rarity ${ach.rarity}">${ach.rarity}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Update page stats
     */
    updatePageStats() {
        const unlocked = this.unlockedIds.size;
        const total = ACHIEVEMENT_LIST.length;
        const points = ACHIEVEMENT_LIST
            .filter(a => this.unlockedIds.has(a.id))
            .reduce((sum, a) => sum + a.points, 0);
        const progress = Math.round((unlocked / total) * 100);

        if (this.pageElements.unlocked) this.pageElements.unlocked.textContent = unlocked;
        if (this.pageElements.total) this.pageElements.total.textContent = total;
        if (this.pageElements.points) this.pageElements.points.textContent = points.toLocaleString();
        if (this.pageElements.progress) this.pageElements.progress.textContent = `${progress}%`;
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Achievements.init();
    Achievements.initPage();
});
