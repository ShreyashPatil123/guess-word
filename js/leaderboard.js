/**
 * Leaderboard Module
 * Handles fetching and rendering leaderboards from Supabase views.
 */

/**
 * Leaderboard Logic - Desktop First Implementation
 */
window.Leaderboard = {
    state: {
        activeTab: 'global', // 'global' | '3' | '4' | '5'
        data: {}, // Cache: { [tab]: [] }
        isLoading: false
    },

    elements: {
        screen: null,
        list: null, // div
        tabs: null,
        viewStates: {
            loading: null,
            empty: null,
            error: null
        },
        podium: null
    },

    init() {
        this.elements.screen = document.getElementById('leaderboard-screen');
        this.elements.list = document.getElementById('lb-list');
        this.elements.tabs = document.querySelectorAll('.lb-tab');
        
        // View States
        this.elements.viewStates.error = document.getElementById('lb-error');
        this.elements.podium = document.getElementById('lb-podium');

        // Tab Switching
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const target = e.target.dataset.tab;
                this.switchTab(target);
            });
        });

        // Back UI
        document.getElementById('lb-back-btn')?.addEventListener('click', () => {
            if (window.UI && UI.showScreen) UI.showScreen('dashboard');
            else window.location.hash = '';
        });
    },

    open(pushState = true) {
        if (!this.elements.screen) this.init();
        
        // Use centralized navigation
        if (typeof showScreen === 'function') {
            showScreen('leaderboard-screen');
        } else {
            // Fallback if UI not ready
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            this.elements.screen.classList.remove('hidden');
        }
        
        if (pushState) {
            history.pushState({ screen: 'leaderboard' }, '', '#/leaderboard');
        }

        this.switchTab(this.state.activeTab, false);
    },

    retry() {
        this.open(false);
    },

    async switchTab(tab) {
        this.state.activeTab = tab;
        
        // Update Tab UI
        this.elements.tabs.forEach(t => {
            if (t.dataset.tab === tab) t.classList.add('active');
            else t.classList.remove('active');
        });

        // Data Fetch
        if (this.state.data[tab]) {
            this.renderData(this.state.data[tab]);
        } else {
            await this.fetchData(tab);
        }
    },

    async fetchData(tab) {
        if (this.state.isLoading) return;
        this.state.isLoading = true;
        this.setView('loading');

        try {
            // Check Supabase
            if (!window.supabase) throw new Error('Missing Supabase client');

            let query;
            // Fetching tab data
            
            if (tab === 'global') {
                query = window.supabase
                    .from('leaderboard_global')
                    .select('*') 
                    .order('rank', { ascending: true })
                    .limit(50);
            } else {
                query = window.supabase
                    .from('leaderboard_by_mode')
                    .select('*')
                    .eq('mode', parseInt(tab))
                    .order('rank', { ascending: true })
                    .limit(50);
            }

            const { data, error } = await query;
            
            if (error) {
                console.error('[Leaderboard] Supabase Error:', error);
                throw error;
            }

            this.state.data[tab] = data || [];
            this.renderData(this.state.data[tab]);

        } catch (err) {
            console.error('[Leaderboard] Fetch Exception:', err);
            this.setView('error');
        } finally {
            this.state.isLoading = false;
        }
    },

    renderData(data) {
        if (!data || data.length === 0) {
            this.setView('empty');
            this.elements.list.innerHTML = '';
            if (this.elements.podium) this.elements.podium.innerHTML = '';
            return;
        }

        this.setView('content');
        this.renderLayout(data);
    },

    renderLayout(data) {
        // Split data: Top 3 for Podium, Rest for List
        const top3 = data.slice(0, 3);
        const rest = data.slice(3);

        this.renderPodium(top3);
        this.renderList(rest);
    },

    renderPodium(data) {
        if (!this.elements.podium) return;
        this.elements.podium.innerHTML = '';

        data.forEach((row, idx) => {
            const rank = row.rank || (idx + 1);
            const uname = row.username || 'Player';
            const score = Math.round(row.best_score || 0);
            const avg = Math.round(row.avg_score || 0);
            const avatar = row.avatar_url || `https://ui-avatars.com/api/?name=${uname}&background=random`;

            let medal = '🥇';
            if (rank === 2) medal = '🥈';
            if (rank === 3) medal = '🥉';

            const card = document.createElement('div');
            card.className = `podium-card rank-${rank}`;
            
            card.innerHTML = `
                <div class="podium-avatar-wrapper">
                    <img src="${avatar}" class="podium-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${uname}'">
                    <span class="podium-medal">${medal}</span>
                </div>
                <div class="podium-name">${uname}</div>
                <div class="podium-score">
                    <span class="podium-score-value">${score.toLocaleString()}</span>
                    <span class="podium-score-label">Best Score</span>
                </div>
                <div class="podium-avg">${avg} avg</div>
            `;
            this.elements.podium.appendChild(card);
        });
    },

    renderList(data) {
        this.elements.list.innerHTML = '';
        const user = window.Auth && Auth.getUser();
        const currentUserId = user ? user.id : null;
        const isGlobal = this.state.activeTab === 'global';

        data.forEach((row, idx) => {
            const rank = row.rank || (idx + 4); // Since it starts from 4th
            const isMe = row.user_id === currentUserId;
            const uname = row.username || 'Player';
            
            // Score and Stats
            const score = Math.round(row.best_score || 0);
            const avg = Math.round(row.avg_score || 0);
            const games = isGlobal ? (row.total_games || 0) : (row.games_played || 0);
            const avatar = row.avatar_url || `https://ui-avatars.com/api/?name=${uname}&background=random`;

            const entry = document.createElement('div');
            entry.className = `leaderboard-entry ${isMe ? 'current-player' : ''}`;
            entry.dataset.rank = rank;
            
            entry.innerHTML = `
                <div class="rank-badge">#${rank}</div>
                <img src="${avatar}" class="lb-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${uname}'">
                <div class="lb-player-info">
                    <span class="lb-player-name">${uname}</span>
                    <span class="lb-player-stats">${avg} avg · ${games} games</span>
                </div>
                <div class="lb-player-score">
                    <span class="lb-score-value">${score.toLocaleString()}</span>
                    <span class="lb-score-label">Best Score</span>
                </div>
            `;
            this.elements.list.appendChild(entry);
        });
    },

    setView(view) {
        const { loading, empty, error } = this.elements.viewStates;
        
        if (loading) loading.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        if (error) error.classList.add('hidden');

        if (view === 'content') return; 
        
        if (this.elements.viewStates[view]) {
            this.elements.viewStates[view].classList.remove('hidden');
        }
    }
};

window.Leaderboard = Leaderboard;

// Auto Init
document.addEventListener('DOMContentLoaded', () => Leaderboard.init());
