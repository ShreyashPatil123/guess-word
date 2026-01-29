/**
 * Leaderboard Module
 * Handles fetching and rendering leaderboards from Supabase views.
 */

/**
 * Leaderboard Logic - Desktop First Implementation
 */
const Leaderboard = {
    state: {
        activeTab: 'global', // 'global' | '3' | '4' | '5'
        data: {}, // Cache: { [tab]: [] }
        stats: null, // Cache for header stats
        isLoading: false
    },

    elements: {
        screen: null,
        podium: null,
        list: null, // tbody
        tabs: null,
        stats: {
            totalPlayers: null,
            userRank: null
        },
        viewStates: {
            loading: null,
            empty: null,
            error: null
        }
    },

    init() {
        this.elements.screen = document.getElementById('leaderboard-screen');
        this.elements.list = document.getElementById('lb-list');
        this.elements.podium = document.getElementById('lb-podium');
        this.elements.tabs = document.querySelectorAll('.lb-tab');
        
        // Stats Elements
        this.elements.stats.totalPlayers = document.getElementById('stat-total-players');
        this.elements.stats.userRank = document.getElementById('stat-user-rank'); // "Your Global Rank"

        // View States
        this.elements.viewStates.loading = document.getElementById('lb-loading');
        this.elements.viewStates.empty = document.getElementById('lb-empty');
        this.elements.viewStates.error = document.getElementById('lb-error');

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

        this.fetchHeaderStats();
        this.switchTab(this.state.activeTab, false);
    },

    retry() {
        this.state.stats = null;
        this.open(false);
    },

    async fetchHeaderStats() {
        if (this.state.stats) {
            this.renderHeaderStats(this.state.stats);
            return;
        }

        try {
            if (!window.supabase) throw new Error('Supabase client missing');

            // 1. Total Players - Count profiles (exact)
            // Fallback to user_overall_stats if profiles access fails/doesn't exist
            let totalPlayers = '-';
            
            // Attempt 1: profiles
            const { count: profileCount, error: profileError } = await window.supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            if (!profileError && profileCount !== null) {
                totalPlayers = profileCount;
            } else {
                // Attempt 2: user_overall_stats
                const { count: statsCount } = await window.supabase
                    .from('user_overall_stats')
                    .select('*', { count: 'exact', head: true });
                if (statsCount !== null) totalPlayers = statsCount;
            }

            // 2. User Rank
            let userRank = 'Unranked';
            const user = window.Auth && Auth.getUser();
            
            if (user) {
                const { data: rankData } = await window.supabase
                    .from('leaderboard_global')
                    .select('rank')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (rankData) userRank = `#${rankData.rank}`;
            }

            this.state.stats = { total: totalPlayers, rank: userRank };
            this.renderHeaderStats(this.state.stats);

        } catch (err) {
            console.warn('Stats fetch error:', err);
        }
    },

    renderHeaderStats(stats) {
        if (this.elements.stats.totalPlayers) {
            this.elements.stats.totalPlayers.textContent = stats.total;
        }
        if (this.elements.stats.userRank) {
            this.elements.stats.userRank.textContent = stats.rank;
        }
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
                    .select('*') // Select all to see what we get
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
            
            // Response received

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
            this.elements.podium.classList.add('hidden');
            this.elements.list.innerHTML = '';
            return;
        }

        this.setView('content');

        // Logic: All players go to Table. Top 3 go to Podium (Desktop only).
        const showPodium = window.innerWidth >= 1024 && data.length >= 3;

        if (showPodium) {
            this.elements.podium.classList.remove('hidden');
            this.renderPodium(data.slice(0, 3));
        } else {
            this.elements.podium.classList.add('hidden');
        }

        this.renderTable(data);
    },

    renderPodium(top3) {
        // top3 is [Rank1, Rank2, Rank3]
        // DOM Order needs to be: Rank2, Rank1, Rank3
        const r1 = top3[0];
        const r2 = top3[1];
        const r3 = top3[2];
        
        const renderCard = (row, actualRank) => {
            if (!row) return '';
            const uname = row.username || 'Player';
            const avatar = row.avatar_url || 'assets/default-avatar.png';
            const val = Math.round(row.avg_score || 0);
            
            return `
                <div class="podium-card rank-${actualRank}">
                    <div class="podium-medal">${actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉'}</div>
                    <img src="${avatar}" class="podium-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${uname}'">
                    <div class="podium-u-info">
                        <div class="podium-name">${uname}</div>
                        <div class="podium-score">${val}</div>
                        <div class="podium-sub">Avg Score</div>
                    </div>
                </div>
            `;
        };

        this.elements.podium.innerHTML = `
            ${renderCard(r2, 2)}
            ${renderCard(r1, 1)}
            ${renderCard(r3, 3)}
        `;
    },

    renderTable(data) {
        this.elements.list.innerHTML = '';
        const user = window.Auth && Auth.getUser();
        const currentUserId = user ? user.id : null;
        const isGlobal = this.state.activeTab === 'global';

        data.forEach((row, idx) => {
            const rank = row.rank || (idx + 1);
            const isMe = row.user_id === currentUserId;
            const avatar = row.avatar_url || 'assets/default-avatar.png';
            const uname = row.username || 'Player';
            
            // Stats Mapping
            const avg = Math.round(row.avg_score || 0);
            let best = '-';
            let games = 0;
            let wins = 0;

            if (isGlobal) {
                // leaderboard_global fields: total_games, total_wins, (no best_score usually)
                games = row.total_games || 0;
                wins = row.total_wins || 0;
            } else {
                // leaderboard_by_mode fields: games_played, games_won, best_score
                games = row.games_played || 0;
                wins = row.games_won || 0;
                best = row.best_score || '-';
            }

            const tr = document.createElement('tr');
            if (isMe) tr.className = 'current-user';
            
            tr.innerHTML = `
                <td class="rank-badge-cell">#${rank}</td>
                <td class="col-player-cell">
                    <img src="${avatar}" class="col-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${uname}'">
                    <span class="player-name">${uname}</span>
                    ${isMe ? '<span class="me-badge">YOU</span>' : ''}
                </td>
                <td class="td-stat tr-high-score">${avg}</td>
                <td class="td-stat">${best}</td>
                <td class="td-stat desktop-only">${games}</td>
                <td class="td-stat desktop-only">${wins}</td>
            `;
            this.elements.list.appendChild(tr);
        });
    },

    setView(view) {
        // view: 'loading' | 'empty' | 'error' | 'content'
        const { loading, empty, error } = this.elements.viewStates;
        
        // Safety check
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
