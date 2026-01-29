/**
 * Auth Module - Frontend Authentication Handler
 * 
 * Supports two modes:
 * - SIGNUP: Email + Password + OTP verification
 * - LOGIN: Email + Password only (no OTP)
 * 
 * Security Notes:
 * - Passwords are sent over HTTPS to backend
 * - Backend hashes passwords before storage
 * - OTP verification is server-side only
 */

const Auth = {
    // State
    currentUser: null,
    sessionToken: null,
    mode: 'login', // 'login' or 'signup'
    pendingEmail: null,

    // DOM Elements
    elements: {},

    /**
     * Initialize auth module
     */
    async init() {
        this.elements = {
            overlay: document.getElementById('auth-overlay'),
            
            // Mode toggle
            loginTab: document.getElementById('auth-login-tab'),
            signupTab: document.getElementById('auth-signup-tab'),
            
            // Login form
            loginForm: document.getElementById('auth-login-form'),
            loginEmail: document.getElementById('login-email'),
            loginPassword: document.getElementById('login-password'),
            loginBtn: document.getElementById('login-btn'),
            
            // Signup form - step 1
            signupForm: document.getElementById('auth-signup-form'),
            signupEmail: document.getElementById('signup-email'),
            signupPassword: document.getElementById('signup-password'),
            signupConfirm: document.getElementById('signup-confirm'),
            signupBtn: document.getElementById('signup-btn'),
            passwordMismatch: document.getElementById('password-mismatch'),
            
            // Signup form - step 2 (OTP)
            otpForm: document.getElementById('auth-otp-form'),
            otpInput: document.getElementById('signup-otp'),
            verifyBtn: document.getElementById('verify-btn'),
            otpBackBtn: document.getElementById('otp-back-btn'),
            
            // Shared
            errorMsg: document.getElementById('auth-error'),
            userDisplay: document.getElementById('user-display'),
            logoutBtn: document.getElementById('logout-btn')
        };

        this.setupListeners();

        // Check existing session
        const token = localStorage.getItem('authToken');
        if (token) {
            const isValid = await this.validateSession(token);
            if (isValid) {
                this.sessionToken = token;
                this.hideAuthOverlay();
                return;
            }
            localStorage.removeItem('authToken');
        }

        this.showAuthOverlay();
    },

    /**
     * Setup event listeners
     */
    setupListeners() {
        // Mode toggle tabs
        this.elements.loginTab?.addEventListener('click', () => this.setMode('login'));
        this.elements.signupTab?.addEventListener('click', () => this.setMode('signup'));

        // Login form
        this.elements.loginBtn?.addEventListener('click', () => this.handleLogin());
        this.elements.loginEmail?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.elements.loginPassword?.focus();
        });
        this.elements.loginPassword?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Signup form - password match validation
        const validatePasswords = () => this.validatePasswordMatch();
        this.elements.signupPassword?.addEventListener('input', validatePasswords);
        this.elements.signupConfirm?.addEventListener('input', validatePasswords);

        // Signup form - submit
        this.elements.signupBtn?.addEventListener('click', () => this.handleSignupStart());

        // OTP form
        this.elements.verifyBtn?.addEventListener('click', () => this.handleSignupVerify());
        this.elements.otpBackBtn?.addEventListener('click', () => this.showSignupForm());
        this.elements.otpInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSignupVerify();
        });

        // Logout
        this.elements.logoutBtn?.addEventListener('click', () => this.logout());
    },

    /**
     * Switch between login and signup modes
     */
    setMode(mode) {
        this.mode = mode;
        this.clearError();

        // Update tabs
        if (mode === 'login') {
            this.elements.loginTab?.classList.add('active');
            this.elements.signupTab?.classList.remove('active');
            this.elements.loginForm?.classList.remove('hidden');
            this.elements.signupForm?.classList.add('hidden');
            this.elements.otpForm?.classList.add('hidden');
            this.elements.loginEmail?.focus();
        } else {
            this.elements.loginTab?.classList.remove('active');
            this.elements.signupTab?.classList.add('active');
            this.elements.loginForm?.classList.add('hidden');
            this.elements.signupForm?.classList.remove('hidden');
            this.elements.otpForm?.classList.add('hidden');
            this.elements.signupEmail?.focus();
        }
    },

    /**
     * Show signup form (step 1)
     */
    showSignupForm() {
        this.elements.signupForm?.classList.remove('hidden');
        this.elements.otpForm?.classList.add('hidden');
        this.clearError();
    },

    /**
     * Show OTP form (step 2)
     */
    showOtpForm() {
        this.elements.signupForm?.classList.add('hidden');
        this.elements.otpForm?.classList.remove('hidden');
        this.elements.otpInput.value = '';
        this.elements.otpInput?.focus();
        this.clearError();
    },

    /**
     * Validate password match in real-time
     */
    validatePasswordMatch() {
        const password = this.elements.signupPassword?.value || '';
        const confirm = this.elements.signupConfirm?.value || '';
        
        const mismatch = confirm.length > 0 && password !== confirm;
        
        if (this.elements.passwordMismatch) {
            this.elements.passwordMismatch.classList.toggle('hidden', !mismatch);
        }
        
        if (this.elements.signupBtn) {
            // Disable button if passwords don't match or are empty
            this.elements.signupBtn.disabled = mismatch || password.length < 6;
        }
        
        return !mismatch;
    },

    /**
     * Show/hide auth overlay
     */
    showAuthOverlay() {
        this.elements.overlay?.classList.remove('hidden');
        this.setMode('login');
    },

    hideAuthOverlay() {
        this.elements.overlay?.classList.add('hidden');
        this.updateUserDisplay();
        document.getElementById('game-container')?.classList.remove('hidden');
    },

    /**
     * Display error message
     */
    showError(message) {
        if (this.elements.errorMsg) {
            this.elements.errorMsg.textContent = message;
            this.elements.errorMsg.classList.remove('hidden');
        }
    },

    clearError() {
        if (this.elements.errorMsg) {
            this.elements.errorMsg.textContent = '';
            this.elements.errorMsg.classList.add('hidden');
        }
    },

    /**
     * Set loading state
     */
    setLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.textContent = 'Loading...';
        } else {
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent;
        }
    },

    // ==================================
    // LOGIN FLOW (Email + Password only)
    // ==================================

    async handleLogin() {
        const email = this.elements.loginEmail?.value?.trim();
        const password = this.elements.loginPassword?.value;

        if (!email || !email.includes('@')) {
            this.showError('Please enter a valid email');
            return;
        }

        if (!password) {
            this.showError('Please enter your password');
            return;
        }

        this.setLoading(this.elements.loginBtn, true);
        this.clearError();

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Success!
            this.currentUser = data.user;
            this.sessionToken = data.token;
            localStorage.setItem('authToken', data.token);
            this.hideAuthOverlay();

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(this.elements.loginBtn, false);
        }
    },

    // ==================================
    // SIGNUP FLOW (Email + Password + OTP)
    // ==================================

    async handleSignupStart() {
        const email = this.elements.signupEmail?.value?.trim();
        const password = this.elements.signupPassword?.value;
        const confirmPassword = this.elements.signupConfirm?.value;

        if (!email || !email.includes('@')) {
            this.showError('Please enter a valid email');
            return;
        }

        if (!password || password.length < 6) {
            this.showError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            this.showError('Passwords do not match');
            return;
        }

        this.setLoading(this.elements.signupBtn, true);
        this.clearError();

        try {
            const response = await fetch('/auth/signup/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, confirmPassword })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Signup failed');
            }

            // Success - show OTP form
            this.pendingEmail = email;
            this.showOtpForm();

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(this.elements.signupBtn, false);
        }
    },

    async handleSignupVerify() {
        const otp = this.elements.otpInput?.value?.trim();

        if (!otp || otp.length < 4) {
            this.showError('Please enter the verification code');
            return;
        }

        if (!this.pendingEmail) {
            this.showError('Session expired. Please start again.');
            this.showSignupForm();
            return;
        }

        this.setLoading(this.elements.verifyBtn, true);
        this.clearError();

        try {
            const response = await fetch('/auth/signup/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: this.pendingEmail, 
                    otp 
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            // Success!
            this.currentUser = data.user;
            this.sessionToken = data.token;
            localStorage.setItem('authToken', data.token);
            this.pendingEmail = null;
            this.hideAuthOverlay();

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(this.elements.verifyBtn, false);
        }
    },

    // ==================================
    // SESSION MANAGEMENT
    // ==================================

    async validateSession(token) {
        try {
            const response = await fetch('/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) return false;

            const data = await response.json();
            this.currentUser = data.user;
            return true;

        } catch (error) {
            return false;
        }
    },

    updateUserDisplay() {
        if (this.elements.userDisplay && this.currentUser) {
            this.elements.userDisplay.textContent = this.currentUser.email;
            this.elements.userDisplay.classList.remove('hidden');
        }
        if (this.elements.logoutBtn && this.currentUser) {
            this.elements.logoutBtn.classList.remove('hidden');
        }
    },

    async logout() {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } catch (e) {}

        this.currentUser = null;
        this.sessionToken = null;
        localStorage.removeItem('authToken');

        if (this.elements.userDisplay) {
            this.elements.userDisplay.classList.add('hidden');
        }
        if (this.elements.logoutBtn) {
            this.elements.logoutBtn.classList.add('hidden');
        }

        this.showAuthOverlay();
    },

    isLoggedIn() {
        return !!this.sessionToken;
    },

    getUser() {
        return this.currentUser;
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => Auth.init());
