class AudioManager {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        
        // In a real production app, we would load these from files.
        // For this standalone demo, we can use simple synthesized beeps or placeholders
        // if files aren't physically present.
        this.synth = window.speechSynthesis; // Can be used for speaking words too if needed
    }

    init() {
        // Preload sounds if they existed
        // this.loadSound('pop', 'assets/sounds/pop.mp3');
        // ...
        
        const settings = Storage.getSettings();
        this.enabled = settings.soundEnabled;
    }

    toggle(state) {
        this.enabled = state;
    }

    play(soundName) {
        if (!this.enabled) return;

        // Simple oscillator fallbacks for "no-asset" demo
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        switch (soundName) {
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'correct':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'wrong':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            case 'win':
                // Arpeggio
                [400, 500, 600, 800].forEach((freq, i) => {
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g);
                    g.connect(ctx.destination);
                    o.frequency.value = freq;
                    g.gain.value = 0.1;
                    g.gain.linearRampToValueAtTime(0, now + 0.2 + (i*0.1));
                    o.start(now + (i*0.1));
                    o.stop(now + 0.5 + (i*0.1));
                });
                break;
             case 'loss':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.5);
                gain.gain.value = 0.2;
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
        }
    }
}

const AudioController = new AudioManager();
