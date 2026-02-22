/**
 * Feedback Modal Controller
 * Handles UI interactions, validation, rate limiting, and submission for the Feedback Form.
 * Lazy loaded when the feedback button is clicked.
 */

class FeedbackModal {
    constructor() {
        this.initialized = false;
        this.rateLimitDuration = 2 * 60 * 1000; // 2 minutes
    }

    init() {
        if (this.initialized) return;

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'feedback-modal-overlay';
        this.overlay.id = 'feedbackModalOverlay';

        // Pre-fill username if logged in
        // Assuming global app state or checking localStorage
        let username = 'Guest';
        try {
           const profile = JSON.parse(localStorage.getItem('user_profile'));
           if (profile && profile.username) username = profile.username;
        } catch(e) {}

        // Construct Modal HTML
        this.overlay.innerHTML = `
            <div class="feedback-modal-card">
                <div class="feedback-modal-header">
                    <h2>Submit Feedback</h2>
                    <button class="feedback-close-btn" id="closeFeedbackBtn">&times;</button>
                </div>
                
                <div class="feedback-modal-body no-scrollbar">
                    <form id="feedbackForm">
                        <div class="feedback-group">
                            <label>Username</label>
                            <div class="input-with-icon">
                                <span class="feedback-icon-left">🔒</span>
                                <input type="text" class="feedback-input" id="fbUsername" value="${username}" readonly>
                            </div>
                        </div>

                        <div class="feedback-group">
                            <label class="required" for="fbName">Name</label>
                            <input type="text" class="feedback-input" id="fbName" placeholder="How should we address you?" required>
                        </div>

                        <div class="feedback-group">
                            <label for="fbContact">Contact (Optional)</label>
                            <input type="text" class="feedback-input" id="fbContact" placeholder="Email or Contact number">
                        </div>

                        <div class="feedback-group">
                            <label class="required" for="fbType">Feedback Type</label>
                            <select class="feedback-input" id="fbType" required>
                                <option value="" disabled selected>Select an option...</option>
                                <option value="Bug / Crash">Bug / Crash</option>
                                <option value="New Feature Idea">New Feature Idea</option>
                                <option value="Gameplay Improvement">Gameplay Improvement</option>
                                <option value="UI/UX Suggestion">UI/UX Suggestion</option>
                                <option value="Performance Issue">Performance Issue</option>
                                <option value="Security Concern">Security Concern</option>
                                <option value="General Feedback">General Feedback</option>
                            </select>
                        </div>

                        <div class="feedback-group" id="severityGroup">
                            <label>Severity Level</label>
                            <div class="severity-options">
                                <label class="severity-label low">
                                    <input type="radio" name="fbSeverity" value="Low">
                                    <span>Low</span>
                                </label>
                                <label class="severity-label medium">
                                    <input type="radio" name="fbSeverity" value="Medium">
                                    <span>Medium</span>
                                </label>
                                <label class="severity-label high">
                                    <input type="radio" name="fbSeverity" value="High">
                                    <span>High</span>
                                </label>
                            </div>
                        </div>

                        <div class="feedback-group">
                            <label class="required" for="fbMessage">Feedback Description</label>
                            <textarea class="feedback-input no-scrollbar" id="fbMessage" placeholder="Tell us more about it..." required minlength="20"></textarea>
                            <div class="char-counter" id="fbCharCount">0 / 20 min</div>
                        </div>

                        <div class="feedback-group">
                            <label for="fbScreenshot">Upload Screenshot (Optional)</label>
                            <div class="file-input-wrapper">
                                <input type="file" class="feedback-input" id="fbScreenshot" accept="image/*">
                                <div class="file-preview-status" id="fbFileStatus">No file selected</div>
                            </div>
                        </div>
                    </form>
                </div>

                <div class="feedback-modal-footer">
                    <button type="button" class="feedback-submit-btn" id="submitFeedbackBtn">
                        <span class="btn-text">Submit Feedback</span>
                        <div class="spinner"></div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        this.bindEvents();
        this.initialized = true;
    }

    bindEvents() {
        const closeBtn = document.getElementById('closeFeedbackBtn');
        const form = document.getElementById('feedbackForm');
        const submitBtn = document.getElementById('submitFeedbackBtn');
        const typeSelect = document.getElementById('fbType');
        const severityGroup = document.getElementById('severityGroup');
        const textarea = document.getElementById('fbMessage');
        const charCount = document.getElementById('fbCharCount');

        // Close triggers
        closeBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) this.close();
        });

        // Toggle severity based on type
        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'Bug / Crash') {
                severityGroup.classList.add('visible');
            } else {
                severityGroup.classList.remove('visible');
                // Reset radio buttons
                const radios = document.getElementsByName('fbSeverity');
                radios.forEach(r => r.checked = false);
            }
        });

        // Textarea auto-resize and character count
        textarea.addEventListener('input', () => {
            // Auto resize
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
            
            // Char count
            const len = textarea.value.length;
            charCount.textContent = `${len} / 20 min`;
            if (len > 0 && len < 20) {
                charCount.classList.add('error');
            } else {
                charCount.classList.remove('error');
            }
        });

        // file selection handler
        const screenshotInput = document.getElementById('fbScreenshot');
        const fileStatus = document.getElementById('fbFileStatus');
        this.base64Image = null;

        screenshotInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 4 * 1024 * 1024) { // 4MB Limit
                    if (window.UI && window.UI.showToast) {
                        window.UI.showToast('Image is too large (max 4MB)', 'error');
                    } else {
                        alert('Image is too large (max 4MB)');
                    }
                    screenshotInput.value = '';
                    fileStatus.textContent = 'No file selected';
                    this.base64Image = null;
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    this.base64Image = event.target.result;
                    fileStatus.textContent = `File selected: ${file.name}`;
                    fileStatus.classList.add('selected');
                };
                reader.readAsDataURL(file);
            } else {
                fileStatus.textContent = 'No file selected';
                fileStatus.classList.remove('selected');
                this.base64Image = null;
            }
        });

        // Submit Logic
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.submitForm();
        });
    }

    open() {
        if (!this.initialized) this.init();
        
        // Check rate limit before opening just in case, though usually checked on submit
        const lastSubmit = localStorage.getItem('lastFeedbackSubmit');
        if (lastSubmit && (Date.now() - parseInt(lastSubmit)) < this.rateLimitDuration) {
            const remaining = Math.ceil((this.rateLimitDuration - (Date.now() - parseInt(lastSubmit))) / 60000);
            if (window.UI && window.UI.showToast) {
                window.UI.showToast(`Please wait ${remaining} min before submitting again`, 'warning');
            } else {
                alert(`Please wait ${remaining} minutes before submitting another feedback.`);
            }
            return;
        }

        this.overlay.classList.add('active');
        document.body.classList.add('modal-open');
    }

    close() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    }

    isOpen() {
        return this.overlay && this.overlay.classList.contains('active');
    }

    async submitForm() {
        const form = document.getElementById('feedbackForm');
        const submitBtn = document.getElementById('submitFeedbackBtn');
        const btnText = submitBtn.querySelector('.btn-text');

        // DOM Elements
        const username = document.getElementById('fbUsername').value;
        const nameInput = document.getElementById('fbName');
        const contactInput = document.getElementById('fbContact');
        const typeSelect = document.getElementById('fbType');
        const messageInput = document.getElementById('fbMessage');
        const screenshotInput = document.getElementById('fbScreenshot');
        
        let severity = null;
        if (typeSelect.value === 'Bug / Crash') {
            const checkedRadio = document.querySelector('input[name="fbSeverity"]:checked');
            if (checkedRadio) severity = checkedRadio.value;
        }

        // Basic HTML5 Validation
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Custom Validation
        let firstInvalid = null;

        if (nameInput.value.trim() === '') {
            nameInput.classList.add('invalid-shake');
            if(!firstInvalid) firstInvalid = nameInput;
        }
        
        if (typeSelect.value === '') {
             typeSelect.classList.add('invalid-shake');
             if(!firstInvalid) firstInvalid = typeSelect;
        }

        if (messageInput.value.trim().length < 20) {
             messageInput.classList.add('invalid-shake');
             if(!firstInvalid) firstInvalid = messageInput;
        }

        // Remove shake class after animation completes
        setTimeout(() => {
            document.querySelectorAll('.invalid-shake').forEach(el => el.classList.remove('invalid-shake'));
        }, 500);

        if (firstInvalid) {
            firstInvalid.focus();
            return;
        }

        // Rate Limit Check
        const lastSubmit = localStorage.getItem('lastFeedbackSubmit');
        if (lastSubmit && (Date.now() - parseInt(lastSubmit)) < this.rateLimitDuration) {
            if (window.UI && window.UI.showToast) {
                window.UI.showToast('Please wait before submitting another feedback.', 'error');
            }
            return;
        }

        // Prepare Data
        const payload = {
            username: username,
            name: nameInput.value.trim(),
            contact: contactInput.value.trim(),
            feedback_type: typeSelect.value,
            severity: severity,
            message: messageInput.value.trim(),
            screenshot_url: this.base64Image || null
        };

        // Loading State
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');

        try {
            const response = await fetch('/api/submit-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Submission failed');
            }

            // Success State
            localStorage.setItem('lastFeedbackSubmit', Date.now().toString());
            
            submitBtn.classList.remove('loading');
            submitBtn.classList.add('success');
            btnText.innerHTML = '✔ Submitted';
            btnText.style.display = 'inline-block';

            if (window.UI && window.UI.showToast) {
                window.UI.showToast('Thanks for helping improve the game 🎮', 'success');
            }

            // Close and reset after delay
            setTimeout(() => {
                this.close();
                // Reset form
                form.reset();
                document.getElementById('fbCharCount').textContent = '0 / 20 min';
                submitBtn.classList.remove('success');
                submitBtn.disabled = false;
                btnText.innerHTML = 'Submit Feedback';
                document.getElementById('severityGroup').classList.remove('visible');
                document.getElementById('fbFileStatus').textContent = 'No file selected';
                document.getElementById('fbFileStatus').classList.remove('selected');
                this.base64Image = null;
            }, 1500);

        } catch (error) {
            console.error("Feedback error:", error);
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            
            if (window.UI && window.UI.showToast) {
                window.UI.showToast(error.message || 'Error submitting feedback', 'error');
            } else {
                alert('Error submitting feedback: ' + error.message);
            }
        }
    }
}

// Global instance for lazy-loading access
window.feedbackModalManager = new FeedbackModal();
