window.UI = {
    // Device detection
    isTouchDevice: false,
    shownDesktopHint: false,
    lastFocusedElement: null, // For accessibility management

    elements: {
        container: document.getElementById('game-container'),
        // Note: Intro logic is now handled by intro.js, not UI
        screens: {
            dashboard: document.getElementById('dashboard'),
            difficulty: document.getElementById('difficulty-selection'),
            game: document.getElementById('game-board-area'),
            leaderboard: document.getElementById('leaderboard-screen')
        },
            buttons: {
            continue: document.getElementById('continue-game-btn'),
            newGame: document.getElementById('new-game-btn'),
            stats: document.getElementById('stats-btn'),
            tutorial: document.getElementById('tutorial-btn'), // Linked
            settings: document.getElementById('settings-btn'),
            achievements: document.getElementById('achievements-btn'),
            backToDash: document.getElementById('back-to-dash-btn'),
            playAgain: document.getElementById('play-again-btn'),
            home: document.getElementById('home-btn'),
            resetData: document.getElementById('reset-data-btn'),
            // Pause system
            pause: document.getElementById('pause-btn'),
            resume: document.getElementById('resume-btn'),
            pauseHome: document.getElementById('pause-home-btn')
        },
        grid: document.getElementById('grid-container'),
        keyboard: document.getElementById('keyboard-container'),
        timer: document.getElementById('timer'),
        score: document.getElementById('current-score'),
        modals: {
            backdrop: document.getElementById('modal-container'),
            result: document.getElementById('result-modal'),
            settings: document.getElementById('settings-modal'),
            pause: document.getElementById('pause-modal'),
            tutorial: document.getElementById('tutorial-modal')
        },
        inputs: {
            apiKey: document.getElementById('api-key-input'),
            sound: document.getElementById('sound-toggle'),
            theme: document.getElementById('theme-toggle')
        }
    },

    init() {
        // Migrate existing users to word history system (for word repetition prevention)
        Storage.migrateToWordHistory();
        
        // Log word history stats on startup (debugging)
        const wordStats = Storage.getWordHistoryStats();
        console.log('[App] Word History:', wordStats);

        // Detect touch device (capability-based, not UA sniffing)
        this.isTouchDevice = ('ontouchstart' in window) || 
                             (navigator.maxTouchPoints > 0) || 
                             (window.matchMedia('(pointer: coarse)').matches);
        
        // Mobile Input Visibility Handler
        if (this.isTouchDevice) {
             document.addEventListener('focus', (e) => {
                 if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                     // Wait for keyboard animation
                     setTimeout(() => {
                         e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     }, 300);
                 }
             }, true); // Capture phase
        }

        this.setupEventListeners();
        this.setupRouter();
        this.applyTheme(Storage.getSettings().darkMode);
    },

    setupEventListeners() {
        const { buttons, inputs } = this.elements;

        // Navigation (all use optional chaining to prevent crashes if element is missing)
        buttons.newGame?.addEventListener('click', () => this.showScreen('difficulty'));
        buttons.continue?.addEventListener('click', () => Game.resume());
        buttons.backToDash?.addEventListener('click', () => this.showScreen('dashboard'));
        
        // Leaderboard Button (Robust Binding)
        // Wraps in guaranteed DOM check, though setupEventListeners is called from init() which should be safe.
        // We add defensive checks regardless.
        
        const attachLeaderboard = () => {
            const btn = document.getElementById('leaderboard-btn') || 
                        document.querySelector('.leaderboard-btn') ||
                        document.querySelector('[aria-label="Leaderboard"]');
            
            if (btn) {
                // Remove potential weak listeners by cloning? No, strict addEventListener is better.
                // Just force styles first:
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
                btn.style.position = 'relative';
                btn.style.zIndex = '1000';

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Leaderboard clicked
                    if (window.Leaderboard && Leaderboard.open) {
                        Leaderboard.open();
                    } else {
                        console.error("Leaderboard module missing!");
                    }
                });
                // Leaderboard button attached
            } else {
                console.error("Leaderboard button not found in DOM.");
            }
        };
        
        // Immediate attempt
        attachLeaderboard();
        // Backup DOMContentLoaded just in case
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attachLeaderboard);
        }

        // Router Safety (Popstate)
        window.addEventListener('popstate', () => {
             if (location.hash === '#/leaderboard' || location.hash === '#leaderboard') { // Handle both
                 if (window.Leaderboard) Leaderboard.open();
             } else {
                 this.showScreen('dashboard');
             }
        });
        
        // Settings
        this.elements.buttons.settings.addEventListener('click', () => {
             if (window.Settings) Settings.open();
        });

        // Close Settings (Delegated to Settings.js, but keeping basic close for safety)
        document.getElementById('close-settings-btn')?.addEventListener('click', () => {
             this.closeModals();
        });

        // Difficulty Selection
        document.querySelectorAll('.diff-card').forEach(card => {
            card.addEventListener('click', () => {
                const level = parseInt(card.dataset.level);
                Game.start(level);
            });
        });

        // Modals
        
        buttons.home?.addEventListener('click', () => {
            this.closeModals();
            this.showScreen('dashboard');
        });
        
        buttons.playAgain?.addEventListener('click', () => {
            this.closeModals();
            // Restart with same difficulty
            Game.restart();
        });

        // ========== PAUSE SYSTEM ==========
        buttons.pause?.addEventListener('click', () => {
            Game.pause();
            this.showModal('pause');
        });

        buttons.resume?.addEventListener('click', () => {
            this.closeModals();
            Game.resumeFromPause();
        });

        buttons.pauseHome?.addEventListener('click', () => {
            this.closeModals();
            Game.quitToHome();
        });

        // Tutorial Logic
        buttons.tutorial?.addEventListener('click', () => {
            this.showModal('tutorial');
        });

        // Generic Close Buttons (for Tutorial and others using class)
        document.querySelectorAll('.close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        // Escape Key: Generic Modal Handler
        // (Prioritize Pause resume if paused, otherwise just close)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!this.elements.modals.backdrop.classList.contains('hidden')) {
                    this.closeModals();
                    // If game was paused, resume it? 
                    // The existing logic was: if paused, escape -> close & resume.
                    // We should preserve that behavior.
                    if (Game.state.isPaused) {
                         Game.resumeFromPause();
                    }
                }
            }
        });

        // Virtual Keyboard
        this.elements.keyboard.addEventListener('click', (e) => {
            if (e.target.classList.contains('kb-key')) {
                const key = e.target.dataset.key;
                Game.handleInput(key);
            }
        });

        // Physical Keyboard
        document.addEventListener('keydown', (e) => {
            if (this.elements.screens.game.classList.contains('hidden')) return;
            if (this.elements.modals.backdrop.offsetParent !== null) return; // Modal open
            
            const key = e.key;
            if (key === 'Enter') Game.handleInput('ENTER');
            else if (key === 'Backspace') Game.handleInput('BACKSPACE');
            else if (/^[a-zA-Z]$/.test(key)) Game.handleInput(key.toUpperCase());
        });
    },

    hideTrailer() {
        this.elements.trailerOverlay.classList.add('hidden');
        this.elements.container.classList.remove('hidden');
        try {
            this.elements.trailerVideo.pause();
        } catch (e) {
            // Ignore video errors during hide
        }
    },

    hideAllScreens() {
        Object.values(this.elements.screens).forEach(el => {
            if (el) el.classList.add('hidden');
        });
        
        // Also hide game container if it's separate from screens (it wraps them)
        // But screens are inside #game-container, except Intro/Auth.
        // The structure: body -> #game-container -> sections.
        // Just ensuring sections are hidden is enough.
    },

    showScreen(screenName) {
        this.hideAllScreens();
        
        const screen = this.elements.screens[screenName];
        if (screen) {
            screen.classList.remove('hidden');
        } else {
            console.error(`Screen "${screenName}" not found in UI.elements.screens`);
            return;
        }
        
        if (screenName === 'dashboard') {
            this.updateDashboardButtons();
            history.replaceState(null, '', ' '); // Clear hash (space prevents jump)
        }
    },

    setupRouter() {
        window.addEventListener('popstate', () => {
             const hash = window.location.hash;
             if (hash === '#leaderboard') {
                 if (typeof Leaderboard !== 'undefined') Leaderboard.open(false); // false = don't push state
             } else {
                 this.showScreen('dashboard');
             }
        });
        
        // Check initial hash
        if (window.location.hash === '#leaderboard') {
             // We need to wait for scripts to load. 
             // Logic is better placed in Leaderboard.init or a main app init.
             // But UI.init runs on DOMContentLoaded.
             setTimeout(() => {
                 if (typeof Leaderboard !== 'undefined') Leaderboard.open(false);
             }, 100);
        }
    },

    updateDashboardButtons() {
        const savedState = Storage.getData().gameState;
        if (savedState) {
            this.elements.buttons.continue.classList.remove('hidden');
        } else {
            this.elements.buttons.continue.classList.add('hidden');
        }
    },

    showModal(name) {
        this.lastFocusedElement = document.activeElement; // Save focus
        this.elements.modals.backdrop.classList.remove('hidden');
        Object.values(this.elements.modals).filter(el => el !== this.elements.modals.backdrop).forEach(el => el.classList.add('hidden'));
        
        const modal = this.elements.modals[name];
        modal.classList.remove('hidden');

        // Accessibility: Move focus to first interactable
        const focusable = modal.querySelector('button, input, [href], [tabindex]:not([tabindex="-1"])');
        if (focusable) {
            // Small timeout to ensure visibility transition doesn't block focus
            setTimeout(() => focusable.focus(), 50);
        }
    },

    closeModals() {
        this.elements.modals.backdrop.classList.add('hidden');
        // Restore focus
        if (this.lastFocusedElement) {
            this.lastFocusedElement.focus();
            this.lastFocusedElement = null; // Clear it
        }
    },

    applyTheme(isDark) {
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    },

    // --- GAME BOARD RENDERING ---

    createGrid(rows, cols) {
        const grid = this.elements.grid;
        grid.innerHTML = '';
        
        // Strict CSS Grid Support
        // Set the variable for CSS to use in grid-template-columns
        grid.style.setProperty('--letters-per-word', cols);
        
        // Remove old inline styles that might conflict
        grid.style.removeProperty('grid-template-columns');
        grid.style.removeProperty('max-width');

        for (let r = 0; r < rows; r++) {
             // Flat grid: just append tiles. Rows are implicit via grid columns.
             for(let c = 0; c < cols; c++) {
                 const tile = document.createElement('div');
                 tile.className = 'tile';
                 tile.id = `tile-${r}-${c}`;
                 grid.appendChild(tile);
             }
        }
    },

    generateKeyboard() {
        const kb = this.elements.keyboard;
        
        // Desktop: Don't render on-screen keyboard
        if (!this.isTouchDevice) {
            kb.style.display = 'none';
            // Show hint popup once per session
            if (!this.shownDesktopHint) {
                this.showDesktopKeyboardHint();
                this.shownDesktopHint = true;
            }
            return;
        }
        
        // Mobile: Render on-screen keyboard
        kb.style.display = '';
        kb.innerHTML = '';
        const rows = [
            ['Q','W','E','R','T','Y','U','I','O','P'],
            ['A','S','D','F','G','H','J','K','L'],
            ['ENTER','Z','X','C','V','B','N','M','BACKSPACE']
        ];
        rows.forEach(rowKeys => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'kb-row';
            rowKeys.forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'kb-key';
                btn.textContent = key === 'BACKSPACE' ? '⌫' : key;
                btn.dataset.key = key;
                if (key.length > 1) btn.classList.add('one-and-half');
                rowDiv.appendChild(btn);
            });
            kb.appendChild(rowDiv);
        });
    },

    showDesktopKeyboardHint() {
        // Create a simple toast notification for desktop users
        const toast = document.createElement('div');
        toast.className = 'desktop-hint-toast';
        toast.innerHTML = `
            <div class="hint-content">
                <span>⌨️ Use your keyboard to enter the answer</span>
                <button class="hint-dismiss">Got it</button>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Dismiss on button click
        toast.querySelector('.hint-dismiss').addEventListener('click', () => {
            toast.remove();
        });
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 5000);
    },

    updateGrid(guesses, currentAttempt, currentGuess, maxAttempts, cols) {
        // 1. Render past guesses
        guesses.forEach((guessObj, r) => {
            const letters = guessObj.word.split('');
            letters.forEach((letter, c) => {
                const tile = document.getElementById(`tile-${r}-${c}`);
                if (tile) {
                    tile.textContent = letter;
                    tile.dataset.state = guessObj.evaluation[c];
                    tile.style.backgroundColor = ''; // relying on css classes via data-state
                }
            });
        });

        // 2. Render current guess buffer
        if (currentAttempt < maxAttempts) {
             const buffer = currentGuess.split('');
             
             for (let c = 0; c < cols; c++) {
                 const tile = document.getElementById(`tile-${currentAttempt}-${c}`);
                 if (tile) {
                     tile.textContent = buffer[c] || '';
                     tile.dataset.state = buffer[c] ? 'active' : 'empty';
                 }
             }
        }
    },

    updateKeyboard(letterStates) { // { 'A': 'correct', 'B': 'absent' }
        Object.entries(letterStates).forEach(([key, state]) => {
            const btn = document.querySelector(`.kb-key[data-key="${key}"]`);
            if (btn) {
                // Priority: Correct > Present > Absent
                const currentState = btn.dataset.state;
                if (currentState === 'correct') return; // Don't downgrade
                if (currentState === 'present' && state === 'absent') return;
                
                btn.dataset.state = state;
            }
        });
    },

    updateTimer(seconds, totalSeconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        this.elements.timer.textContent = `${m}:${s}`;
        
        // Visual cues
        if (seconds <= 10) this.elements.timer.style.color = 'var(--accent-error)';
        else if (seconds <= 60) this.elements.timer.style.color = 'var(--accent-warning)';
        else this.elements.timer.style.color = 'var(--text-primary)';
    },

    updateScore(val) {
        this.elements.score.textContent = val;
    },

    showResult(result) {
        const { win, word, attempts, maxAttempts, timeText, score } = result;
        const titleId = win ? 'Victory!' : 'Game Over';
        document.getElementById('result-title').textContent = titleId;
        document.getElementById('result-word').textContent = word;
        document.getElementById('res-attempts').textContent = `${attempts}/${maxAttempts}`;
        document.getElementById('res-time').textContent = timeText;
        document.getElementById('res-score').textContent = score;

        this.showModal('result');
    },

    showAchievement(ach) {
        const popup = document.getElementById('achievement-popup');
        document.getElementById('ach-title').textContent = ach.title;
        document.getElementById('ach-desc').textContent = ach.desc;
        
        // Reset animation
        popup.classList.remove('hidden');
        popup.style.animation = 'none';
        popup.offsetHeight; /* trigger reflow */
        popup.style.animation = null; 

        AudioController.play('win'); // Simple chime
        setTimeout(() => popup.classList.add('hidden'), 5000);
    }
};

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => UI.init());
