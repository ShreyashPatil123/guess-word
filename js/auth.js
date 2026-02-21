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

window.Auth = {
  // State
  currentUser: null,
  sessionToken: null,
  mode: "login", // 'login' or 'signup'
  pendingEmail: null,

  // DOM Elements
  elements: {},

  /**
   * Initialize auth module
   */
  async init() {
    this.elements = {
      overlay: document.getElementById("auth-overlay"),

      // Mode toggle
      loginTab: document.getElementById("login-tab"),
      signupTab: document.getElementById("signup-tab"),

      // Forms
      loginForm: document.getElementById("login-form"),
      signupForm: document.getElementById("signup-form"),
      authTitle: document.getElementById("auth-title"),
      authSubtext: document.getElementById("auth-subtext"),

      // Login form inputs
      loginIdentifier: document.getElementById("login-identifier"),
      loginPassword: document.getElementById("login-password"),
      loginBtn: document.getElementById("login-btn"),

      // Signup form inputs
      signupUsername: document.getElementById("signup-username"),
      signupEmail: document.getElementById("signup-email"),
      signupPassword: document.getElementById("signup-password"),
      signupConfirm: document.getElementById("signup-confirm"),
      signupBtn: document.getElementById("signup-btn"),
      passwordMismatch: document.getElementById("password-mismatch"),

      // Signup form - step 2 (OTP)
      otpForm: document.getElementById("auth-otp-form"),
      otpInput: document.getElementById("signup-otp"),
      verifyBtn: document.getElementById("verify-btn"),
      otpBackBtn: document.getElementById("otp-back-btn"),

      // Shared
      errorMsg: document.getElementById("auth-error"),
      userDisplay: document.getElementById("user-display"),
      logoutBtn: document.getElementById("logout-btn"),

      // Demo
      demoBtn: document.getElementById("auth-demo-btn"),
      demoModal: document.getElementById("demo-modal"),
      demoStartBtn: document.getElementById("start-demo-btn"),
      demoNameInput: document.getElementById("demo-name"),

      // Progressive Demo Modal Flow
      demoDecisionModal: document.getElementById("demo-decision-modal-container"),
      closeDecisionBtn: document.getElementById("close-demo-modal"),
      decisionLoginBtn: document.getElementById("unlock-leaderboard-btn"),
      decisionGuestBtn: document.getElementById("continue-guest-btn"),
      guestLoginLink: document.getElementById("guest-login-link"),
      
      demoDecisionView: document.getElementById("demo-decision-view"),
      demoGuestView: document.getElementById("demo-guest-view"),

      // New Modal flow
      heroStartBtn: document.getElementById("hero-start-btn"),
      authModalPopup: document.getElementById("auth-modal-popup"),
      authCloseBtn: document.getElementById("auth-close-btn"),
      authModalBackdrop: document.querySelector(".auth-modal-backdrop"),
    };

    this.setupListeners();

    // Check existing session
    const token = localStorage.getItem("authToken");
    if (token) {
      const isValid = await this.validateSession(token);
      if (isValid) {
        this.sessionToken = token;
        this.hideAuthOverlay();
        return;
      }
      localStorage.removeItem("authToken");
    }

    this.showAuthOverlay();
  },

  /**
   * Setup event listeners
   */
  setupListeners() {
    // Hero to Modal transition
    this.elements.heroStartBtn?.addEventListener("click", () => {
      this.showAuthModalPopup();
    });

    // Close Modal logic
    this.elements.authCloseBtn?.addEventListener("click", () => {
      this.closeAuthModalPopup();
    });

    this.elements.authModalBackdrop?.addEventListener("click", () => {
      this.closeAuthModalPopup();
    });

    // Tab switching (Explicit logic from prompt)
    const loginTabElement = document.getElementById("login-tab");
    const signupTabElement = document.getElementById("signup-tab");
    const loginFormElement = document.getElementById("login-form");
    const signupFormElement = document.getElementById("signup-form");
    const authTitleElement = document.getElementById("auth-title");
    const authSubtextElement = document.getElementById("auth-subtext");

    loginTabElement?.addEventListener("click", () => {
      loginTabElement.classList.add("active");
      signupTabElement.classList.remove("active");

      loginFormElement.classList.remove("hidden");
      signupFormElement.classList.add("hidden");

      if (authTitleElement) authTitleElement.textContent = "Continue Your Streak";
      if (authSubtextElement) authSubtextElement.textContent = "Log in to track scores and climb the leaderboard.";
    });

    signupTabElement?.addEventListener("click", () => {
      signupTabElement.classList.add("active");
      loginTabElement.classList.remove("active");

      signupFormElement.classList.remove("hidden");
      loginFormElement.classList.add("hidden");

      if (authTitleElement) authTitleElement.textContent = "Create Your Player Profile";
      if (authSubtextElement) authSubtextElement.textContent = "Compete, rank up, and prove your speed.";
    });

    // Form submissions (Routing to existing logic)
    loginFormElement?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    signupFormElement?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSignupStart();
    });

    // Setup password validation and OTP exactly natively
    const validatePasswords = () => this.validatePasswordMatch();
    this.elements.signupPassword?.addEventListener("input", validatePasswords);
    this.elements.signupConfirm?.addEventListener("input", validatePasswords);

    // OTP form
    this.elements.verifyBtn?.addEventListener("click", () =>
      this.handleSignupVerify(),
    );
    this.elements.otpBackBtn?.addEventListener("click", () =>
      this.showSignupForm(),
    );
    this.elements.otpInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleSignupVerify();
    });

    // Logout
    this.elements.logoutBtn?.addEventListener("click", () => this.logout());

    // ==========================================
    // Progressive Demo / Guest Decision Flow
    // ==========================================
    const demoModal = document.getElementById("demo-decision-modal-container");
    const decisionView = document.getElementById("demo-decision-view");
    const guestView = document.getElementById("demo-guest-view");

    function showDecisionView() {
      if (decisionView) decisionView.classList.remove("hidden");
      if (guestView) guestView.classList.add("hidden");
      if (decisionView) {
        decisionView.style.display = "block";
        decisionView.style.opacity = "1";
      }
      if (guestView) {
        guestView.style.display = "none";
        guestView.style.opacity = "0";
      }
    }

    function showGuestView() {
      if (decisionView) decisionView.classList.add("hidden");
      if (guestView) guestView.classList.remove("hidden");
      if (decisionView) {
        decisionView.style.display = "none";
        decisionView.style.opacity = "0";
      }
      if (guestView) {
        guestView.style.display = "block";
        guestView.style.opacity = "1";
      }
    }

    const openDemoModal = () => {
      if (demoModal) {
        demoModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
        showDecisionView();
      }
    };

    window.closeDemoModal = () => {
      if (demoModal) {
        demoModal.classList.add("hidden");
        document.body.classList.remove("modal-open");
      }
    };

    const heroDemoBtn = document.getElementById("auth-demo-btn");
    heroDemoBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      openDemoModal();
    });

    const continueGuestBtn = document.getElementById("continue-guest-btn");
    continueGuestBtn?.addEventListener("click", showGuestView);

    const unlockLeaderboardBtn = document.getElementById("unlock-leaderboard-btn");
    unlockLeaderboardBtn?.addEventListener("click", () => {
      window.closeDemoModal();
      this.showAuthModalPopup();
    });

    const guestLoginLink = document.getElementById("guest-login-link");
    guestLoginLink?.addEventListener("click", (e) => {
      e.preventDefault();
      window.closeDemoModal();
      this.showAuthModalPopup();
    });

    const closeDemoBtnObj = document.getElementById("close-demo-modal");
    closeDemoBtnObj?.addEventListener("click", window.closeDemoModal);

    demoModal?.addEventListener("click", (e) => {
      if (e.target === demoModal) {
        window.closeDemoModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (demoModal && !demoModal.classList.contains("hidden")) {
          window.closeDemoModal();
        }
        if (this.elements.authModalPopup && !this.elements.authModalPopup.classList.contains("hidden")) {
           if (!this.isSubmitting) this.hideAuthModalPopup();
        }
      }
    });

    const startDemoSubmissionBtn = document.getElementById("start-demo-btn");
    startDemoSubmissionBtn?.addEventListener("click", () =>
      this.handleDemoLogin(),
    );

    const demoNameInputObj = document.getElementById("demo-name");
    demoNameInputObj?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.handleDemoLogin();
    });

    // Password visibility toggle
    document.querySelectorAll(".toggle-password").forEach(button => {
      button.addEventListener("click", function () {
        const input = document.getElementById(this.dataset.target);
        if (input.type === "password") {
          input.type = "text";
          this.textContent = "🙈";
        } else {
          input.type = "password";
          this.textContent = "👁";
        }
      });
    });
  },

  /**
   * Switch between login and signup modes
   */
  setMode(mode) {
    this.mode = mode;
    this.clearError();

    // Update tabs via DOM queries to match new structure
    if (mode === "login") {
      this.elements.loginTab?.classList.add("active");
      this.elements.signupTab?.classList.remove("active");
      this.elements.loginForm?.classList.remove("hidden");
      this.elements.signupForm?.classList.add("hidden");
      this.elements.otpForm?.classList.add("hidden");
      
      if (this.elements.authTitle) this.elements.authTitle.textContent = "Continue Your Streak";
      if (this.elements.authSubtext) this.elements.authSubtext.textContent = "Log in to track scores and climb the leaderboard.";

      this.elements.loginIdentifier?.focus();
    } else {
      this.elements.loginTab?.classList.remove("active");
      this.elements.signupTab?.classList.add("active");
      this.elements.loginForm?.classList.add("hidden");
      this.elements.signupForm?.classList.remove("hidden");
      this.elements.otpForm?.classList.add("hidden");

      if (this.elements.authTitle) this.elements.authTitle.textContent = "Create Your Player Profile";
      if (this.elements.authSubtext) this.elements.authSubtext.textContent = "Compete, rank up, and prove your speed.";

      this.elements.signupUsername?.focus();
    }
  },

  /**
   * Show signup form (step 1)
   */
  showSignupForm() {
    this.elements.signupForm?.classList.remove("hidden");
    this.elements.otpForm?.classList.add("hidden");
    this.clearError();
  },

  /**
   * Show OTP form (step 2)
   */
  showOtpForm() {
    this.elements.signupForm?.classList.add("hidden");
    this.elements.otpForm?.classList.remove("hidden");
    this.elements.otpInput.value = "";
    this.elements.otpInput?.focus();
    this.clearError();
  },

  /**
   * Validate password match in real-time
   */
  validatePasswordMatch() {
    const password = this.elements.signupPassword?.value || "";
    const confirm = this.elements.signupConfirm?.value || "";

    const mismatch = confirm.length > 0 && password !== confirm;

    if (this.elements.passwordMismatch) {
      this.elements.passwordMismatch.classList.toggle("hidden", !mismatch);
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
    this.elements.overlay?.classList.remove("hidden");
    this.setMode("login");
  },

  hideAuthOverlay() {
    this.elements.overlay?.classList.add("hidden");
    this.updateUserDisplay();
    // Also ensure body lock is removed and modal popup hides
    this.closeAuthModalPopup();
    document.getElementById("game-wrapper")?.classList.remove("hidden");
    document.getElementById("game-container")?.classList.remove("hidden");
  },

  /**
   * Modal Popup Flow
   */
  showAuthModalPopup() {
    this.elements.authModalPopup?.classList.remove("hidden");
    document.body.classList.add("modal-open");
    this.setMode("signup"); // Default to signup on "Start Challenge" click
  },

  closeAuthModalPopup() {
    // Guard against closing during login/signup attempt
    if (this.isSubmitting) return;

    this.elements.authModalPopup?.classList.add("hidden");
    document.body.classList.remove("modal-open");
  },

  /**
   * Display error message
   */
  showError(message) {
    if (this.elements.errorMsg) {
      this.elements.errorMsg.textContent = message;
      this.elements.errorMsg.classList.remove("hidden");
    }
  },

  clearError() {
    if (this.elements.errorMsg) {
      this.elements.errorMsg.textContent = "";
      this.elements.errorMsg.classList.add("hidden");
    }
  },

  /**
   * Set loading state
   */
  setLoading(button, isLoading) {
    if (!button) return;
    this.isSubmitting = isLoading; // Set guard flag
    if (isLoading) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = "Loading...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    }
  },

  // ==================================
  // DEMO FLOW
  // ==================================

  async handleDemoLogin() {
    const displayName = this.elements.demoNameInput?.value?.trim();

    if (!displayName || displayName.length < 2) {
      alert("Please enter a display name (min 2 chars)");
      return;
    }

    this.setLoading(this.elements.demoStartBtn, true);

    try {
      if (this.elements.demoStartBtn) {
        this.elements.demoStartBtn.disabled = true;
        this.elements.demoStartBtn.textContent = "Starting...";
      }

      const response = await fetch("/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Demo login failed");
      }

      // Success
      this.currentUser = data.user;
      this.sessionToken = data.token;
      localStorage.setItem("authToken", data.token);

      // Clean exit before routing
      if (window.closeDemoModal) {
         window.closeDemoModal();
      }

      this.ensureProfile(data.user);
      this.hideAuthOverlay();
      this.showGuestToast(); // Show toast after navigating to game
      
    } catch (error) {
      alert(error.message);
      if (this.elements.demoStartBtn) {
        this.elements.demoStartBtn.disabled = false;
        this.elements.demoStartBtn.textContent = "Start Playing as Guest";
      }
    } finally {
      this.setLoading(this.elements.demoStartBtn, false);
      if (this.elements.demoStartBtn && !this.currentUser) {
         this.elements.demoStartBtn.disabled = false;
         this.elements.demoStartBtn.textContent = "Start Playing as Guest";
      }
    }
  },

  showGuestToast() {
    const toast = document.createElement("div");
    toast.className = "guest-toast";
    toast.innerHTML = "<strong>Playing as Guest.</strong><br>Login to compete on the leaderboard.";
    
    // Minimal dynamic styling for toast (can be moved to CSS, but guarantees presence for simple UI requirements)
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translate(-50%, -20px)',
      background: 'rgba(15, 17, 21, 0.9)',
      border: '1px solid rgba(74, 222, 128, 0.5)',
      color: '#fff',
      padding: '16px 24px',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      zIndex: '9999',
      textAlign: 'center',
      opacity: '0',
      transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      pointerEvents: 'none',
    });

    document.body.appendChild(toast);

    // Slide down and fade in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translate(-50%, 0)';
    });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -20px)';
      setTimeout(() => toast.remove(), 400); // 400ms transition time
    }, 4000);
  },

  // ==================================
  // LOGIN FLOW (Email OR Username + Password)
  // ==================================

  async handleLogin() {
    const identifier = this.elements.loginIdentifier?.value?.trim();
    const password = this.elements.loginPassword?.value;

    if (!identifier) {
      this.showError("Please enter your email or username");
      return;
    }

    if (!password) {
      this.showError("Please enter your password");
      return;
    }

    this.setLoading(this.elements.loginBtn, true);
    this.clearError();

    try {
      // Send payload as 'email' - server handles detection
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Success!
      this.currentUser = data.user;
      this.sessionToken = data.token;
      localStorage.setItem("authToken", data.token);
      this.ensureProfile(data.user);
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
    const username = this.elements.signupUsername?.value?.trim();
    const email = this.elements.signupEmail?.value?.trim();
    const password = this.elements.signupPassword?.value;
    const confirmPassword = this.elements.signupConfirm?.value;

    if (!username || username.length < 3) {
      this.showError("Username must be at least 3 characters");
      this.elements.signupUsername?.focus();
      return;
    }

    if (!email || !email.includes("@")) {
      this.showError("Please enter a valid email");
      return;
    }

    if (!password || password.length < 6) {
      this.showError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      this.showError("Passwords do not match");
      return;
    }

    this.setLoading(this.elements.signupBtn, true);
    this.clearError();

    try {
      const response = await fetch("/auth/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Signup failed");
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
      this.showError("Please enter the verification code");
      return;
    }

    if (!this.pendingEmail) {
      this.showError("Session expired. Please start again.");
      this.showSignupForm();
      return;
    }

    this.setLoading(this.elements.verifyBtn, true);
    this.clearError();

    try {
      const response = await fetch("/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: this.pendingEmail,
          otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      // Success!
      this.currentUser = data.user;
      // The server now returns the chosen username in user object,
      // but we might need to refresh profile to be sure.

      this.sessionToken = data.token;
      localStorage.setItem("authToken", data.token);
      this.pendingEmail = null;
      // Ensure profile (just in case)
      if (window.supabase) {
        // Profile creation moved to backend, so this is just a sync check
        this.ensureProfile(data.user);
      }
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
      const response = await fetch("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
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
      this.elements.userDisplay.textContent = this.currentUser.username || this.currentUser.email;
      this.elements.userDisplay.classList.remove("hidden");
    }
    if (this.elements.logoutBtn && this.currentUser) {
      this.elements.logoutBtn.classList.remove("hidden");
    }
  },

  async logout() {
    try {
      await fetch("/auth/logout", { method: "POST" });
    } catch (e) {}

    this.currentUser = null;
    this.sessionToken = null;
    localStorage.removeItem("authToken");

    if (this.elements.userDisplay) {
      this.elements.userDisplay.classList.add("hidden");
    }
    if (this.elements.logoutBtn) {
      this.elements.logoutBtn.classList.add("hidden");
    }

    this.showAuthOverlay();
  },

  isLoggedIn() {
    return !!this.sessionToken;
  },

  async ensureProfile(user) {
    // Now handled mostly by backend, but kept for redundancy
    if (!user || !window.supabase) return;
  },

  getUser() {
    return this.currentUser;
  },
};

// Initialize
document.addEventListener("DOMContentLoaded", () => Auth.init());
