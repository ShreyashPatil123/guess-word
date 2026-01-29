/**
 * Intro Module
 * Handles the initial video playback flow.
 * 
 * Logic:
 * 1. Check 'introSeen' in localStorage.
 * 2. If false: Show video, play, wait for end/skip -> Fade out -> Set true -> Reveal Auth.
 * 3. If true: Hide video immediately -> Reveal Auth.
 */

const Intro = {
    elements: {},
    
    init() {
        this.elements = {
            screen: document.getElementById('intro-video-screen'),
            video: document.getElementById('intro-video'),
            skipBtn: document.getElementById('skip-intro-btn'),
            authOverlay: document.getElementById('auth-overlay')
        };

        const hasSeenIntro = localStorage.getItem('introSeen') === 'true';

        if (!hasSeenIntro) {
            this.playIntro();
        } else {
            this.skipIntro(true); // Immediate skip
        }
    },

    playIntro() {
        // Show screen
        if (this.elements.screen) {
            this.elements.screen.classList.remove('hidden');
        }

        // Hide auth initially (it's behind anyway due to z-index, but good practice)
        if (this.elements.authOverlay) {
            this.elements.authOverlay.classList.add('hidden');
        }

        if (this.elements.video) {
            // Unmute attempt (browsers might block unmuted autoplay)
            this.elements.video.muted = true; 
            
            // Play
            this.elements.video.play().catch(err => {
                console.warn("Autoplay failed:", err);
                // If autoplay fails, we show btn or skip
                this.skipIntro();
            });

            // Events
            this.elements.video.addEventListener('ended', () => this.finishIntro());

            // Show skip button after 2.5s
            setTimeout(() => {
                if (this.elements.skipBtn) {
                    this.elements.skipBtn.classList.remove('hidden');
                    this.elements.skipBtn.onclick = () => this.finishIntro();
                }
            }, 2500);
        } else {
            this.skipIntro();
        }
    },

    finishIntro() {
        
        // Mark as seen
        localStorage.setItem('introSeen', 'true');

        // Fade out
        if (this.elements.screen) {
            this.elements.screen.classList.add('fade-out');
            
            // Wait for animation then hide
            setTimeout(() => {
                this.elements.screen.classList.add('hidden');
                this.showAuth();
            }, 800); // 0.8s Matches CSS transition
        } else {
            this.showAuth();
        }
    },

    skipIntro(immediate = false) {
        if (immediate) {
            if (this.elements.screen) this.elements.screen.classList.add('hidden');
            this.showAuth();
        } else {
            this.finishIntro();
        }
    },

    showAuth() {
        // Reveal auth overlay (handled by Auth.js mostly, but we ensure it's visible if it was hidden)
        if (this.elements.authOverlay) {
            this.elements.authOverlay.classList.remove('hidden');
        }
        
        // Auth.js logic takes over from here (checking session, etc.)
        // We might want to trigger a check if Auth.js already ran but didn't show overlay?
        // Auth.js runs on DOMContentLoaded. If intro is playing, Auth.js might have shown overlay BEHIND video.
        // So just revealing it is enough.
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Intro.init();
});
