/**
 * Settings Module
 * Handles Account, Appearance, and Audio settings.
 */
window.Settings = {
    elements: {
        modal: null,
        tabs: null,
        panels: null,
        closeBtn: null,
        inputs: {
            avatar: null,
            username: null,
            email: null,
            saveUsernameBtn: null,
            theme: null,
            reducedMotion: null,
            compactMode: null,
            masterVolume: null,
            sfx: null,
            bgMute: null
        },
        buttons: {
            uploadAvatar: null,
            removeAvatar: null,
            signOut: null,
            deleteAccount: null
        }
    },

    state: {
        activeTab: 'account',
        originalUsername: ''
    },

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadLocalPreferences();
    },

    cacheElements() {
        const $ = (id) => document.getElementById(id);
        
        this.elements.modal = $('settings-modal');
        this.elements.tabs = document.querySelectorAll('.settings-tab');
        this.elements.panels = document.querySelectorAll('.settings-panel');
        this.elements.closeBtn = $('close-settings-btn');
        
        this.elements.inputs = {
            avatarInput: $('avatar-input'),
            displayedAvatar: $('settings-avatar'),
            username: $('settings-username'),
            email: $('settings-email'),
            saveUsernameBtn: $('save-username-btn'),
            charCount: $('username-char-count'),
            theme: $('theme-toggle'),
            reducedMotion: $('reduce-motion-toggle'),
            compactMode: $('compact-mode-toggle'),
            masterVolume: $('master-volume'),
            sfx: $('sfx-toggle'),
            bgMute: $('bg-mute-toggle')
        };

        this.elements.buttons = {
            uploadAvatar: $('upload-avatar-btn'),
            removeAvatar: $('remove-avatar-btn'),
            signOut: $('btn-signout'),
            deleteAccount: $('btn-delete-account')
        };
    },

    bindEvents() {
        // Tab Switching
        this.elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Close
        this.elements.closeBtn.addEventListener('click', () => {
            if (window.UI) UI.closeModals();
        });

        // --- ACCOUNT ---
        
        // Avatar Upload
        this.elements.inputs.avatarInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
        
        // Avatar Remove
        this.elements.buttons.removeAvatar.addEventListener('click', () => this.handleAvatarRemove());

        // Username Edit
        this.elements.inputs.username.addEventListener('input', (e) => {
            const val = e.target.value;
            this.elements.inputs.charCount.textContent = val.length;
            this.elements.inputs.saveUsernameBtn.disabled = (val === this.state.originalUsername || val.length < 3);
        });

        this.elements.inputs.saveUsernameBtn.addEventListener('click', () => this.saveUsername());

        // Account Actions
        this.elements.buttons.signOut.addEventListener('click', () => Auth.logout());
        this.elements.buttons.deleteAccount.addEventListener('click', () => this.confirmDeleteAccount());

        // --- APPEARANCE & AUDIO (Auto-save) ---
        
        const attachToggle = (el, key, callback) => {
            if (!el) return;
            el.addEventListener('change', () => {
                const settings = Storage.getSettings();
                settings[key] = el.checked;
                Storage.saveSettings(settings);
                if (callback) callback(el.checked);
            });
        };

        attachToggle(this.elements.inputs.theme, 'darkMode', (val) => UI && UI.applyTheme(val));
        
        attachToggle(this.elements.inputs.reducedMotion, 'reducedMotion', (val) => {
             document.body.classList.toggle('reduced-motion', val);
        });

        attachToggle(this.elements.inputs.compactMode, 'compactMode', (val) => {
             document.body.classList.toggle('compact-mode', val);
        });
        
        attachToggle(this.elements.inputs.sfx, 'soundEnabled', (val) => {
             // Sync with AudioController if needed
             if (window.AudioController) AudioController.toggle(val);
        });

        attachToggle(this.elements.inputs.bgMute, 'muteOnBlur', (val) => {
             // Handled by visibility listener
        });

        // Master Volume
        this.elements.inputs.masterVolume.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            const settings = Storage.getSettings();
            settings.masterVolume = val;
            Storage.saveSettings(settings);
            // Update audio engine
            // if (window.AudioController) AudioController.setVolume(val);
        });

        // Mute on Blur Handler
        document.addEventListener('visibilitychange', () => {
            const settings = Storage.getSettings();
            if (settings.muteOnBlur && document.hidden) {
                if (window.AudioController) AudioController.muteAll(true);
            } else {
                if (window.AudioController) AudioController.muteAll(false);
            }
        });
    },

    switchTab(tabName) {
        this.state.activeTab = tabName;

        // UI Updates
        this.elements.tabs.forEach(t => {
            if (t.dataset.tab === tabName) t.classList.add('active');
            else t.classList.remove('active');
        });

        this.elements.panels.forEach(p => {
             if (p.id === `panel-${tabName}`) p.classList.add('active');
             else p.classList.remove('active');
        });
    },

    open() {
        // Refresh Data
        this.refreshProfileUI();
        this.refreshSettingsUI();
        
        // Show Modal (via UI helper)
        if (window.UI) UI.showModal('settings');
    },

    loadLocalPreferences() {
        const s = Storage.getSettings();
        if (s.reducedMotion) document.body.classList.add('reduced-motion');
        if (s.compactMode) document.body.classList.add('compact-mode');
        // Theme is handled effectively by UI.init() normally
    },

    refreshSettingsUI() {
        const s = Storage.getSettings();
        // Toggles
        if (this.elements.inputs.theme) this.elements.inputs.theme.checked = !!s.darkMode;
        if (this.elements.inputs.reducedMotion) this.elements.inputs.reducedMotion.checked = !!s.reducedMotion;
        if (this.elements.inputs.compactMode) this.elements.inputs.compactMode.checked = !!s.compactMode;
        if (this.elements.inputs.sfx) this.elements.inputs.sfx.checked = s.soundEnabled !== false; // default true
        if (this.elements.inputs.bgMute) this.elements.inputs.bgMute.checked = !!s.muteOnBlur;
        
        // Volume
        if (this.elements.inputs.masterVolume) {
            this.elements.inputs.masterVolume.value = (s.masterVolume !== undefined) ? s.masterVolume : 100;
        }
    },

    async refreshProfileUI() {
        if (!window.Auth) return;
        const user = Auth.getUser();
        if (!user) return;

        this.elements.inputs.email.value = user.email || '';
        
        // Check for Demo Account
        const isDemo = user.account_type === 'demo';
        
        // Apply Restrictions
        this.elements.inputs.username.disabled = isDemo;
        this.elements.inputs.avatarInput.disabled = isDemo;
        this.elements.buttons.uploadAvatar.classList.toggle('disabled', isDemo); // Visual only
        this.elements.buttons.deleteAccount.style.display = isDemo ? 'none' : 'block';
        
        if (isDemo) {
             this.elements.inputs.username.title = "Demo accounts cannot edit username";
             this.elements.inputs.email.value = "Demo Account (No Email)";
        }

        // Get latest profile data
        try {
            // ... (existing logic) ...
            if (window.supabase) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();
                
                if (data) {
                    this.elements.inputs.username.value = data.username || '';
                    this.state.originalUsername = data.username || '';
                    this.elements.inputs.charCount.textContent = (data.username || '').length;
                    
                    if (data.avatar_url) {
                        this.elements.inputs.displayedAvatar.src = data.avatar_url;
                        
                        // Show/Hide Remove Button based on URL source
                        // If it's ui-avatars (default) or dicebear (demo default), hide Remove.
                        const isDefault = data.avatar_url.includes('ui-avatars.com') || data.avatar_url.includes('dicebear.com');
                        if (this.elements.buttons.removeAvatar) {
                            if (isDefault) this.elements.buttons.removeAvatar.classList.add('hidden');
                            else this.elements.buttons.removeAvatar.classList.remove('hidden');
                        }
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    async handleAvatarUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 1024 * 1024) {
            alert("File size must be under 1MB");
            return;
        }

        // Convert to Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64 = reader.result;
            
            // Optimistic UI update
            this.elements.inputs.displayedAvatar.src = base64;

            try {
                // Send to Server
                const token = localStorage.getItem('authToken');
                if (!token) throw new Error("No token");

                const res = await fetch('/auth/avatar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ image: base64 })
                });

                if (!res.ok) throw new Error('Upload failed');
                
                const data = await res.json();
                
                // Update UI with real URL from server if returned
                if (data.url) this.elements.inputs.displayedAvatar.src = data.url;
                
                // Show Remove button since we just uploaded a custom one
                if (this.elements.buttons.removeAvatar) {
                    this.elements.buttons.removeAvatar.classList.remove('hidden');
                }

            } catch (err) {
                alert("Failed to upload avatar: " + err.message);
                this.refreshProfileUI(); // Revert
            }
        };
    },

    async handleAvatarRemove() {
        if (!confirm("Remove your profile photo?")) return;

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/auth/avatar', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                let errorMessage = 'Removal failed';
                try {
                    const errData = await res.json();
                    errorMessage = errData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server Error (${res.status})`;
                }
                throw new Error(errorMessage);
            }
            
            const data = await res.json();
            
            // Update UI
            if (data.url) this.elements.inputs.displayedAvatar.src = data.url;
            
            // Hide Remove button
            if (this.elements.buttons.removeAvatar) {
                this.elements.buttons.removeAvatar.classList.add('hidden');
            }

        } catch (err) {
            alert("Failed to remove avatar: " + err.message);
        }
    },

    async saveUsername() {
        const newName = this.elements.inputs.username.value.trim();
        if (newName.length < 3) {
            alert("Username must be at least 3 characters");
            return;
        }

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/auth/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username: newName })
            });

            if (!res.ok) throw new Error("Update failed");
            
            this.state.originalUsername = newName;
            this.elements.inputs.saveUsernameBtn.disabled = true;
            alert("Username updated!");

        } catch (err) {
            alert("Error: " + err.message);
        }
    },

    confirmDeleteAccount() {
        if (confirm("If you proceed, your account will be deleted completely.\n\nThis action cannot be undone.")) {
             this.deleteAccount();
        }
    },

    async deleteAccount() {
        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch('/auth/me', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                alert("Account deleted.");
                localStorage.clear();
                window.location.reload();
            } else {
                throw new Error("Server rejected deletion");
            }
        } catch (err) {
            alert("Failed to delete account: " + err.message);
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => Settings.init());
