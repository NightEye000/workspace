/**
 * OfficeSync - Main Application Logic
 * Handles timeline rendering, task management, and user interactions.
 */

const App = {
    // Note: updateNotificationBadge is defined at line ~1305 with full implementation

    checkNotificationBlocking() {
        const blocker = document.getElementById('notification-blocker');
        const deniedMsg = document.getElementById('notif-denied-msg');
        const btn = document.getElementById('btn-enable-notif');

        if (!blocker) return;

        // Initial load based on URL or default
        // Check if we need to load a specific note from URL hash or param? 
        // For now, default to timeline view.

        if (!("Notification" in window)) {
            // Browser doesn't support notifications, let it pass or warn?
            // For now let pass to avoid breaking purely
            blocker.classList.add('hidden');
            return;
        }

        if (Notification.permission === 'granted') {
            blocker.classList.add('hidden');
        } else {
            blocker.classList.remove('hidden'); // Show blocker

            if (Notification.permission === 'denied') {
                if (btn) btn.classList.add('hidden');
                if (deniedMsg) deniedMsg.classList.remove('hidden');
            } else {
                // default
                if (btn) btn.classList.remove('hidden');
                if (deniedMsg) deniedMsg.classList.add('hidden');
            }
        }
    },

    state: {
        user: null,
        viewMode: 'all', // 'all' or 'me'
        selectedDate: null,
        deptFilter: 'All',
        workMentions: [],     // Selected mentions for Add Work form
        requestMentions: [],  // Selected mentions for Request form

        // List View State
        listFilter: 'me',     // 'me' or 'all'
        timeFilter: 'today',   // Changed default to 'today' for performance

        // Concurrent load prevention
        isLoadingTimeline: false,
        isLoadingListView: false
    },

    els: {},
    checkInterval: null,
    allStaffList: [], // Cache of all staff for mention dropdown

    // =========================================
    // SECURITY HELPERS
    // =========================================

    /**
     * Escape HTML to prevent XSS
     * First decodes any existing HTML entities to prevent double-escaping
     */
    escapeHtml(text) {
        if (!text) return '';
        // First decode any existing HTML entities to prevent double-escaping
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        const decoded = textarea.value;
        // Then properly escape
        const div = document.createElement('div');
        div.textContent = decoded;
        return div.innerHTML;
    },

    /**
     * Validate and sanitize URL - only allow safe protocols
     * Blocks: javascript:, vbscript:, etc.
     */
    sanitizeUrl(url) {
        if (!url) return '';
        const trimmed = url.trim();

        // Block dangerous protocols
        if (/^(javascript|vbscript|data:text)/i.test(trimmed)) {
            console.warn('Blocked potentially dangerous URL:', trimmed);
            return '';
        }

        // Allow safe protocols: http, https, data:image, ftp, file, mailto
        if (/^(https?:\/\/|data:image\/|ftp:\/\/|file:\/\/|mailto:)/i.test(trimmed)) {
            return trimmed;
        }

        // For relative URLs starting with / or ./ or just words (treated as relative)
        // For relative URLs starting with / or ./ or just words (treated as relative)
        if (/^(\/|\.\/|\.\.\/|[a-zA-Z0-9_-]+)/i.test(trimmed)) {
            return trimmed;
        }

        // Return empty for suspicious URLs
        return '';
    },

    // =========================================
    // LOADING HELPERS
    // =========================================

    /**
     * Show skeleton loading in task detail modal
     */
    showDetailSkeleton() {
        const container = document.getElementById('task-detail-content');
        if (container) {
            container.innerHTML = `
                <div class="task-detail-loading">
                    <div class="skeleton-badge">
                        <div class="skeleton"></div>
                        <div class="skeleton"></div>
                    </div>
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-meta"></div>
                    <div class="skeleton-checklist">
                        <div class="skeleton-item">
                            <div class="skeleton skeleton-checkbox"></div>
                            <div class="skeleton skeleton-item-text"></div>
                        </div>
                        <div class="skeleton-item">
                            <div class="skeleton skeleton-checkbox"></div>
                            <div class="skeleton skeleton-item-text"></div>
                        </div>
                        <div class="skeleton-item">
                            <div class="skeleton skeleton-checkbox"></div>
                            <div class="skeleton skeleton-item-text"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    /**
     * Add loading state to a button
     */
    setButtonLoading(btn, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.classList.add('loading');
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<span style="opacity:0">' + btn.innerHTML + '</span>';
        } else {
            btn.classList.remove('loading');
            if (btn.dataset.originalText) {
                btn.innerHTML = btn.dataset.originalText;
            }
        }
    },

    /**
     * Show loading overlay on a section
     */
    setSectionLoading(selector, isLoading) {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (el) {
            el.classList.toggle('section-loading', isLoading);
        }
    },

    // =========================================
    // MENTIONS HELPERS
    // =========================================

    /**
     * Populate mentions dropdown with staff list
     */
    populateMentionsDropdown(selectId, excludeUserId = null) {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Clear existing options except the first
        select.innerHTML = '<option value="">+ Pilih staff untuk di-tag...</option>';

        // Get staff from cached list or from timeline
        const staffList = this.allStaffList.length > 0
            ? this.allStaffList
            : (this.state.staffList || []);

        staffList.forEach(staff => {
            if (staff.id != excludeUserId && staff.id != this.state.user?.id) {
                const option = document.createElement('option');
                option.value = staff.id;
                option.textContent = `${staff.name} (${staff.role || 'Staff'})`;
                select.appendChild(option);
            }
        });
    },

    /**
     * Handle mention selection
     */
    handleMentionSelect(selectId, containerId, stateKey) {
        const select = document.getElementById(selectId);
        const container = document.getElementById(containerId);
        if (!select || !container) return;

        select.onchange = () => {
            const userId = parseInt(select.value);
            if (!userId) return;

            // Check if already added
            if (this.state[stateKey].includes(userId)) {
                select.value = '';
                return;
            }

            // Get staff info
            const option = select.options[select.selectedIndex];
            const staffName = option.textContent;

            // Sanitize name for display
            const safeName = this.escapeHtml(staffName.split(' (')[0]);

            // Add to state
            this.state[stateKey].push(userId);

            // Create chip
            const chip = document.createElement('div');
            chip.className = 'mention-chip';
            chip.dataset.userId = userId;
            chip.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 4px 10px;
                background: linear-gradient(135deg, var(--primary-light) 0%, var(--primary) 100%);
                color: white;
                border-radius: 20px;
                font-size: 0.75rem;
                font-weight: 500;
            `;
            chip.innerHTML = `
                <span>@${safeName}</span>
                <button type="button" onclick="App.removeMention(${userId}, '${containerId}', '${stateKey}')" style="
                    background: rgba(255,255,255,0.3);
                    border: none;
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    font-size: 10px;
                    color: white;
                ">&times;</button>
            `;

            container.appendChild(chip);
            select.value = '';
        };
    },

    /**
     * Remove a mention chip
     */
    removeMention(userId, containerId, stateKey) {
        // Remove from state
        this.state[stateKey] = this.state[stateKey].filter(id => id !== userId);

        // Remove chip from DOM
        const container = document.getElementById(containerId);
        if (container) {
            const chip = container.querySelector(`[data-user-id="${userId}"]`);
            if (chip) chip.remove();
        }
    },

    /**
     * Reset mentions for a form
     */
    resetMentions(containerId, stateKey) {
        this.state[stateKey] = [];
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
        }
    },

    // =========================================
    // INITIALIZATION
    // =========================================

    init() {
        this.cacheDom();
        this.bindEvents();
        this.initDatePicker();

        // Ensure Lucide icons are ready
        this.initIcons();

        // Initialize Mobile Nav
        this.initMobileNav();

        // checkAuth will handle showing login or main app
        // and it will finally call hideLoading()
        this.checkAuth().finally(() => {
            this.hideLoading();
            this.checkNotificationBlocking();
        });

        // Global error handler for unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });

        // Cleanup intervals on page unload to prevent memory leaks
        window.addEventListener('beforeunload', () => {
            this.cleanupIntervals();
        });

        // Also cleanup on visibility change (tab hidden/closed)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // Optionally pause intensive intervals when tab is hidden
            }
        });
    },

    cleanupIntervals() {
        if (window.NotificationManager && window.NotificationManager.stop) {
            window.NotificationManager.stop();
        }
    },

    cacheDom() {
        this.els.loading = document.getElementById('loading-screen');
        this.els.loginPage = document.getElementById('login-page');
        this.els.mainApp = document.getElementById('main-app');
        this.els.loginForm = document.getElementById('login-form');
        this.els.loginError = document.getElementById('login-error');
        this.els.headerUserInfo = document.getElementById('header-user-info');
        this.els.logoutBtn = document.getElementById('btn-logout');

        this.els.datePicker = document.getElementById('date-picker');
        this.els.dateLabel = document.getElementById('selected-date-label');
        this.els.deptFilter = document.getElementById('dept-filter');
        this.els.timelineContainer = document.getElementById('timeline-container');

        this.els.notifBadge = document.getElementById('notif-badge');
        this.els.notifBtn = document.getElementById('notif-btn');
        this.els.notifDropdown = document.getElementById('notif-dropdown');
        this.els.notifList = document.getElementById('notif-list');
        this.els.clearNotifsBtn = document.getElementById('clear-notifs');

        // Buttons
        this.els.btnAddWork = document.getElementById('btn-add-work');
        this.els.btnRequest = document.getElementById('btn-request');
        this.els.btnUserMgmt = document.getElementById('btn-user-management');
    },

    bindEvents() {
        // Login
        if (this.els.loginForm) {
            this.els.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        if (this.els.logoutBtn) {
            this.els.logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Filters
        if (this.els.datePicker) {
            this.els.datePicker.addEventListener('change', (e) => {
                this.state.selectedDate = e.target.value;
                this.updateDateLabel();
                this.loadTimeline();
            });
        }

        if (this.els.deptFilter) {
            this.els.deptFilter.addEventListener('change', (e) => {
                this.state.deptFilter = e.target.value;
                if (this.state.viewMode === 'list') {
                    this.loadListView();
                } else {
                    this.loadTimeline();
                }
            });
        }

        // Modals
        if (this.els.btnAddWork) {
            this.els.btnAddWork.addEventListener('click', () => {
                this.openAddWorkForStaff(this.state.user.id);
            });
        }

        if (this.els.btnRequest) {
            this.els.btnRequest.addEventListener('click', () => {
                this.openModal('modal-request');
                this.initRequestForm();
            });
        }

        // Attachment Form
        const attForm = document.getElementById('form-attachment');
        if (attForm) {
            attForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.submitAttachment();
            });
        }

        if (this.els.btnUserMgmt) {
            this.els.btnUserMgmt.addEventListener('click', () => {
                this.openModal('modal-users');
                this.loadUsersTable();
            });
        }

        // Modal Close Buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(btn.dataset.modal);
            });
        });

        // Notifications
        if (this.els.notifBtn) {
            this.els.notifBtn.addEventListener('click', () => {
                this.els.notifDropdown.classList.toggle('hidden');
                if (!this.els.notifDropdown.classList.contains('hidden')) {
                    this.loadNotifications();
                }
            });
        }

        if (this.els.clearNotifsBtn) {
            this.els.clearNotifsBtn.addEventListener('click', () => this.clearNotifications());
        }

        // Forms
        document.getElementById('form-add-work')?.addEventListener('submit', (e) => this.handleAddWork(e));
        document.getElementById('form-request')?.addEventListener('submit', (e) => this.handleRequest(e));
        document.getElementById('form-user')?.addEventListener('submit', (e) => this.handleUserSubmit(e));
        document.getElementById('btn-add-user')?.addEventListener('click', () => this.openUserForm());

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (this.els.notifDropdown && !this.els.notifBtn.contains(e.target) && !this.els.notifDropdown.contains(e.target)) {
                this.els.notifDropdown.classList.add('hidden');
            }
            // Close mobile drawer on outside click
            const drawer = document.getElementById('mobile-menu-drawer');
            if (drawer && drawer.classList.contains('active') && !drawer.querySelector('.drawer-content').contains(e.target) && !e.target.closest('#mobile-btn-menu')) {
                drawer.classList.remove('active');
            }
        });

        // Mobile Nav Bindings
        document.getElementById('mobile-btn-add-work')?.addEventListener('click', () => {
            this.openAddWorkForStaff(this.state.user.id);
        });
        document.getElementById('mobile-btn-request')?.addEventListener('click', () => {
            this.openModal('modal-request');
            this.initRequestForm();
        });
        document.getElementById('mobile-btn-menu')?.addEventListener('click', () => {
            this.openMobileDrawer();
        });
        document.getElementById('close-mobile-menu')?.addEventListener('click', () => {
            document.getElementById('mobile-menu-drawer').classList.remove('active');
        });
        document.getElementById('mobile-btn-logout')?.addEventListener('click', () => this.handleLogout());

        // Admin Mobile Links
        document.getElementById('mobile-btn-users')?.addEventListener('click', () => {
            document.getElementById('mobile-menu-drawer').classList.remove('active');
            this.openModal('modal-users');
            this.loadUsersTable();
        });

        // Profile
        this.initProfileAvatarHandler(); // Init file input listener

        document.getElementById('btn-profile')?.addEventListener('click', () => {
            this.openProfileModal();
        });
        document.getElementById('mobile-btn-profile')?.addEventListener('click', () => {
            document.getElementById('mobile-menu-drawer').classList.remove('active');
            this.openProfileModal();
        });
        document.getElementById('form-profile')?.addEventListener('submit', (e) => this.handleProfileSubmit(e));

        // Admin User Form Live Preview
        const userFormInputs = ['user-name', 'user-gender'];
        userFormInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.updateAvatarPreview());
                el.addEventListener('change', () => this.updateAvatarPreview());
            }
        });

        // Notification Blocker
        document.getElementById('btn-enable-notif')?.addEventListener('click', () => {
            Notification.requestPermission().then(() => {
                this.checkNotificationBlocking();
            });
        });

        // Re-check on focus (in case user changed settings in another tab/window)
        window.addEventListener('focus', () => {
            this.checkNotificationBlocking();
            this.checkAnnouncements(); // Re-check announcements on focus
        });

        // Announcement Form
        document.getElementById('form-create-announcement')?.addEventListener('submit', (e) => this.handleCreateAnnouncement(e));
    },

    // =========================================
    // UI HELPERS
    // =========================================

    updateAvatarPreview(existingUrl = null) {
        const previewEl = document.getElementById('user-avatar-preview');
        if (!previewEl) return;

        // If existing url is provided (edit mode initial load), show it
        // UNLESS we want to force live preview? 
        // Better: If we have existing URL and inputs haven't changed, show existing.
        // But for simplicity and "Live" feel, we might just generate based on inputs if no existingUrl passed.

        if (existingUrl) {
            previewEl.src = existingUrl;
            return;
        }

        const name = document.getElementById('user-name').value.trim() || 'New User';
        const gender = document.getElementById('user-gender').value; // Laki-laki / Perempuan

        // Logic matches backend generateAvatar
        // Use encodeURIComponent to match PHP rawurlencode
        let baseUrl = "https://api.dicebear.com/7.x/avataaars/svg";
        let query = `seed=${encodeURIComponent(name)}`;

        if (gender === 'Perempuan') {
            query += "&top=longHair&clothes=blazerAndShirt&clothesColor=black,blue,gray";
        } else {
            query += "&top=shortHair&facialHairProbability=50";
        }

        // Add random param to prevent browser caching of preview
        query += `&_r=${Date.now()}`;

        previewEl.src = `${baseUrl}?${query}`;

        // Explicitly handle error in JS too for the dynamic update
        previewEl.onerror = () => {
            previewEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`;
        };
    },


    initIcons() {
        if (window.lucide) window.lucide.createIcons();
    },

    showLoading() {
        if (this.els.loading) this.els.loading.classList.remove('hidden');
    },

    hideLoading() {
        if (this.els.loading) this.els.loading.classList.add('hidden');
    },

    showLogin() {
        if (this.els.loginPage) this.els.loginPage.classList.remove('hidden');
        if (this.els.mainApp) this.els.mainApp.classList.add('hidden');
    },

    showMain() {
        if (this.els.loginPage) this.els.loginPage.classList.add('hidden');
        if (this.els.mainApp) this.els.mainApp.classList.remove('hidden');
        this.updateHeaderUserInfo();
        this.updateNotificationBadge();

        // Initial Data Load
        this.loadAllStaff();
        this.loadDepartments();
        this.loadTimeline();

        // Admin Buttons Visibility
        if (this.state.user.role === 'Admin') {
            this.els.btnUserMgmt.classList.remove('hidden');
            this.els.btnAddWork.classList.add('hidden'); // Hide Add Work for Admin
        } else {
            this.els.btnUserMgmt.classList.add('hidden');
            this.els.btnAddWork.classList.remove('hidden');
        }

        this.initDateFilterDismiss();
        this.checkAnnouncements();
        this.startAnnouncementRefresh();

        // Announcement Button Visibility
        const annBtn = document.getElementById('btn-create-announcement');
        if (annBtn) {
            if (this.state.user.role === 'Admin') {
                annBtn.classList.remove('hidden');
                annBtn.addEventListener('click', () => this.openAnnouncementCreator());
            } else {
                annBtn.classList.add('hidden');
            }
        }

        // Announcement History Button (visible to all)
        const annHistoryBtn = document.getElementById('btn-announcement-history');
        if (annHistoryBtn) {
            annHistoryBtn.addEventListener('click', () => this.openAnnouncementHistory());
        }

        // Initialize Notepad bindings
        this.initNotepadBindings();
    },

    initDatePicker() {
        if (!this.els.datePicker) return;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const formatted = `${yyyy}-${mm}-${dd}`;
        this.els.datePicker.value = formatted;
        this.state.selectedDate = formatted;
        this.updateDateLabel();
    },

    updateDateLabel() {
        if (!this.els.dateLabel || !this.state.selectedDate) return;
        const date = new Date(this.state.selectedDate);
        if (Number.isNaN(date.getTime())) {
            this.els.dateLabel.textContent = this.state.selectedDate;
            return;
        }
        this.els.dateLabel.textContent = date.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },

    updateHeaderUserInfo() {
        if (!this.state.user) return;
        const name = this.state.user.name || this.state.user.username;
        const role = this.state.user.role;
        this.els.headerUserInfo.textContent = `${name} • ${role}`;
    },

    openModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
        document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');

        // Check if any other modal is visible before hiding overlay
        const visibleModals = document.querySelectorAll('.modal:not(.hidden)');
        if (visibleModals.length === 0) {
            document.getElementById('modal-overlay').classList.add('hidden');
        }

        this.editingTaskId = null; // Reset edit mode just in case
    },

    // =========================================
    // AUTHENTICATION
    // =========================================

    async checkAuth() {
        try {
            // Add a timeout to prevent infinite loading if the server doesn't respond
            const authPromise = API.checkAuth();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Koneksi timeout (15s)')), 15000)
            );

            const result = await Promise.race([authPromise, timeoutPromise]);

            if (result && result.loggedIn) {
                this.state.user = result.user;
                if (result.csrf_token) API.setCSRFToken(result.csrf_token);
                this.showMain();
                if (window.NotificationManager) window.NotificationManager.init();

                // Auto-generate routines for today (using client local date to avoid timezone drift)
                const now = new Date();
                const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                API.generateRoutines(localDate).catch(err => console.error('Auto-routine gen failed', err));

                // populateDepartments removed (logic moved to loadDepartments calls in showMain)
            } else {
                this.showLogin();
            }
        } catch (error) {
            console.error('[App] Auth Check Error:', error);
            this.showLogin();
            this.showToast('Gagal cek login: ' + error.message, 'error');
        }
    },

    // populateDepartments removed/merged into loadDepartments

    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!username || !password) {
            this.showLoginError('Username dan password harus diisi');
            return;
        }

        try {
            this.showToast('Memproses login...', 'info');
            const result = await API.login(username, password);
            this.state.user = result.user;
            if (result.csrf_token) API.setCSRFToken(result.csrf_token);
            this.showMain();
            if (window.NotificationManager) window.NotificationManager.init();
            this.showToast('Login berhasil', 'success');
        } catch (error) {
            this.showLoginError(error.message || 'Login gagal');
        }
    },

    async handleLogout() {
        try {
            // Cleanup intervals to prevent memory leaks
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }

            // Stop notification manager intervals
            if (window.NotificationManager && window.NotificationManager.stop) {
                window.NotificationManager.stop();
            }

            await API.logout();
            window.location.reload();
        } catch (error) {
            console.error(error);
        }
    },

    showLoginError(msg) {
        if (this.els.loginError) {
            this.els.loginError.textContent = msg;
            this.els.loginError.classList.remove('hidden');
        }
    },

    // =========================================
    // PROFILE MANAGEMENT
    // =========================================

    openProfileModal() {
        const user = this.state.user;
        if (!user) return;

        document.getElementById('profile-name').value = user.name || '';
        document.getElementById('profile-username').value = user.username || '';
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-password-confirm').value = '';

        // Reset and set avatar preview
        const avatarPreview = document.getElementById('profile-avatar-preview');
        const avatarInput = document.getElementById('profile-avatar-input');
        if (avatarPreview) {
            avatarPreview.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
        }
        if (avatarInput) {
            avatarInput.value = ''; // Reset file input
        }

        this.openModal('modal-profile');
    },

    initProfileAvatarHandler() {
        const input = document.getElementById('profile-avatar-input');
        const preview = document.getElementById('profile-avatar-preview');

        if (input && preview) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                        this.showToast('Ukuran file maksimal 2MB', 'error');
                        input.value = '';
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        preview.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    },

    async handleProfileSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('profile-name').value.trim();
        const username = document.getElementById('profile-username').value.trim();
        const password = document.getElementById('profile-password').value;
        const confirmComp = document.getElementById('profile-password-confirm').value;
        const avatarInput = document.getElementById('profile-avatar-input');

        if (!name || !username) {
            this.showToast('Nama dan Username wajib diisi', 'error');
            return;
        }

        if (password && password !== confirmComp) {
            this.showToast('Konfirmasi password tidak cocok', 'error');
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(btn, true);

        try {
            // Use FormData to handle file upload
            const formData = new FormData();
            formData.append('id', this.state.user.id);
            formData.append('name', name);
            formData.append('username', username);
            formData.append('role', this.state.user.role);

            if (password) {
                formData.append('password', password);
            }

            if (avatarInput && avatarInput.files[0]) {
                formData.append('avatar', avatarInput.files[0]);
            }

            // We need to use a custom fetch call here because API.request might default to JSON
            // or we need to modify API.updateUser to handle FormData. 
            // Let's check API.updateUser first. secure approach is to manual fetch here or update API.js
            // To be safe and quick, I'll use API.updateUser but I'll ensure API.js can handle it or I'll use a direct call.
            // Actually, let's update API.updateUser/request to handle FormData automatically.
            // Since I can't see API.js right now, I'll assume standard fetch.
            // I will use a direct fetch here to be sure.

            const response = await fetch('api/users.php?action=update', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': API.csrfToken // Access token from API class
                },
                body: formData // Content-Type header is auto-set with boundary
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Gagal update profil');
            }

            // Update local state - reloading to get fresh avatar URL if changed is safest, 
            // but we can update UI optimistically or from response if server returns new URL.
            // For now, let's reload prompt or just update basic info. 
            // Ideally backend returns the new avatar URL.

            // Re-fetch user data to get new avatar URL
            const userRes = await API.getUser(this.state.user.id);
            if (userRes.user) {
                this.state.user = userRes.user;
            } else {
                this.state.user.name = name;
                this.state.user.username = username;
            }

            // Update UI
            this.updateHeaderUserInfo();
            document.getElementById('drawer-username').textContent = name || username;

            // Update avatar images in UI
            if (this.state.user.avatar) {
                // Update sidebar/drawer avatar if exists
                const drawerAvatar = document.getElementById('drawer-avatar');
                if (drawerAvatar) {
                    // Check if it's an image element or div background
                    // Based on drawer code: <div class="avatar-circle" id="drawer-avatar"></div>
                    // It seems it uses background or inner img. Let's check drawer code later.
                    // For now, let's just show success.
                }
            }

            this.showToast('Profil berhasil diperbarui', 'success');
            this.closeModal('modal-profile');

            // Reload page to reflect avatar changes everywhere reliably
            setTimeout(() => window.location.reload(), 1000);

        } catch (error) {
            console.error('Update profile error:', error);
            this.showToast(error.message || 'Gagal memperbarui profil', 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    },

    // =========================================
    // TIMELINE RENDERING
    // =========================================

    async loadAllStaff() {
        try {
            const res = await API.getUsers();
            if (res.users) {
                this.allStaffList = res.users;
            }
        } catch (e) {
            console.error('Failed to load staff list', e);
        }
    },

    async loadDepartments() {
        try {
            const result = await API.getDepartments();
            const depts = result.departments || [];
            this.state.departments = depts;

            // 1. Dept Filter (Timeline)
            const select = this.els.deptFilter;
            if (select) {
                const currentVal = select.value;
                select.innerHTML = '<option value="All">Semua Divisi</option>';
                depts.forEach(dept => {
                    select.innerHTML += `<option value="${this.escapeHtml(dept)}">${this.escapeHtml(dept)}</option>`;
                });
                select.value = currentVal; // Restore selection
            }

            // 2. User Form Role Select
            const roleEl = document.getElementById('user-role');
            if (roleEl) {
                // Preserve selection if possible, though usually it's empty on load
                const currentRole = roleEl.value;
                roleEl.innerHTML = '<option value="">Pilih Role...</option><option value="Admin">Admin</option>';
                depts.forEach(d => {
                    // Prevent XSS in values/text
                    const safeD = this.escapeHtml(d);
                    const opt = document.createElement('option');
                    opt.value = safeD; // or d, assuming it's safe from API but good practice
                    opt.textContent = safeD;
                    roleEl.appendChild(opt);
                });
                if (currentRole) roleEl.value = currentRole;
            }

        } catch (error) {
            console.error('Failed to load departments:', error);
            // Fallback UI - show only "All" option with error indication
            if (this.els.deptFilter) this.els.deptFilter.innerHTML = '<option value="All">Semua Divisi (gagal memuat)</option>';
            this.showToast('Gagal memuat daftar divisi', 'error');
        }
    },

    setViewMode(mode) {
        this.state.viewMode = mode;

        // Update Buttons UI
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === mode);
        });

        const timelineContainer = document.getElementById('timeline-container');
        const listContainer = document.getElementById('list-view-container');
        const historyContainer = document.getElementById('history-view-container');
        const dateWrapper = document.querySelector('.date-picker-wrapper');
        const dateLabel = document.querySelector('#selected-date-label').parentElement;

        // Hide all first
        if (timelineContainer) timelineContainer.classList.add('hidden');
        if (listContainer) listContainer.classList.add('hidden');
        if (historyContainer) historyContainer.classList.add('hidden');

        // Also hide notepad view when switching sub-views (Bug 1 fix)
        const notepadView = document.getElementById('notepad-view');
        if (notepadView) notepadView.classList.add('hidden');
        // Reset app-view-toggle back to timeline
        document.querySelectorAll('.app-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.appview === 'timeline');
        });

        if (mode === 'list') {
            // LIST VIEW MODE
            if (listContainer) listContainer.classList.remove('hidden');

            // Hide date picker in list mode as it uses its own filter
            if (dateWrapper) dateWrapper.style.display = 'none';
            if (dateLabel) dateLabel.style.display = 'none';

            this.loadListView();
            this.currentView = 'list'; // Track current view
        } else if (mode === 'history') {
            // HISTORY VIEW MODE
            if (historyContainer) historyContainer.classList.remove('hidden');

            // Hide date picker in history mode
            if (dateWrapper) dateWrapper.style.display = 'none';
            if (dateLabel) dateLabel.style.display = 'none';

            this.loadHistoryView();
            this.currentView = 'history';
        } else {
            // TIMELINE MODE (All / Me)
            if (timelineContainer) timelineContainer.classList.remove('hidden');

            // Show date picker
            if (dateWrapper) dateWrapper.style.display = 'block';
            if (dateLabel) dateLabel.style.display = 'block';

            this.loadTimeline();
            this.currentView = 'timeline';
        }
        this.updateMobileActionBtn();
    },

    // =========================================
    // LIST VIEW CONTROLLER
    // =========================================

    setListFilter(filterType, btnElement) {
        this.state.listFilter = filterType;

        // Update UI
        document.querySelectorAll('.filter-chip').forEach(btn => btn.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        this.loadListView();
    },

    // =========================================
    // DATE FILTER DROPDOWN LOGIC
    // =========================================

    toggleDateFilter() {
        const dropdown = document.getElementById('date-filter-dropdown');
        dropdown.classList.toggle('hidden');

        if (!dropdown.classList.contains('hidden')) {
            this.initDualCalendar();
        }
    },

    // Close dropdown when clicking outside
    initDateFilterDismiss() {
        document.addEventListener('click', (e) => {
            const wrapper = document.querySelector('.date-filter-wrapper');
            const dropdown = document.getElementById('date-filter-dropdown');
            if (wrapper && !wrapper.contains(e.target) && dropdown && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
            }
        });
    },

    // --- CALENDAR WIDGET LOGIC ---
    calendarState: {
        viewDate: new Date(), // The month shown in the first calendar
        startDate: null,
        endDate: null
    },

    initDualCalendar() {
        if (!this.calendarState.startDate) {
            this.calendarState.startDate = new Date();
            this.calendarState.endDate = new Date();
        }
        this.renderDualCalendar();
    },

    renderDualCalendar() {
        // Ensure viewDate is valid
        if (!this.calendarState.viewDate) this.calendarState.viewDate = new Date();

        const leftDate = new Date(this.calendarState.viewDate);
        leftDate.setDate(1); // Force 1st of month

        const rightDate = new Date(leftDate);
        rightDate.setMonth(rightDate.getMonth() + 1);

        this.renderMonth(leftDate, 'calendar-left');
        this.renderMonth(rightDate, 'calendar-right');
        this.highlightCalendarRange();
        this.updateCustomRangeDisplay();
    },

    renderMonth(date, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const monthName = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

        // Header
        let html = `<div class="calendar-month-header">${monthName}</div>`;

        // Grid Header
        html += `<div class="calendar-grid">`;
        ['M', 'S', 'S', 'R', 'K', 'J', 'S'].forEach(d => {
            html += `<div class="calendar-day-header">${d}</div>`;
        });

        const year = date.getFullYear();
        const month = date.getMonth();

        // Get day of 1st of month (0-6). 0=Sun.
        // We want Mon=0, Sun=6? 
        // Labels: M(Mon), S(Tue)...
        // Date.getDay(): 0=Sun, 1=Mon .. 6=Sat.
        // If we want Mon first: (day + 6) % 7.
        // Sun(0) -> 6. Mon(1) -> 0.

        const firstDayObj = new Date(year, month, 1);
        const startingBlank = (firstDayObj.getDay() + 6) % 7;

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < startingBlank; i++) {
            html += `<div class="calendar-day empty"></div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            html += `<div class="calendar-day" data-date="${dateStr}" onclick="App.handleCalendarDateClick('${dateStr}')">${d}</div>`;
        }

        html += `</div>`; // Close grid
        container.innerHTML = html;
    },

    handleCalendarDateClick(dateStr) {
        const clickedDate = new Date(dateStr);
        // Reset time component for accurate comparison
        clickedDate.setHours(0, 0, 0, 0);

        if (!this.calendarState.startDate || (this.calendarState.startDate && this.calendarState.endDate)) {
            // Start new selection
            this.calendarState.startDate = clickedDate;
            this.calendarState.endDate = null;
        } else {
            // Complete selection
            const start = this.calendarState.startDate;
            // Ensure start also has 0 time
            start.setHours(0, 0, 0, 0);

            if (clickedDate < start) {
                this.calendarState.endDate = start;
                this.calendarState.startDate = clickedDate;
            } else {
                this.calendarState.endDate = clickedDate;
            }
        }

        this.highlightCalendarRange();
        this.updateCustomRangeDisplay();
    },

    highlightCalendarRange() {
        document.querySelectorAll('.calendar-day').forEach(el => {
            el.className = 'calendar-day'; // Reset
            if (el.innerHTML === '') el.classList.add('empty');

            const cellDateStr = el.dataset.date;
            if (!cellDateStr) return;

            const cellDate = new Date(cellDateStr);
            cellDate.setHours(0, 0, 0, 0);

            const start = this.calendarState.startDate;
            if (start) start.setHours(0, 0, 0, 0);

            const end = this.calendarState.endDate;
            if (end) end.setHours(0, 0, 0, 0);

            if (start && cellDate.getTime() === start.getTime()) {
                el.classList.add('selected', 'range-start');
            }
            if (end && cellDate.getTime() === end.getTime()) {
                el.classList.add('selected', 'range-end');
            }
            if (start && end && cellDate > start && cellDate < end) {
                el.classList.add('in-range');
            }
        });
    },

    updateCustomRangeDisplay() {
        const fmt = (d) => {
            if (!d) return '-';
            return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        };
        const startEl = document.getElementById('display-start-date');
        const endEl = document.getElementById('display-end-date');
        if (startEl) startEl.textContent = fmt(this.calendarState.startDate);
        if (endEl) endEl.textContent = fmt(this.calendarState.endDate);
    },

    calendarPrevMonth() {
        this.calendarState.viewDate.setMonth(this.calendarState.viewDate.getMonth() - 1);
        this.renderDualCalendar();
    },

    calendarNextMonth() {
        this.calendarState.viewDate.setMonth(this.calendarState.viewDate.getMonth() + 1);
        this.renderDualCalendar();
    },

    applyCustomDateRange() {
        const currentFilter = this.state.timeFilter;

        if (currentFilter === 'custom') {
            if (!this.calendarState.startDate || !this.calendarState.endDate) return;

            // Save custom range to state
            this.state.customRange = {
                start: this.formatDate(this.calendarState.startDate),
                end: this.formatDate(this.calendarState.endDate)
            };

            // Update Label
            const fmtId = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
            document.getElementById('date-filter-label').textContent =
                `${fmtId(this.calendarState.startDate)} - ${fmtId(this.calendarState.endDate)}`;
        } else {
            // It's a preset
            const labelMap = {
                'today': 'Hari Ini',
                'yesterday': 'Kemarin',
                'last_7_days': '7 Hari Terakhir',
                'last_30_days': '30 Hari Terakhir',
                'month_current': 'Bulan Ini',
                'month_last': 'Bulan Lalu',
                'all_time': 'Semua Waktu'
            };
            const labelEl = document.getElementById('date-filter-label');
            if (labelEl) labelEl.textContent = labelMap[currentFilter] || 'Rentang Waktu';

            // Clear custom range if switching to preset
            this.state.customRange = null;
        }

        // Reset presets UI if custom (handled in applyDatePreset for presets)
        if (currentFilter === 'custom') {
            document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        }

        this.loadListView();
        this.toggleDateFilter(); // Close
    },

    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    applyDatePreset(preset) {
        this.state.timeFilter = preset;

        // Update UI Active State
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === preset);
        });

        // Clear custom state visual only (actual state remains until Apply is clicked logic handled in applyCustomDateRange)
        this.calendarState.startDate = null;
        this.calendarState.endDate = null;
        this.updateCustomRangeDisplay();
        this.highlightCalendarRange();

        // Don't auto-load or close. Wait for "Terapkan".
    },



    clearDateFilter() {
        // Reset state
        this.state.timeFilter = 'today';
        this.state.customRange = null;

        // Reset visual preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === 'today');
        });

        // Reset Dropdown Label
        const labelEl = document.getElementById('date-filter-label');
        if (labelEl) labelEl.textContent = 'Hari Ini';

        // Reset Calendar Selection
        this.calendarState.startDate = null;
        this.calendarState.endDate = null;
        this.updateCustomRangeDisplay();
        this.highlightCalendarRange();

        // Close dropdown & Reload
        const dropdown = document.getElementById('date-filter-dropdown');
        if (dropdown) dropdown.classList.add('hidden');

        this.loadListView();
    },

    getDateRangeFromFilter() {
        const today = new Date();
        const start = new Date(today);
        const end = new Date(today);

        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        if (this.state.timeFilter === 'custom') {
            if (this.state.customRange) {
                return this.state.customRange;
            }
            // Fallback if no range set yet
            return {
                start: formatDate(today),
                end: formatDate(today)
            };
        }

        switch (this.state.timeFilter) {
            case 'today':
                // start and end are already today
                break;
            case 'yesterday':
                start.setDate(today.getDate() - 1);
                end.setDate(today.getDate() - 1);
                break;
            case 'last_7_days':
                start.setDate(today.getDate() - 6);
                // end is today
                break;
            case 'last_30_days':
                start.setDate(today.getDate() - 29);
                // end is today
                break;
            case 'month_current':
                start.setDate(1);
                end.setMonth(today.getMonth() + 1);
                end.setDate(0); // Last day of month
                break;
            case 'month_last':
                start.setMonth(today.getMonth() - 1);
                start.setDate(1);
                end.setDate(0); // Last day of previous month
                break;
            case 'all_time':
                return { start: '2000-01-01', end: '2100-12-31' };
        }

        return { start: formatDate(start), end: formatDate(end) };
    },

    async loadListView() {
        const container = document.getElementById('list-view-content');
        if (!container) return;

        if (this.state.isLoadingListView) return;
        this.state.isLoadingListView = true;

        container.innerHTML = '<div class="flex-center p-4"><div class="spinner"></div></div>';

        try {
            const { start, end } = this.getDateRangeFromFilter();
            const staffId = this.state.listFilter === 'me' ? this.state.user.id : null;

            // Build params dynamically
            const params = {
                start_date: start,
                end_date: end,
                department: this.state.deptFilter
            };

            if (staffId) {
                params.staff_id = staffId;
            }

            console.log('loadListView Params:', params);
            // Re-use getTasks but with range
            const res = await API.getTasks(params);

            if (res.success) {
                this.renderListView(res.tasks || []);
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = '<div class="text-danger p-4">Gagal memuat daftar tugas</div>';
        } finally {
            this.state.isLoadingListView = false;
        }
    },

    renderListView(tasks) {
        const container = document.getElementById('list-view-content');
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i data-lucide="check-circle"></i></div>
                    <h3>Tidak ada tugas</h3>
                    <p>Tidak ada tugas ditemukan untuk filter ini.</p>
                </div>
            `;
            this.initIcons();
            return;
        }

        // Group by Date groups
        // Logic: Past, Today, Tomorrow, Later.. 
        // But since we pre-filter by time range, just group by Date Header
        const grouped = {};

        tasks.forEach(task => {
            const date = task.task_date; // YYYY-MM-DD
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(task);
        });

        let html = '';
        const sortedDates = Object.keys(grouped).sort();

        const today = new Date().toISOString().split('T')[0];

        sortedDates.forEach(dateStr => {
            const dateTasks = grouped[dateStr];

            // Format Date Header
            const dateObj = new Date(dateStr);
            const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
            let label = dateObj.toLocaleDateString('id-ID', options);

            if (dateStr === today) label = `Hari Ini — ${label}`;

            html += `
                <div class="list-group">
                    <h3>${label} <span class="count">${dateTasks.length}</span></h3>
                    <div class="list-items">
            `;

            dateTasks.forEach(task => {
                const isLate = task.task_date < today && task.status !== 'done';
                const statusClass = task.status; // todo, in-progress, done
                const formattedTime = task.start_time.substring(0, 5) + ' - ' + task.end_time.substring(0, 5);

                // Show staff avatar if "All" filter
                // Show staff name if "All" filter (Concise Mode: No Avatar)
                let staffHtml = '';
                if (this.state.listFilter === 'all') {
                    const safeStaffName = this.escapeHtml(task.staff_name);
                    staffHtml = `<span style="font-size:0.75rem; color:var(--primary); font-weight:600; background:var(--primary-light); padding:2px 6px; border-radius:4px; margin-right:6px;">${safeStaffName}</span>`;
                }

                const safeTitle = this.escapeHtml(task.title);
                const safeCategory = this.escapeHtml(task.category);

                html += `
                    <div class="list-task-card ${isLate ? 'border-danger' : ''}" onclick="App.openTaskDetail(${task.id})">
                        <div class="list-task-time">
                            <span class="date" style="font-size:0.7rem; color:var(--slate-500); margin-bottom:2px;">Deadline</span>
                            <span class="time" style="color:var(--danger);">${task.end_time.substring(0, 5)}</span>
                        </div>
                        
                        <div class="list-task-info">
                            <div class="list-task-header">
                                ${staffHtml}
                                <div class="list-task-title">${safeTitle}</div>
                            </div>
                            <div class="list-task-meta">
                                <span><i data-lucide="tag"></i> ${safeCategory}</span>
                                <span class="list-task-status ${statusClass}">${statusClass.replace('-', ' ')}</span> 
                            </div>
                        </div>
                        
                        <div class="list-task-actions">
                             <i data-lucide="chevron-right" style="color:var(--slate-400)"></i>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.initIcons();
    },

    // =========================================
    // HISTORY VIEW (Completed + Past Due Tasks)
    // =========================================
    async loadHistoryView() {
        const container = document.getElementById('history-view-content');
        if (!container) return;

        container.innerHTML = '<div class="flex-center p-4"><div class="spinner"></div></div>';

        try {
            const params = {
                limit: 50
            };

            // Use current user for 'me' filter
            if (this.state.listFilter === 'me') {
                params.staff_id = this.state.user.id;
            }

            const res = await API.getWorkHistory(params);

            if (res.success) {
                this.renderHistoryView(res.history || []);
            } else {
                throw new Error(res.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            container.innerHTML = '<div class="text-danger p-4">Gagal memuat riwayat pekerjaan: ' + (error.message || 'Unknown error') + '</div>';
        }
    },

    renderHistoryView(history) {
        const container = document.getElementById('history-view-content');
        if (!container) return;

        if (!history || history.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="inbox"></i>
                    <h3>Tidak ada riwayat</h3>
                    <p>Belum ada tugas yang selesai atau melewati deadline</p>
                </div>
            `;
            this.initIcons();
            return;
        }

        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        };

        // Group by date
        const grouped = {};
        history.forEach(task => {
            const date = task.task_date;
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(task);
        });

        let html = '';

        Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
            const tasks = grouped[date];
            const total = tasks.length;
            const completed = tasks.filter(t => t.is_completed).length;

            html += `
                <div class="history-date-group">
                    <div class="history-date-header" style="display:flex; align-items:center; gap:12px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <i data-lucide="calendar"></i>
                            ${formatDate(date)}
                        </div>
                        <div class="history-stats" style="font-size:0.8rem; font-weight:600; color:var(--slate-500);">
                            (${completed}/${total} selesai)
                        </div>
                    </div>
                    <div class="history-tasks">
            `;

            tasks.forEach(task => {
                const safeTitle = this.escapeHtml(task.title);
                const safeStaffName = this.escapeHtml(task.staff_name);
                const checklistProgress = task.total_checklist > 0
                    ? `${task.done_checklist}/${task.total_checklist}`
                    : '-';

                const statusClass = task.is_completed ? 'completed' : 'past-due';
                const statusLabel = task.is_completed ? 'Selesai' : 'Tidak Selesai';
                const statusIcon = task.is_completed ? 'check-circle' : 'x-circle';

                html += `
                    <div class="history-task-card ${statusClass}" onclick="App.openTaskDetail(${task.id})">
                        <div class="history-task-status">
                            <i data-lucide="${statusIcon}"></i>
                        </div>
                        <div class="history-task-info">
                            <div class="history-task-title">${safeTitle}</div>
                            <div class="history-task-meta">
                                <span class="history-task-time">
                                    <i data-lucide="clock"></i>
                                    ${task.start_time.substring(0, 5)} - ${task.end_time.substring(0, 5)}
                                </span>
                                <span class="history-task-staff">
                                    <i data-lucide="user"></i>
                                    ${safeStaffName}
                                </span>
                                <span class="history-task-checklist">
                                    <i data-lucide="check-square"></i>
                                    ${checklistProgress}
                                </span>
                            </div>
                        </div>
                        <div class="history-task-badge ${statusClass}">
                            ${statusLabel}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.initIcons();
    },

    async loadTimeline() {
        if (this.state.isLoadingTimeline) return;
        this.state.isLoadingTimeline = true;

        this.showLoading();
        try {
            const params = {
                date: this.state.selectedDate,
                department: this.state.deptFilter
            };

            if (this.state.viewMode === 'me') {
                params.staff_id = this.state.user.id;
            }

            const result = await API.getTasks(params);

            // If we are in legacy single-view mode, handle it
            if (!result.timeline && result.tasks) {
                // Not expected here as loadTimeline is for Timeline View
            }

            let staffList = [];
            if (result.timeline) {
                staffList = result.timeline;
            } else if (result.tasks) {
                // Fallback for flat tasks if needed (though API is updated)
                const staffMap = new Map();
                result.tasks.forEach(task => {
                    if (!staffMap.has(task.staff_id)) {
                        staffMap.set(task.staff_id, {
                            id: task.staff_id,
                            name: task.staff_name,
                            role: task.staff_role,
                            avatar: task.staff_avatar,
                            tasks: []
                        });
                    }
                    staffMap.get(task.staff_id).tasks.push(task);
                });
                staffList = Array.from(staffMap.values());
            }

            this.state.tasks = staffList.flatMap(u => u.tasks || []);
            this.renderTimeline(staffList);

        } catch (error) {
            console.error('[App] loadTimeline Error:', error);
            this.showToast('Gagal memuat timeline: ' + error.message, 'error');
        } finally {
            this.hideLoading();
            this.state.isLoadingTimeline = false;
        }
    },

    renderTimeline(staffList) {
        this.renderCalendarView(staffList);
    },

    renderCalendarView(staffList) {
        const container = this.els.timelineContainer;

        // Handle Empty State
        if (!staffList || staffList.length === 0) {
            container.innerHTML = `
                <div class="empty-state-timeline">
                    <i data-lucide="calendar-x"></i>
                    <p>Tidak ada staff yang ditemukan.</p>
                </div>
            `;
            this.initIcons();
            return;
        }

        // Configuration
        const startHour = 1;
        const endHour = 24; // Shows up to 24:00 block

        // 1. Generate Header (Staff Columns)
        let html = `
            <div class="calendar-wrapper">
                <div class="calendar-header">
                    <div class="calendar-corner"></div>
                    <div class="calendar-header-staff-row">
        `;

        staffList.forEach(user => {
            // Calculate Performance Stats
            const userTasks = user.tasks || [];
            const total = userTasks.length;
            const completed = userTasks.filter(t => t.status === 'done').length;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            const percentColor = percent === 100 ? 'var(--success)' : 'var(--danger)';

            // Sanitize user data to prevent XSS
            const safeAvatar = this.sanitizeUrl(user.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}&background=random`;
            const safeName = this.escapeHtml(user.name);
            const safeRole = this.escapeHtml(user.role);

            html += `
                <div class="calendar-staff-header">
                     <div class="avatar-wrapper">
                        <img src="${safeAvatar}" class="avatar" onerror="this.src='https://ui-avatars.com/api/?name=User'">
                        ${user.id == this.state.user.id ? '<div class="me-badge" style="position:absolute; bottom:0; right:0; font-size:10px;">★</div>' : ''}
                     </div>
                     <div class="name">${safeName}</div>
                     <div class="role">${safeRole}</div>
                     
                     <!-- Performance Bar -->
                     <div class="calendar-perf-container">
                        <div class="calendar-perf-stats">
                             <span style="color:${percentColor}; font-weight:bold;">${percent}%</span>
                             <span>${completed}/${total}</span>
                        </div>
                        <div class="calendar-perf-bar-bg">
                            <div class="calendar-perf-bar-fill" style="width:${percent}%; background:${percentColor}"></div>
                        </div>
                     </div>
                </div>
            `;
        });
        html += `</div></div>`; // End Header

        // 2. Generate Body (Time + Grid)
        // Explicitly calculate height to ensure no cutoff
        const totalHeight = (endHour - startHour + 1) * 80;

        html += `<div class="calendar-body-scroll"><div class="calendar-time-labels" style="min-height:${totalHeight}px">`;

        // Time Labels
        for (let h = startHour; h <= endHour; h++) {
            const timeStr = h.toString().padStart(2, '0') + ':00';
            html += `<div class="time-slot-label"><span>${timeStr}</span></div>`;
        }
        html += `</div>`; // End Time Labels

        // Grid Area with explicit height
        html += `<div class="calendar-grid-area" style="min-height:${totalHeight}px">`;

        staffList.forEach(user => {
            html += `<div class="calendar-staff-column">`;

            // Render Tasks
            const tasks = user.tasks || [];
            const positionedTasks = this.calculateTaskPositions(tasks, startHour);

            positionedTasks.forEach(pt => {
                const task = pt.task;
                const zIndexStyle = pt.zIndex ? `z-index:${pt.zIndex};` : '';
                const style = `top:${pt.top}px; height:${pt.height}px; left:${pt.left}%; width:${pt.width}%; ${zIndexStyle}`;
                const catClass = 'cat-' + (task.category || 'Jobdesk').replace(/\s+/g, '-');
                const statusClass = task.status === 'done' ? 'status-done' : '';

                // Checklist Logic
                const checklist = task.checklist || [];
                const checkTotal = checklist.length;
                const checkDone = checklist.filter(c => c.is_done == 1).length;
                const showChecklist = checkTotal > 0;

                // Status Logic
                const statusLabels = { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Selesai' };
                const label = statusLabels[task.status] || task.status;
                let icon = 'circle';
                if (task.status === 'in-progress') icon = 'loader';
                if (task.status === 'done') icon = 'check-circle-2';

                // Sanitize task title to prevent XSS
                const safeTitle = this.escapeHtml(task.title);

                html += `
                    <div class="calendar-task-card ${catClass} ${statusClass}" style="${style}" 
                         onclick="App.openTaskDetail(${task.id})" title="${safeTitle} - ${label}">
                        <div class="task-title">${safeTitle}</div>
                        
                        <div class="task-meta">
                            <span><i data-lucide="clock" style="width:10px;height:10px;display:inline;"></i> ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}</span>
                            ${showChecklist ? `
                                <span style="margin-left:4px;">
                                    <i data-lucide="check-square" style="width:10px;height:10px;display:inline;"></i> ${checkDone}/${checkTotal}
                                </span>
                            ` : ''}
                        </div>
                        
                        <div class="task-footer" style="margin-top:2px; font-size:0.65rem; display:flex; align-items:center; gap:4px; opacity:0.9;">
                             <i data-lucide="${icon}" style="width:10px;height:10px;"></i> ${label}
                        </div>
                    </div>
                `;
            });

            // Add "Add Button" for Admin or Self (Overlay on hover? Or just at top? 
            // In calendar view, creating tasks usually involves clicking empty slot. 
            // For now, let's keep it simple or user relies on the big + Button.)

            html += `</div>`; // End Staff Column
        });

        html += `</div></div></div>`; // End Grid Area, Body Scroll, Wrapper

        container.innerHTML = html;
        this.initIcons();

        // Horizontal scroll sync
        const headerRow = container.querySelector('.calendar-header-staff-row');
        const bodyScroll = container.querySelector('.calendar-body-scroll');

        if (headerRow && bodyScroll) {
            bodyScroll.addEventListener('scroll', () => {
                headerRow.scrollLeft = bodyScroll.scrollLeft;
            });

            // Auto-scroll to 08:00
            // Calculate offset: ( Target(8) - Start(1) ) * 80px
            const targetHour = 8;
            if (startHour < targetHour) {
                const scrollPX = (targetHour - startHour) * 80;
                // Validate if scrollPX is positive
                if (scrollPX > 0) {
                    // Small timeout to ensure DOM layout is ready
                    setTimeout(() => {
                        bodyScroll.scrollTop = scrollPX;
                    }, 0);
                }
            }
        }
    },

    calculateTaskPositions(tasks, startHour) {
        if (!tasks || !tasks.length) return [];

        const PX_PER_HOUR = 80; // Must match CSS background-size
        const MIN_HEIGHT = 26;  // Minimum height for visibility

        const mapped = tasks.map(t => {
            const start = this.parseTime(t.start_time);
            const end = this.parseTime(t.end_time);

            // Calculate minutes from startHour (e.g. 8:00)
            const globalStartMin = startHour * 60;
            let startMin = start.totalMin - globalStartMin;
            let endMin = end.totalMin - globalStartMin;

            // If task starts before view, clamp visual start (or let it be negative? negative hides it)
            // Let's optimize: if completely before, ignore?

            const top = (startMin / 60) * PX_PER_HOUR;
            const durationMin = endMin - startMin;
            const height = Math.max(MIN_HEIGHT, (durationMin / 60) * PX_PER_HOUR);

            return {
                task: t,
                visualStart: startMin,
                visualEnd: endMin,
                top: top,
                height: height,
                id: t.id
            };
        });

        // Sort by start time
        mapped.sort((a, b) => a.visualStart - b.visualStart);

        // Cluster Overlaps
        const clusters = [];
        if (mapped.length > 0) {
            let currentCluster = [mapped[0]];
            let clusterEnd = mapped[0].visualEnd;

            for (let i = 1; i < mapped.length; i++) {
                const item = mapped[i];
                if (item.visualStart < clusterEnd) {
                    // Overlaps with the current cluster range
                    currentCluster.push(item);
                    if (item.visualEnd > clusterEnd) clusterEnd = item.visualEnd;
                } else {
                    // New cluster
                    clusters.push(currentCluster);
                    currentCluster = [item];
                    clusterEnd = item.visualEnd;
                }
            }
            clusters.push(currentCluster);
        }

        // Assign columns within each cluster
        clusters.forEach(cluster => {
            // 1. Pack items into columns (finding the first column where it fits)
            const columns = [];
            cluster.forEach(item => {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const column = columns[i];
                    const lastItem = column[column.length - 1];
                    if (item.visualStart >= lastItem.visualEnd) {
                        column.push(item);
                        item.colIndex = i;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    columns.push([item]);
                    item.colIndex = columns.length - 1;
                }
            });

            // 2. Stack items (Cascading View)
            cluster.forEach(item => {
                // Check if this item is part of a group with IDENTICAL start/end times
                // Tolerance: 2 minutes
                const siblings = cluster.filter(other =>
                    Math.abs(other.visualStart - item.visualStart) < 2 &&
                    Math.abs(other.visualEnd - item.visualEnd) < 2
                );

                if (siblings.length > 1) {
                    // Force Side-by-Side for identical group
                    // Sort by ID for stable positioning
                    const group = siblings.sort((a, b) => a.id - b.id);
                    const indexInGroup = group.indexOf(item);
                    const count = group.length;

                    // Use full width, split equally
                    item.width = 100 / count;
                    item.left = indexInGroup * item.width;

                    // Z-index: slight increment to avoid flickering, but mostly equal
                    item.zIndex = 30 + indexInGroup;
                } else {
                    // Standard Cascading for partial overlaps
                    const indentPercent = 12; // Indent 12% per
                    const maxIndent = 60; // Max indentation to keep it visible

                    const indent = Math.min(item.colIndex * indentPercent, maxIndent);

                    item.left = indent;
                    item.width = (100 - indent);
                    item.zIndex = 20 + item.colIndex; // Ensure later columns sit on top
                }
            });
        });

        return mapped;
    },

    parseTime(timeStr) {
        if (!timeStr) return { h: 0, m: 0, totalMin: 0 };
        // timeStr format "HH:mm:ss" or "HH:mm"
        const parts = timeStr.split(':');
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        return { h, m, totalMin: h * 60 + m };
    },

    renderTaskCard(task) {
        const styleClass = this.getCategoryClass(task.category);
        const checklist = task.checklist || [];
        const doneCount = checklist.filter(c => c.is_done == 1).length;
        const totalCount = checklist.length;
        const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
        const doneClass = task.status === 'done' ? 'done' : '';

        let statusIcon = 'circle';
        if (task.status === 'done') statusIcon = 'check-circle-2';
        else if (task.status === 'in-progress') statusIcon = 'play-circle';

        return `
            <div onclick="App.openTaskDetail(${task.id})" class="task-card ${styleClass} ${doneClass}">
                <div class="task-header">
                     <span class="category-badge ${styleClass}">
                        <i data-lucide="${this.getCategoryIcon(task.category)}"></i> ${task.category}
                     </span>
                     <div class="status-badge ${task.status}">
                           <i data-lucide="${statusIcon}"></i>
                           ${task.status.replace('-', ' ')}
                     </div>
                </div>

                <div class="task-title">
                    ${task.title}
                </div>

                <div class="task-time">
                    <i data-lucide="clock"></i> ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}
                </div>

                <div class="task-progress">
                    <div class="task-progress-bar">
                        <div class="fill" style="width:${progress}%"></div>
                    </div>
                    <div class="task-progress-info">
                        <span>${doneCount}/${totalCount} Check</span>
                        ${(task.comment_count > 0) ? '<span style="display:flex;align-items:center;gap:2px"><i data-lucide="message-square" style="width:8px;height:8px"></i> Info</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    },

    getCategoryStyle(category) {
        // Deprecated, keeping for safety if called elsewhere, but we rely on classes now
        return '';
    },

    getCategoryColor(category) {
        // Deprecated mainly
        return this.getCategoryClass(category);
    },

    // =========================================
    // TASK DETAIL
    // =========================================

    async openTaskDetail(taskId) {
        // Show skeleton immediately for better UX
        this.showDetailSkeleton();
        this.openModal('modal-task-detail');

        try {
            const result = await API.getTask(taskId);
            if (!result.success) throw new Error(result.message);

            const task = result.task;
            this.renderTaskDetail(task);
            // Modal already opened above, just init icons
            this.initIcons();
        } catch (error) {
            this.showToast('Error loading task: ' + error.message, 'error');
            this.closeModal('modal-task-detail');
        }
    },

    renderTaskDetail(task) {
        const container = document.getElementById('task-detail-content');

        const checklist = task.checklist || [];
        const doneCount = checklist.filter(c => c.is_done).length;
        const totalCount = checklist.length;
        const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        const categoryClass = this.getCategoryClass(task.category);

        // Sanitize user-provided data
        const safeTitle = this.escapeHtml(task.title);
        const safeCategory = this.escapeHtml(task.category);
        const safeStaffName = this.escapeHtml(task.staff_name);

        let html = `
            <div class="task-detail-header">
                <div class="task-detail-badges">
                    <div class="category-badge ${categoryClass}">
                        ${safeCategory}
                    </div>
                    <select onchange="App.updateTaskStatus(${task.id}, this.value)" class="status-badge ${task.status}" style="border:none; cursor:pointer; outline:none; appearance:none; padding-right:1em;">
                        <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>TODO</option>
                        <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>ON PROGRESS</option>
                        <option value="done" ${task.status === 'done' ? 'selected' : ''}>DONE</option>
                    </select>
                </div>
                <h2 class="task-detail-title">${safeTitle}</h2>
                <div class="task-detail-meta">
                    <span class="staff"><i data-lucide="user"></i> ${safeStaffName}</span>
                    <span><i data-lucide="clock"></i> ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}</span>
                </div>
            </div>

            <div class="checklist-section">
                <div class="checklist-header">
                    <h4>Checklist (${progress}% Selesai)</h4>
                </div>
                <div class="checklist-items">
        `;

        // Check if task can be interacted with (task_date >= today, i.e. today or future)
        // Use consistent date format: YYYY-MM-DD without locale dependency
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const taskDate = task.task_date || task.date;
        // Compare as strings (YYYY-MM-DD format is lexicographically sortable)
        const canInteractByDate = taskDate >= todayStr;

        checklist.forEach(item => {
            const canInteract = task.can_edit && canInteractByDate;
            const disabledClass = canInteract ? '' : 'disabled';
            const clickAction = canInteract ? `onclick="App.toggleChecklist(${item.id}, ${task.id})"` : `onclick="App.showToast('Tidak bisa checklist tugas yang sudah lewat', 'error')"`;

            let timeLog = '';
            if (item.is_done && item.completed_at) {
                const dateObj = new Date(item.completed_at);
                // Format: 05 Feb 15:30
                const dateStr = dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                const timeStr = dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                timeLog = `<span class="checklist-time-log">${dateStr} ${timeStr}</span>`;
            }

            // Sanitize checklist item text
            const safeItemText = this.escapeHtml(item.text);

            html += `
                <div class="checklist-item ${item.is_done ? 'checked' : ''} ${disabledClass}" 
                     ${clickAction} 
                     style="${!canInteract ? 'opacity:0.6; cursor:not-allowed;' : ''}">
                    <div class="checkbox">
                        ${item.is_done ? '<i data-lucide="check"></i>' : ''}
                    </div>
                    <span class="text" style="flex:1;">${safeItemText}</span>
                    ${timeLog}
                </div>
            `;
        });

        html += '</div></div>';

        // Attachments
        if ((task.attachments && task.attachments.length > 0) || task.can_edit) {
            html += '<div class="attachments-section"><h4>Lampiran</h4><div class="attachments-list">';

            if (task.attachments) {
                task.attachments.forEach(att => {
                    const icon = att.type === 'link' ? 'link' : 'file';
                    const target = att.type === 'link' ? '_blank' : '_self';
                    const delBtn = task.can_edit ? `<button onclick="event.preventDefault(); App.deleteAttachment(${att.id}, ${task.id})" class="btn-icon-danger" title="Hapus Lampiran" style="padding:4px; margin-left:8px;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>` : '';

                    // Sanitize attachment data
                    const safeAttName = this.escapeHtml(att.name);
                    const safeAttUrl = this.sanitizeUrl(att.url);

                    html += `
                        <div class="attachment-item-wrapper" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <a href="${safeAttUrl}" target="${target}" class="attachment-item" rel="noopener noreferrer">
                                <i data-lucide="${icon}"></i> <span>${safeAttName}</span>
                            </a>
                            ${delBtn}
                        </div>
                    `;
                });
            }

            if (task.can_edit) {
                html += `
                    <button class="btn btn-sm btn-outline" style="margin-top:8px;" onclick="App.promptAddAttachment(${task.id})">
                        <i data-lucide="plus"></i> Tambah Lampiran
                    </button>
                `;
            }

            html += '</div></div>';
        }

        // Comments
        if (task.comments && task.comments.length > 0) {
            html += '<div class="comments-section"><h4>Komentar</h4><div class="comments-list">';
            task.comments.forEach(c => {
                // Sanitize comment data
                const safeUserName = this.escapeHtml(c.user_name);
                const safeCommentText = this.escapeHtml(c.text);
                html += `<div class="comment-item"><strong>${safeUserName}</strong>: ${safeCommentText}</div>`;
            });
            html += '</div></div>';
        }

        // Add comment form
        html += `
            <div class="comment-input" style="margin-top:10px; display:flex; gap:10px;">
                <input type="text" id="comment-text" placeholder="Tulis komentar..." style="flex:1;">
                <button class="btn btn-sm btn-primary" onclick="App.addComment(${task.id})"><i data-lucide="send"></i></button>
            </div>
        `;

        // ACTIONS
        if (task.can_edit) {
            html += `
                <div class="task-detail-actions" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px;">
                     <button class="btn btn-outline" onclick="App.openEditTask(${task.id})">
                        <i data-lucide="edit-3"></i> Edit
                    </button>
                    <button class="btn btn-danger" onclick="App.deleteTask(${task.id})">
                        <i data-lucide="trash-2"></i> Hapus
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
        this.currentTask = task; // Store for delete action
    },

    async updateTaskStatus(taskId, status) {
        try {
            await API.updateTaskStatus(taskId, status);
            this.showToast(`Status diubah ke ${status}`, 'success');
            // Refresh detail to update color
            const result = await API.getTask(taskId);
            if (result.success) this.renderTaskDetail(result.task);
            this.loadTimeline(); // Update bar metrics
        } catch (e) {
            this.showToast(e.message, 'error');
        }
    },

    async promptAddAttachment(taskId) {
        document.getElementById('att-task-id').value = taskId;
        document.getElementById('att-name').value = '';
        document.getElementById('att-url').value = '';
        this.openModal('modal-attachment');
    },

    async submitAttachment() {
        const taskId = document.getElementById('att-task-id').value;
        const name = document.getElementById('att-name').value;
        const url = document.getElementById('att-url').value;
        const submitBtn = document.querySelector('#modal-attachment .btn-primary');

        if (!name || !url) {
            this.showToast('Nama dan URL wajib diisi', 'warning');
            return;
        }

        // Show loading state
        this.setButtonLoading(submitBtn, true);

        try {
            const res = await API.addAttachment(taskId, name, url);
            if (res.success) {
                // Check if status changed to done
                if (res.new_status === 'done') {
                    this.showToast('Lampiran ditambahkan & Tugas selesai! ✓', 'success');
                } else {
                    this.showToast('Lampiran ditambahkan', 'success');
                }

                this.closeModal('modal-attachment');

                // Refresh both detail and timeline
                await this.openTaskDetail(taskId);
                await this.loadTimeline(); // <-- This was missing!
            }
        } catch (e) {
            this.showToast(e.message, 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    },

    deleteAttachment(attId, taskId) {
        this.showConfirm('Hapus lampiran ini?', async () => {
            try {
                const res = await API.deleteAttachment(attId);
                if (res.success) {
                    // Show appropriate toast based on status change
                    if (res.new_status) {
                        this.showToast('Lampiran dihapus. Status tugas berubah karena lampiran wajib belum terpenuhi.', 'warning');
                    } else {
                        this.showToast('Lampiran dihapus', 'success');
                    }
                    // Refresh detail and timeline
                    await this.openTaskDetail(taskId);
                    await this.loadTimeline();
                }
            } catch (e) {
                this.showToast(e.message, 'error');
            }
        });
    },

    async toggleChecklist(itemId, taskId) {
        // Get the checklist item element for visual feedback
        const itemEl = document.querySelector(`.checklist-item[onclick*="toggleChecklist(${itemId}"]`);
        if (itemEl) {
            itemEl.style.opacity = '0.5';
            itemEl.style.pointerEvents = 'none';
        }

        try {
            const res = await API.toggleChecklist(itemId);

            // Show status change notification
            if (res.new_status === 'done') {
                this.showToast('Tugas selesai! ✓', 'success');
            } else if (res.new_status === 'in-progress') {
                this.showToast('Checklist diupdate', 'success');
            }

            // Refresh both detail and timeline (sequential to prevent race condition)
            await this.openTaskDetail(taskId);
            await this.loadTimeline();
        } catch (error) {
            this.showToast(error.message, 'error');
            if (itemEl) {
                itemEl.style.opacity = '1';
                itemEl.style.pointerEvents = 'auto';
            }
        }
    },

    async addComment(taskId) {
        const input = document.getElementById('comment-text');
        const submitBtn = input.nextElementSibling;

        if (!input.value.trim()) return;

        this.setButtonLoading(submitBtn, true);

        try {
            await API.addComment(taskId, input.value.trim());
            input.value = ''; // Clear input
            this.showToast('Komentar ditambahkan', 'success');
            await this.openTaskDetail(taskId);
        } catch (e) {
            this.showToast(e.message, 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    },

    // =========================================
    // ADD / EDIT WORK
    // =========================================

    openAddWorkForStaff(staffId, defaultStartTime = null) {
        this.targetStaffId = staffId;
        this.editingTaskId = null; // Reset edit mode

        // Reset UI Title & Button
        const titleEl = document.getElementById('modal-title-work');
        if (titleEl) titleEl.textContent = 'Tambah Pekerjaan';

        const submitBtn = document.getElementById('btn-submit-work');
        submitBtn.innerHTML = 'Simpan';
        submitBtn.className = 'btn btn-primary btn-block';

        this.openModal('modal-add-work');
        this.initAddWorkForm();

        // Set default start time if provided
        if (defaultStartTime) {
            const timeStr = defaultStartTime.length > 5 ? defaultStartTime.substring(0, 5) : defaultStartTime;
            document.getElementById('work-start').value = timeStr;
            // +1 hour logic
            const [hours, mins] = timeStr.split(':').map(Number);
            const endDate = new Date();
            endDate.setHours(hours + 1);
            endDate.setMinutes(mins);
            const endHours = String(endDate.getHours()).padStart(2, '0');
            const endMins = String(endDate.getMinutes()).padStart(2, '0');
            document.getElementById('work-end').value = `${endHours}:${endMins}`;
        }
    },

    decodeHTML(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    },

    async openEditTask(taskId) {
        try {
            this.closeModal('modal-task-detail');

            const result = await API.getTask(taskId);
            if (!result.success) throw new Error(result.message);
            const task = result.task;

            this.editingTaskId = taskId; // SET EDIT MODE

            const titleEl = document.getElementById('modal-title-work');
            if (titleEl) titleEl.textContent = 'Edit Pekerjaan';

            const submitBtn = document.getElementById('btn-submit-work');
            submitBtn.innerHTML = 'Update Jobdesk';
            submitBtn.className = 'btn btn-success btn-block';

            // Populate form
            document.getElementById('work-category').value = task.category;
            // Update UI for category
            const catSelect = document.getElementById('work-category');
            if (catSelect.onchange) catSelect.onchange({ target: catSelect });

            document.getElementById('work-title').value = this.decodeHTML(task.title);
            document.getElementById('work-start').value = task.start_time.substring(0, 5);
            document.getElementById('work-end').value = task.end_time.substring(0, 5);

            // Checklist
            const checklistText = (task.checklist || []).map(i => this.decodeHTML(i.text)).join('\n');
            document.getElementById('work-checklist').value = checklistText;

            // Routine
            document.getElementById('work-is-routine').checked = task.is_routine == 1;
            this.handleRoutineChange({ target: document.getElementById('work-is-routine') });

            // Days
            document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
            let days = [];
            try { days = typeof task.routine_days === 'string' ? JSON.parse(task.routine_days) : task.routine_days; } catch (e) { }
            if (Array.isArray(days)) {
                days.forEach(d => {
                    const btn = document.querySelector(`.day-btn[data-day="${d}"]`);
                    if (btn) btn.classList.add('active');
                });
            }

            // Attachment Required
            const attReq = document.getElementById('work-attachment-required');
            if (attReq) attReq.checked = task.attachment_required == 1;

            this.openModal('modal-add-work');
            this.initIcons();

        } catch (error) {
            this.showToast('Gagal edit: ' + error.message, 'error');
        }
    },

    initAddWorkForm() {
        // Complete state reset to prevent state pollution
        this.targetStaffId = this.state.user?.id || null;
        this.editingTaskId = null;

        document.getElementById('form-add-work').reset();
        document.getElementById('work-category').value = 'Jobdesk';
        // Reset Attachment Required Checkbox
        const attReq = document.getElementById('work-attachment-required');
        if (attReq) attReq.checked = false;

        const routineOpts = document.getElementById('routine-options');
        if (routineOpts) routineOpts.classList.remove('hidden');

        document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
        const rDays = document.getElementById('routine-days');
        if (rDays) rDays.classList.add('hidden');
        const tSel = document.getElementById('template-select');
        if (tSel) tSel.classList.add('hidden');

        const btn = document.getElementById('btn-submit-work');
        const catSelect = document.getElementById('work-category');

        if (catSelect) {
            catSelect.onchange = (e) => {
                const val = e.target.value;
                const isJobdesk = val === 'Jobdesk';
                const isTambahan = val === 'Tugas Tambahan';

                // Routine Options Visibility
                if (routineOpts) routineOpts.classList.toggle('hidden', !isJobdesk);
                if (!isJobdesk) {
                    if (rDays) rDays.classList.add('hidden');
                    if (tSel) tSel.classList.add('hidden');
                }

                // Deadline Visibility & Labels
                const deadlineGroup = document.getElementById('work-deadline-group');
                const endLabel = document.querySelector('label[for="work-end"]');

                if (deadlineGroup) deadlineGroup.classList.toggle('hidden', !isTambahan);

                if (endLabel) {
                    endLabel.textContent = isTambahan ? 'Jam Deadline' : 'Selesai Jam';
                }

                // Color logic
                if (!this.editingTaskId && btn) {
                    btn.className = 'btn btn-block';
                    btn.style.background = ''; // Clear any inline style from previous selection
                    if (val === 'Tugas Tambahan') btn.classList.add('btn-warning');
                    else if (val === 'Inisiatif') btn.classList.add('btn-success');
                    else btn.classList.add('btn-primary');

                    const span = btn.querySelector('span');
                    if (span) span.textContent = 'Simpan ' + val;
                }
            };
        }

        const routineCheck = document.getElementById('work-is-routine');
        if (routineCheck) routineCheck.onchange = (e) => this.handleRoutineChange(e);

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.onclick = () => btn.classList.toggle('active');
        });

        if (this.loadRoutineTemplates) this.loadRoutineTemplates();

        // Initialize mentions dropdown
        this.resetMentions('work-mentions-selected', 'workMentions');
        this.populateMentionsDropdown('work-mentions');
        this.handleMentionSelect('work-mentions', 'work-mentions-selected', 'workMentions');
        this.initIcons();
    },



    checkDeadlines() {
        if (!this.state.tasks) return;
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        this.state.tasks.forEach(task => {
            if ((task.task_date || task.date) === todayStr && task.status !== 'done') {
                const [h, m] = task.end_time.split(':').map(Number);
                const targetMins = h * 60 + m;
                const diff = targetMins - currentMins;

                if (diff === 15 || diff === 5) {
                    this.sendBrowserNotification("⚠️ Deadline Alert", `Task "${task.title}" berakhir dalam ${diff} menit!`);
                }
            }
        });
    },

    sendBrowserNotification(title, body) {
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body });
        }
    },


    handleRoutineChange(e) {
        document.getElementById('routine-days').classList.toggle('hidden', !e.target.checked);
    },

    async handleAddWork(e) {
        e.preventDefault();

        const category = document.getElementById('work-category').value;
        const title = document.getElementById('work-title').value;
        const startTime = document.getElementById('work-start').value;
        const endTime = document.getElementById('work-end').value;
        const checklist = document.getElementById('work-checklist').value.split('\n').filter(l => l.trim());
        const isRoutine = document.getElementById('work-is-routine').checked && category === 'Jobdesk';
        const attachmentRequired = document.getElementById('work-attachment-required').checked ? 1 : 0;

        const routineDays = [];
        document.querySelectorAll('.day-btn.active').forEach(b => routineDays.push(parseInt(b.dataset.day)));

        const data = {
            title, category, start_time: startTime, end_time: endTime, checklist,
            is_routine: isRoutine, routine_days: routineDays, attachment_required: attachmentRequired,
            mentions: this.state.workMentions // Add mentions
        };

        // Get submit button and show loading
        const submitBtn = document.getElementById('btn-submit-work');
        this.setButtonLoading(submitBtn, true);

        try {
            if (this.editingTaskId) {
                data.id = this.editingTaskId;
                await API.updateTask(data);
                this.showToast('Tugas berhasil diupdate ✓', 'success');
                this.editingTaskId = null;
            } else {
                data.staff_id = this.targetStaffId || this.state.user.id;

                // Use deadline date if provided for Tugas Tambahan
                const deadlineDateInput = document.getElementById('work-deadline-date');
                if (data.category === 'Tugas Tambahan' && deadlineDateInput && deadlineDateInput.value) {
                    data.task_date = deadlineDateInput.value;
                } else {
                    data.task_date = this.state.selectedDate;
                }

                await API.createTask(data);

                // Show different toast if mentions were added
                if (this.state.workMentions.length > 0) {
                    this.showToast(`Tugas dibuat ✓ (${this.state.workMentions.length} staff akan dinotifikasi)`, 'success');
                } else {
                    this.showToast('Tugas berhasil dibuat ✓', 'success');
                }
            }
            this.closeModal('modal-add-work');
            await this.loadTimeline(); // Use await for smooth UX
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    },

    async generateRoutines() {
        this.showConfirm({
            title: 'Generate Rutinitas',
            message: 'Sistem akan mengisi jadwal rutinitas untuk 30 hari ke depan (mulai dari tanggal yang dipilih). Lanjutkan?',
            type: 'primary',
            confirmText: 'Ya, Generate'
        }, async () => {
            const btn = document.getElementById('btn-generate-routine');
            // Add spinning animation class if you have one, or just disable
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Generating...';
                if (window.lucide) window.lucide.createIcons();
            }

            try {
                // Use the currently SELECTED date (from the date picker) as the start date
                // Fallback to TODAY (Local Time), not UTC
                let targetDate = this.state.selectedDate;
                if (!targetDate) {
                    const local = new Date();
                    const y = local.getFullYear();
                    const m = String(local.getMonth() + 1).padStart(2, '0');
                    const d = String(local.getDate()).padStart(2, '0');
                    targetDate = `${y}-${m}-${d}`;
                }

                const res = await API.generateRoutines(targetDate);

                if (res.success) {
                    this.showToast(res.message, 'success');
                    // Always reload timeline to show changes
                    await this.loadTimeline();
                } else {
                    // Update: Even if it says "Already exists", we should probably reload 
                    // just in case the view was stale.
                    this.showToast(res.message, 'warning'); // Use warning color
                    await this.loadTimeline();
                }
            } catch (e) {
                this.showToast('Gagal generate rutinitas: ' + e.message, 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="refresh-cw"></i> <span class="hidden-mobile">Generate Rutinitas</span>';
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        });
    },

    async deleteTask(taskId) {
        // Safe delete without title param
        const title = this.currentTask && this.currentTask.id === taskId ? this.currentTask.title : 'Tugas ini';
        this.showConfirm(`Hapus "${title}"?`, async () => {
            try {
                this.closeModal('modal-task-detail'); // Close first for better UX
                await API.deleteTask(taskId);
                await this.loadTimeline();
                this.showToast('Tugas berhasil dihapus', 'success');
            } catch (e) {
                this.showToast(e.message, 'error');
            }
        });
    },

    // =========================================
    // NOTIFICATIONS
    // =========================================

    async updateNotificationBadge() {
        if (!this.els.notifBadge) return;
        try {
            const result = await API.getUnreadCount();
            if (result.success && result.count > 0) {
                this.els.notifBadge.textContent = result.count;
                this.els.notifBadge.classList.remove('hidden');
            } else {
                this.els.notifBadge.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to update notification badge', error);
        }
    },

    async loadNotifications() {
        if (!this.els.notifList) return;
        this.els.notifList.innerHTML = '<div class="text-center p-4 text-slate-500">Loading...</div>';

        try {
            const result = await API.getNotifications();
            if (result.notifications && result.notifications.length > 0) {
                this.els.notifList.innerHTML = result.notifications.map(n => `
                    <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="App.markNotifRead(${n.id})">
                        <div class="notif-icon ${this.escapeHtml(n.type)}">
                            <i data-lucide="${this.getNotifIcon(n.type)}"></i>
                        </div>
                        <div class="notif-content">
                            <div class="notif-title">${this.escapeHtml(n.title)}</div>
                            <div class="notif-msg">${this.escapeHtml(n.message)}</div>
                            <div class="notif-time">${this.escapeHtml(n.created_at)}</div>
                        </div>
                    </div>
                `).join('');
                this.initIcons();
            } else {
                this.els.notifList.innerHTML = '<div class="text-center p-4 text-slate-500">Tidak ada notifikasi</div>';
            }
        } catch (error) {
            this.els.notifList.innerHTML = '<div class="text-center p-4 text-red-500">Gagal memuat notifikasi</div>';
        }
    },

    async markNotifRead(id) {
        try {
            await API.markRead(id);
            this.updateNotificationBadge();
            // Optional: visual update instead of full reload
            this.loadNotifications();
        } catch (e) {
            console.error(e);
        }
    },

    async clearNotifications() {
        if (!confirm('Hapus semua notifikasi?')) return;
        try {
            await API.clearNotifications();
            this.updateNotificationBadge();
            this.loadNotifications();
            this.showToast('Notifikasi dibersihkan', 'success');
        } catch (e) {
            this.showToast(e.message, 'error');
        }
    },

    getNotifIcon(type) {
        const map = {
            'info': 'info',
            'warning': 'alert-triangle',
            'success': 'check-circle',
            'error': 'x-circle',
            'deadline': 'clock',
            'transition': 'arrow-right-circle',
            'request': 'help-circle'
        };
        return map[type] || 'bell';
    },

    // =========================================
    // HELPERS
    // =========================================

    showToast(message, type = 'info', duration = null) {
        // Smart duration: errors stay longer so users can read them
        const TOAST_DURATIONS = {
            'success': 2500,
            'info': 3000,
            'warning': 4000,
            'error': 5000
        };
        const actualDuration = duration || TOAST_DURATIONS[type] || 3000;

        // Simply use native alert or create toast dynamically if preferred.
        // Re-implementing dynamic toast from previous code:
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);

        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, actualDuration);
    },

    showConfirm(messageOrOptions, onConfirm) {
        let message = messageOrOptions;
        let type = 'danger'; // danger, primary, success
        let confirmText = 'Ya, Hapus';
        let title = 'Konfirmasi';

        if (typeof messageOrOptions === 'object') {
            message = messageOrOptions.message;
            type = messageOrOptions.type || 'danger';
            confirmText = messageOrOptions.confirmText || (type === 'danger' ? 'Ya, Hapus' : 'Ya, Lanjutkan');
            title = messageOrOptions.title || 'Konfirmasi';
        }

        const modal = document.getElementById('modal-confirm');
        const msgEl = document.getElementById('confirm-msg');
        const titleEl = document.getElementById('confirm-title');
        const btnYes = document.getElementById('btn-confirm-yes');
        const btnCancel = document.getElementById('btn-confirm-cancel');
        const iconBg = document.getElementById('confirm-icon-bg');
        const iconEl = document.getElementById('confirm-icon');

        if (msgEl) msgEl.textContent = message;
        if (titleEl) titleEl.textContent = title;
        if (btnYes) btnYes.textContent = confirmText;

        // Styling based on type
        if (type === 'primary') {
            iconBg.style.backgroundColor = '#eef2ff'; // primary-bg
            iconBg.style.color = '#4f46e5'; // primary
            iconEl.setAttribute('data-lucide', 'help-circle');
            btnYes.className = 'btn btn-primary';
        } else if (type === 'success') {
            iconBg.style.backgroundColor = '#ecfdf5'; // success-bg
            iconBg.style.color = '#10b981'; // success
            iconEl.setAttribute('data-lucide', 'check-circle');
            btnYes.className = 'btn btn-success';
        } else {
            // Danger (Default)
            iconBg.style.backgroundColor = '#fee2e2'; // danger-bg
            iconBg.style.color = '#ef4444'; // danger
            iconEl.setAttribute('data-lucide', 'alert-triangle');
            btnYes.className = 'btn btn-danger';
        }

        // Remove old listeners to prevent stacking
        const newYes = btnYes.cloneNode(true);
        btnYes.parentNode.replaceChild(newYes, btnYes);

        const newCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newCancel, btnCancel);

        newYes.onclick = () => {
            onConfirm();
            modal.classList.add('hidden');
            document.getElementById('modal-overlay').classList.add('hidden');
        };

        newCancel.onclick = () => {
            modal.classList.add('hidden');
            document.getElementById('modal-overlay').classList.add('hidden');
        };

        modal.classList.remove('hidden');
        document.getElementById('modal-overlay').classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    },

    getCategoryClass(cat) {
        if (!cat) return '';
        return cat.replace(/\s+/g, '-');
    },

    getCategoryIcon(cat) {
        if (cat === 'Jobdesk') return 'briefcase';
        if (cat === 'Tugas Tambahan') return 'plus-square';
        if (cat === 'Inisiatif') return 'lightbulb';
        if (cat === 'Request') return 'send';
        return 'circle';
    },

    formatTime(timeStr) {
        if (!timeStr) return '';
        return timeStr.substring(0, 5);
    },

    // ... (Other admin methods omitted for brevity but key logic is restored)

    async loadRoutineTemplates() {
        if (this.state.user.role === 'Admin') return;

        try {
            const res = await API.getRoutineTemplates(this.state.user.role);
            const select = document.getElementById('routine-template');

            // Clear previous options
            select.innerHTML = '<option value="">Pilih Template...</option>';

            if (res.templates && res.templates.length > 0) {
                this.routineTemplates = res.templates;

                res.templates.forEach((t, i) => {
                    const opt = document.createElement('option');
                    opt.value = i; // Index in the array
                    opt.textContent = t.title;
                    select.appendChild(opt);
                });

                // Show the "Ambil dari Template" checkbox container
                const tSelect = document.getElementById('template-select');
                if (tSelect) tSelect.classList.remove('hidden');

                // Bind checkbox toggle logic
                const tCheck = document.getElementById('use-template');
                if (tCheck) {
                    tCheck.onchange = (e) => {
                        select.classList.toggle('hidden', !e.target.checked);
                        // Reset select if unchecked
                        if (!e.target.checked) select.value = "";
                    };
                }

                // Bind select change logic to fill form
                select.onchange = (e) => {
                    const idx = e.target.value;
                    if (idx === "") return; // "Pilih Template..." selected

                    const t = this.routineTemplates[idx];
                    if (t) {
                        document.getElementById('work-title').value = t.title;
                        const checklistVal = Array.isArray(t.checklist_template) ? t.checklist_template.join('\n') : '';
                        document.getElementById('work-checklist').value = checklistVal;
                    }
                };
            } else {
                // No templates found for this role
                // Hide the template section entirely
                const tSelect = document.getElementById('template-select');
                if (tSelect) tSelect.classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to load templates', e);
        }
    },

    async loadUsersTable() {
        try {
            const list = document.getElementById('users-table-container');
            list.innerHTML = '<div class="p-4 text-center text-slate-500">Loading users...</div>';

            const res = await API.getUsers();

            if (!res.users || res.users.length === 0) {
                list.innerHTML = '<div class="p-4 text-center text-slate-500">Belum ada user.</div>';
                return;
            }

            let html = `
                <table style="width:100%; border-collapse:separate; border-spacing:0 8px;">
                    <thead>
                        <tr style="color:var(--slate-500); font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">
                            <th style="padding:0 16px; text-align:left;">Staff</th>
                            <th style="padding:0 16px; text-align:left;">Role & Divisi</th>
                            <th style="padding:0 16px; text-align:left;">Status</th>
                            <th style="padding:0 16px; text-align:right;">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            res.users.forEach(u => {
                // Sanitize user data to prevent XSS
                const safeName = this.escapeHtml(u.name);
                const safeUsername = this.escapeHtml(u.username);
                const safeRole = this.escapeHtml(u.role);
                const safeAvatar = this.sanitizeUrl(u.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random`;
                const isActive = u.is_active == 1;

                html += `
                    <tr style="background:white; box-shadow:0 1px 3px rgba(0,0,0,0.05); border-radius:8px;">
                        <td style="padding:12px 16px; border-radius:8px 0 0 8px;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <img src="${safeAvatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid var(--slate-100);" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=random'">
                                <div>
                                    <div style="font-weight:600; color:var(--slate-800);">${safeName}</div>
                                    <div style="font-size:12px; color:var(--slate-500);">@${safeUsername}</div>
                                </div>
                            </div>
                        </td>
                        <td style="padding:12px 16px;">
                            <span class="category-badge ${this.getCategoryClass(u.role === 'Admin' ? 'Admin' : u.role)}" style="font-size:11px;">
                                ${safeRole}
                            </span>
                        </td>
                        <td style="padding:12px 16px;">
                            <button onclick="App.toggleUserStatus(${u.id})" class="btn-xs" style="
                                padding:4px 10px; border-radius:99px; font-size:11px; font-weight:600; 
                                border:none; cursor:pointer; 
                                background:${isActive ? '#dcfce7' : '#f1f5f9'}; 
                                color:${isActive ? '#15803d' : '#64748b'};
                            ">
                                ${isActive ? '● Aktif' : '○ Non-Aktif'}
                            </button>
                        </td>
                        <td style="padding:12px 16px; text-align:right; border-radius:0 8px 8px 0;">
                            <div style="display:flex; justify-content:flex-end; gap:8px;">
                                <button onclick="App.editUser(${u.id})" class="icon-btn-sm" title="Edit" style="color:var(--primary);">
                                    <i data-lucide="edit-2" style="width:16px;"></i>
                                </button>
                                ${u.role !== 'Admin' ? `
                                <button onclick="App.deleteUser(${u.id})" class="icon-btn-sm" title="Hapus" style="color:var(--rose-500);">
                                    <i data-lucide="trash-2" style="width:16px;"></i>
                                </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            list.innerHTML = html;
            this.initIcons();
        } catch (e) {
            console.error(e);
            this.showToast('Gagal memuat user', 'error');
        }
    },

    async toggleUserStatus(id) {
        try {
            await API.toggleUserStatus(id);
            this.loadUsersTable();
            this.showToast('Status user diubah', 'success');
        } catch (e) {
            this.showToast(e.message, 'error');
        }
    },

    async deleteUser(id) {
        this.showConfirm('Hapus user ini? Data tugas mereka juga akan terhapus.', async () => {
            try {
                await API.deleteUser(id);
                this.loadUsersTable();
                this.showToast('User dihapus', 'success');
            } catch (e) {
                this.showToast(e.message, 'error');
            }
        });
    },

    async editUser(id) {
        try {
            const res = await API.getUser(id);
            if (res.success) {
                const u = res.user;
                document.getElementById('user-id').value = u.id;

                const unameEl = document.getElementById('user-username');
                unameEl.value = u.username;
                unameEl.disabled = true;
                unameEl.title = "Username tidak dapat diubah";
                unameEl.classList.add('bg-slate-100');

                document.getElementById('user-name').value = u.name;
                document.getElementById('user-role').value = u.role;
                document.getElementById('user-gender').value = u.gender || 'Laki-laki'; // Default to Laki-laki
                document.getElementById('user-password').value = '';
                document.getElementById('password-hint').textContent = '(Isi hanya jika ingin ganti password)';

                // Update Preview with existing data
                this.updateAvatarPreview(u.avatar);

                document.getElementById('user-form-title').textContent = 'Edit User';
                document.getElementById('modal-user-form').classList.remove('hidden');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    openUserForm() {
        document.getElementById('form-user').reset();
        document.getElementById('user-id').value = '';
        document.getElementById('user-gender').value = 'Laki-laki'; // Reset to default

        // Reset Preview
        this.updateAvatarPreview();

        const unameEl = document.getElementById('user-username');
        unameEl.disabled = false;
        unameEl.title = "";
        unameEl.classList.remove('bg-slate-100');

        document.getElementById('password-hint').textContent = '(Wajib diisi untuk user baru)';
        document.getElementById('user-form-title').textContent = 'Tambah User';
        document.getElementById('modal-user-form').classList.remove('hidden');
    },

    async handleUserSubmit(e) {
        e.preventDefault();
        const id = document.getElementById('user-id').value;
        const username = document.getElementById('user-username').value;
        const name = document.getElementById('user-name').value;
        const role = document.getElementById('user-role').value;
        const gender = document.getElementById('user-gender').value;
        const password = document.getElementById('user-password').value;

        const data = { username, name, role, gender, password };
        if (id) data.id = id;

        try {
            if (id) {
                await API.updateUser(data);
                this.showToast('User berhasil diupdate', 'success');
            } else {
                await API.createUser(data);
                this.showToast('User berhasil dibuat', 'success');
            }
            this.closeModal('modal-user-form');
            await this.loadUsersTable();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    initRequestForm() {
        document.getElementById('form-request').reset();
        const reqAtt = document.getElementById('request-attachment-required');
        if (reqAtt) reqAtt.checked = false;

        document.getElementById('request-staff-timeline').innerHTML = '<p class="text-muted text-center" style="padding:20px;">Pilih staff untuk melihat jadwal</p>';

        // Initialize mentions for request
        this.resetMentions('request-mentions-selected', 'requestMentions');
        this.populateMentionsDropdown('request-mentions');
        this.handleMentionSelect('request-mentions', 'request-mentions-selected', 'requestMentions');

        // Set Default Date
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const defaultDate = this.state.selectedDate || today;
        document.getElementById('request-date').value = defaultDate;

        const dateEl = document.getElementById('req-schedule-date');
        if (dateEl) dateEl.textContent = defaultDate;

        // Show who is requesting
        const fromDeptEl = document.getElementById('request-from-dept');
        if (fromDeptEl && this.state.user) {
            fromDeptEl.textContent = this.state.user.role;
        }

        // Bind Date Change to reload schedule
        document.getElementById('request-date').onchange = (e) => {
            const staffId = document.getElementById('request-to').value;
            if (dateEl) dateEl.textContent = e.target.value;
            if (staffId) {
                this.loadStaffScheduleForRequest(staffId);
            }
        };

        // Populate staff select options
        const select = document.getElementById('request-to');
        if (select) {
            // Bind change event to load schedule
            select.onchange = (e) => this.loadStaffScheduleForRequest(e.target.value);

            // Use cached staff list
            const populate = () => {
                select.innerHTML = '<option value="">Pilih Staff...</option>';
                const list = this.allStaffList.length > 0 ? this.allStaffList : [];

                list.forEach(u => {
                    // Filter out self
                    if (u.id != this.state.user.id) {
                        const opt = document.createElement('option');
                        opt.value = u.id;
                        opt.textContent = `${u.name} (${u.role})`;
                        select.appendChild(opt);
                    }
                });
            };

            if (this.allStaffList.length === 0) {
                select.innerHTML = '<option value="">Memuat staff...</option>';
                this.loadAllStaff().then(populate);
            } else {
                populate();
            }
        }
    },

    async loadStaffScheduleForRequest(staffId) {
        const container = document.getElementById('request-staff-timeline');
        if (!staffId) {
            container.innerHTML = '<p class="text-muted text-center" style="padding:20px;">Pilih staff untuk melihat jadwal</p>';
            return;
        }

        container.innerHTML = '<div class="text-center p-4"><div class="loading-spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div></div>';

        try {
            // Use the date selected in the form, not the global state
            const formDate = document.getElementById('request-date').value;
            const date = formDate || this.state.selectedDate || new Date().toISOString().split('T')[0];
            const res = await API.getTasks({ staff_id: staffId, date: date });

            // Handle new API response structure (timeline vs tasks)
            let tasks = [];
            if (res.timeline && res.timeline.length > 0) {
                tasks = res.timeline[0].tasks || [];
            } else if (res.tasks) {
                tasks = res.tasks;
            }

            this.renderRequestSchedule(tasks);
        } catch (e) {
            container.innerHTML = `<p class="text-danger text-center">Gagal memuat jadwal: ${e.message}</p>`;
        }
    },

    renderRequestSchedule(tasks) {
        const container = document.getElementById('request-staff-timeline');
        if (!tasks || tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="calendar-check" style="width:24px;height:24px;margin-bottom:8px;color:var(--success);"></i>
                    <p style="font-size:0.8rem;">Jadwal Kosong. Aman untuk request!</p>
                </div>
             `;
            this.initIcons();
            return;
        }

        // Sort by time
        tasks.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

        let html = '';
        tasks.forEach(task => {
            const styleClass = this.getCategoryClass(task.category);

            // Calculate Progress
            const checklist = task.checklist || [];
            const doneCount = checklist.filter(c => c.is_done == 1).length;
            const totalCount = checklist.length;
            const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

            // Status Styling
            let statusColor = 'var(--slate-500)';
            let statusBg = 'var(--slate-100)';
            let statusIcon = 'circle';

            if (task.status === 'in-progress') {
                statusColor = 'var(--info)';
                statusBg = 'var(--info-bg)';
                statusIcon = 'loader';
            } else if (task.status === 'done') {
                statusColor = 'var(--success)';
                statusBg = 'var(--success-bg)';
                statusIcon = 'check-circle-2';
            }

            const isDone = task.status === 'done';

            html += `
                <div class="mini-task-item ${styleClass}" style="
                    margin-bottom:8px; 
                    border-left: 3px solid ${isDone ? 'var(--success)' : 'var(--slate-300)'};
                    opacity: ${isDone ? '0.7' : '1'};
                    background: ${isDone ? '#f8fafc' : 'white'};
                ">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                        <span class="category-badge ${styleClass}" style="font-size:0.6rem; padding:2px 6px;">
                           ${this.escapeHtml(task.category)}
                        </span>
                        <div style="
                            display:flex; align-items:center; gap:4px; 
                            font-size:0.65rem; font-weight:700; 
                            background:${statusBg}; color:${statusColor}; 
                            padding:2px 8px; border-radius:10px;
                        ">
                            <i data-lucide="${statusIcon}" style="width:10px; height:10px;"></i>
                            ${task.status.replace('-', ' ').toUpperCase()}
                        </div>
                    </div>

                    <div style="font-size:0.85rem; font-weight:600; color:var(--slate-800); margin-bottom:4px; line-height:1.3;">
                        ${this.escapeHtml(task.title)}
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--slate-100); padding-top:4px; margin-top:4px;">
                        <div style="font-size:0.7rem; font-family:monospace; color:var(--slate-500); display:flex; align-items:center; gap:4px;">
                            <i data-lucide="clock" style="width:10px; height:10px;"></i>
                            ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}
                        </div>
                        
                        ${totalCount > 0 ? `
                        <div style="font-size:0.7rem; color:${progress === 100 ? 'var(--success)' : 'var(--slate-500)'}; font-weight:600;">
                            ${doneCount}/${totalCount} (${progress}%)
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.initIcons();
    },

    async handleRequest(e) {
        e.preventDefault();
        const title = document.getElementById('request-title').value; // Corrected ID from req-title
        const desc = document.getElementById('request-notes').value; // Corrected ID from req-desc
        const targetId = document.getElementById('request-to').value; // Corrected ID from req-assign-to
        const deadline = document.getElementById('request-deadline').value; // Corrected ID from req-deadline
        const reqDate = document.getElementById('request-date').value;

        if (!targetId) {
            this.showToast('Pilih staff tujuan', 'warning');
            return;
        }

        const attachmentRequired = document.getElementById('request-attachment-required').checked ? 1 : 0;

        // Get submit button and show loading
        const submitBtn = document.querySelector('#modal-request .btn-rose');
        this.setButtonLoading(submitBtn, true);

        try {
            // Determine Start Time default (09:00 if future date, now if today)
            const today = new Date().toISOString().split('T')[0];
            const startTime = (reqDate === today) ? new Date().toTimeString().substring(0, 5) : '09:00';

            // Create task as request with mentions
            await API.createTask({
                title: title,
                checklist: desc ? [desc] : [], // Treat desc as checklist item or separate
                staff_id: targetId,
                category: 'Request',
                end_time: deadline || '17:00',
                start_time: startTime,
                task_date: reqDate || this.state.selectedDate,
                attachment_required: attachmentRequired,
                kanban_status: 'todo',
                mentions: this.state.requestMentions // Add mentions
            }); // End createTask

            // Show different toast if mentions were added
            if (this.state.requestMentions.length > 0) {
                this.showToast(`Request dikirim ✓ (${this.state.requestMentions.length} staff akan dinotifikasi)`, 'success');
            } else {
                this.showToast('Request berhasil dikirim ✓', 'success');
            }
            this.closeModal('modal-request');
            await this.loadTimeline();
        } catch (error) {
            this.showToast('Gagal kirim request: ' + error.message, 'error');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    },

    openMobileDrawer() {
        const drawer = document.getElementById('mobile-menu-drawer');
        const user = this.state.user;
        if (!drawer || !user) return;

        // Populate drawer user info
        const avatarEl = document.getElementById('drawer-avatar');
        if (avatarEl) {
            if (user.avatar) {
                const safeAvatar = this.sanitizeUrl(user.avatar) || '';
                avatarEl.innerHTML = `<img src="${safeAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random'">`;
            } else {
                avatarEl.innerHTML = this.escapeHtml(user.name.charAt(0).toUpperCase());
            }
        }
        const usernameEl = document.getElementById('drawer-username');
        if (usernameEl) usernameEl.textContent = user.name;

        const roleEl = document.getElementById('drawer-role');
        if (roleEl) roleEl.textContent = user.role;

        // Show/Hide admin links
        const isAdmin = user.role === 'Admin';
        const usersBtn = document.getElementById('mobile-btn-users');
        if (usersBtn) {
            usersBtn.classList.toggle('hidden', !isAdmin);
        }

        drawer.classList.add('active');
    },
    // =========================================
    // ANNOUNCEMENTS
    // =========================================

    announcementRefreshInterval: null,
    announcementHistoryPage: 1,

    async checkAnnouncements() {
        try {
            const data = await API.getAnnouncements(10);
            if (data.success && data.announcements && data.announcements.length > 0) {
                // Render running text banner with ALL active announcements (within 1 week)
                this.renderAnnouncementBanner(data.announcements);

                // Check popup for unacknowledged announcements
                const unacknowledged = data.announcements.filter(a => !a.is_acknowledged);
                if (unacknowledged.length > 0) {
                    this.showAnnouncementPopup(unacknowledged[0]);
                }
            } else {
                this.hideAnnouncementBanner();
            }
        } catch (e) {
            console.error('Failed to fetch announcements', e);
        }
    },

    startAnnouncementRefresh() {
        if (this.announcementRefreshInterval) clearInterval(this.announcementRefreshInterval);
        this.announcementRefreshInterval = setInterval(() => {
            this.checkAnnouncements();
        }, 120000);
    },

    hideAnnouncementBanner() {
        const banner = document.getElementById('announcement-banner');
        if (banner) banner.classList.add('hidden');
    },

    dismissAnnouncementBanner(annId) {
        sessionStorage.setItem('dismissed_announcement_banner', annId);
        this.hideAnnouncementBanner();
        this.adjustMainContentHeight();
    },

    adjustMainContentHeight() {
        const banner = document.getElementById('announcement-banner');
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        const headerHeight = 64;
        const bannerVisible = banner && !banner.classList.contains('hidden');
        const bannerHeight = bannerVisible ? banner.offsetHeight : 0;
        mainContent.style.height = `calc(100vh - ${headerHeight + bannerHeight}px)`;
    },

    renderAnnouncementBanner(announcements) {
        const dismissedId = sessionStorage.getItem('dismissed_announcement_banner');
        // If latest was dismissed in this session, hide
        if (dismissedId == announcements[0].id) return;

        let banner = document.getElementById('announcement-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'announcement-banner';
            banner.className = 'announcement-banner';
            // Inject into main-content instead of body to avoid header overlap
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.prepend(banner);
            } else {
                document.body.prepend(banner);
            }
        }

        // Build marquee text from ALL announcements (within 1 week)
        const marqueeSegments = announcements.map(ann => {
            const safeTitle = this.escapeHtml(ann.title);
            const safeMessage = this.escapeHtml(ann.message);
            const safeSender = this.escapeHtml(ann.sender_name);
            return `<strong>${safeTitle}</strong>: ${safeMessage} — Oleh ${safeSender} (${ann.date_formatted} ${ann.time_formatted})`;
        }).join('  ●  ');

        const marqueeContent = `<span class="announcement-info-label"><i data-lucide="megaphone" style="width:12px;height:12px;"></i> INFO PERUSAHAAN</span>  ●  ${marqueeSegments}`;

        banner.innerHTML = `
            <div class="announcement-banner-inner">
                <div class="announcement-marquee-wrapper">
                    <div class="announcement-marquee-track">
                        <span class="announcement-marquee-text">
                            ${marqueeContent}
                        </span>
                        <span class="announcement-marquee-text announcement-marquee-duplicate">
                            ${marqueeContent}
                        </span>
                    </div>
                </div>
            </div>
        `;
        banner.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => this.adjustMainContentHeight(), 50);
    },

    showAnnouncementPopup(ann) {
        const modalId = 'modal-announcement-popup';
        if (document.getElementById(modalId)) return;

        const safeTitle = this.escapeHtml(ann.title);
        const safeMessage = this.escapeHtml(ann.message);
        const safeSender = this.escapeHtml(ann.sender_name);

        const modalHtml = `
            <div id="${modalId}" class="announcement-popup-overlay">
                <div class="announcement-popup-card">
                    <div class="announcement-popup-header">
                        <div class="announcement-popup-icon-bg">
                            <div class="announcement-popup-icon">
                                <i data-lucide="megaphone" style="width:36px;height:36px;stroke-width:2.5;"></i>
                            </div>
                        </div>
                        <p class="announcement-popup-label">PENGUMUMAN PERUSAHAAN</p>
                        <h2 class="announcement-popup-title">${safeTitle}</h2>
                    </div>
                    <div class="announcement-popup-body">
                        <p class="announcement-popup-message">"${safeMessage}"</p>
                        <button onclick="App.acknowledgeAndDismissPopup(${ann.id})" class="announcement-popup-btn">
                            SAYA MENGERTI
                        </button>
                        <p class="announcement-popup-meta">Disampaikan oleh: ${safeSender} • ${ann.date_formatted} ${ann.time_formatted}</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) window.lucide.createIcons();
    },

    async acknowledgeAndDismissPopup(announcementId) {
        const modalId = 'modal-announcement-popup';
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();

        try {
            await API.acknowledgeAnnouncement(announcementId);
        } catch (e) {
            console.error('Failed to acknowledge announcement', e);
        }
    },

    openAnnouncementCreator() {
        this.openModal('modal-create-announcement');
    },

    async handleCreateAnnouncement(e) {
        e.preventDefault();
        const title = document.getElementById('ann-title').value.trim();
        const message = document.getElementById('ann-message').value.trim();
        const btn = e.target.querySelector('button[type="submit"]');

        if (!title || !message) {
            this.showToast('Judul dan pesan wajib diisi', 'warning');
            return;
        }

        try {
            this.setButtonLoading(btn, true);
            await API.createAnnouncement({ title, message });
            this.showToast('Pengumuman berhasil dibuat & dikirim ke semua staff', 'success');
            this.closeModal('modal-create-announcement');
            document.getElementById('form-create-announcement').reset();
            sessionStorage.removeItem('dismissed_announcement_banner');
            this.checkAnnouncements();
        } catch (err) {
            this.showToast(err.message || 'Gagal membuat pengumuman', 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    },

    // =========================================
    // ANNOUNCEMENT HISTORY LOG
    // =========================================

    openAnnouncementHistory() {
        this.announcementHistoryPage = 1;
        this.openModal('modal-announcement-history');
        this.loadAnnouncementHistory();
    },

    async loadAnnouncementHistory(page = 1) {
        this.announcementHistoryPage = page;
        const container = document.getElementById('announcement-history-content');
        if (!container) return;

        container.innerHTML = `
            <div style="text-align:center; padding:40px;">
                <div class="loading-spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto 12px;"></div>
                <p style="color:var(--slate-400); font-size:0.8rem;">Memuat riwayat pengumuman...</p>
            </div>
        `;

        try {
            const data = await API.getAnnouncementHistory(page, 15);
            if (!data.success) throw new Error(data.message);

            const announcements = data.announcements || [];
            const pagination = data.pagination || {};

            if (announcements.length === 0) {
                container.innerHTML = `
                    <div class="ann-history-empty">
                        <i data-lucide="megaphone" style="width:48px;height:48px;color:var(--slate-300);margin-bottom:12px;"></i>
                        <p style="font-weight:600;color:var(--slate-500);">Belum Ada Pengumuman</p>
                        <p style="font-size:0.8rem;color:var(--slate-400);">Pengumuman dari admin akan muncul di sini.</p>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            let html = '<div class="ann-history-list">';

            announcements.forEach(ann => {
                const safeTitle = this.escapeHtml(ann.title);
                const safeMessage = this.escapeHtml(ann.message);
                const safeSender = this.escapeHtml(ann.sender_name);
                const relativeTime = this.escapeHtml(ann.relative_time || '');

                const isOnBanner = ann.is_on_banner;
                const isAcknowledged = ann.is_acknowledged;

                html += `
                    <div class="ann-history-item ${isOnBanner ? 'active' : 'expired'}">
                        <div class="ann-history-item-left">
                            <div class="ann-history-icon ${isOnBanner ? 'live' : 'past'}">
                                <i data-lucide="${isOnBanner ? 'radio' : 'archive'}" style="width:18px;height:18px;"></i>
                            </div>
                        </div>
                        <div class="ann-history-item-body">
                            <div class="ann-history-item-top">
                                <h4>${safeTitle}</h4>
                                <div class="ann-history-badges">
                                    ${isOnBanner ? '<span class="ann-badge-live"><i data-lucide="radio" style="width:10px;height:10px;"></i> AKTIF</span>' : '<span class="ann-badge-expired"><i data-lucide="archive" style="width:10px;height:10px;"></i> BERAKHIR</span>'}
                                    ${isAcknowledged ? '<span class="ann-badge-read"><i data-lucide="check-circle-2" style="width:10px;height:10px;"></i> Sudah Dibaca</span>' : '<span class="ann-badge-unread"><i data-lucide="eye-off" style="width:10px;height:10px;"></i> Belum Dibaca</span>'}
                                </div>
                            </div>
                            <p class="ann-history-message">${safeMessage}</p>
                            <div class="ann-history-meta">
                                <span><i data-lucide="user" style="width:12px;height:12px;"></i> ${safeSender}</span>
                                <span><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${ann.date_formatted} ${ann.time_formatted}</span>
                                <span class="ann-history-relative">${relativeTime}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';

            // Pagination
            if (pagination.total_pages > 1) {
                html += '<div class="ann-history-pagination">';

                // Previous button
                if (pagination.current_page > 1) {
                    html += `<button onclick="App.loadAnnouncementHistory(${pagination.current_page - 1})" class="btn btn-outline btn-sm"><i data-lucide="chevron-left" style="width:14px;"></i> Sebelumnya</button>`;
                }

                html += `<span class="ann-history-page-info">Halaman ${pagination.current_page} dari ${pagination.total_pages}</span>`;

                // Next button
                if (pagination.current_page < pagination.total_pages) {
                    html += `<button onclick="App.loadAnnouncementHistory(${pagination.current_page + 1})" class="btn btn-outline btn-sm">Selanjutnya <i data-lucide="chevron-right" style="width:14px;"></i></button>`;
                }

                html += '</div>';
            }

            container.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
        } catch (e) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--danger);">
                    <i data-lucide="alert-circle" style="width:32px;height:32px;margin-bottom:8px;"></i>
                    <p>Gagal memuat riwayat: ${this.escapeHtml(e.message)}</p>
                    <button onclick="App.loadAnnouncementHistory(${page})" class="btn btn-outline btn-sm" style="margin-top:12px;">Coba Lagi</button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
    },

    // =====================================================
    // NOTEPAD FEATURE
    // =====================================================

    // Current state for notepad
    notepadState: {
        currentFilter: 'all',
        currentPage: 1,
        notes: [],
        isLoading: false
    },

    /**
     * Switch between Timeline and Notepad views
     */
    setAppView(view) {
        // Update toggle buttons
        document.querySelectorAll('.app-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.appview === view);
        });

        // Timeline-related elements
        const timelineElements = [
            document.querySelector('.page-header'),
            document.getElementById('timeline-container'),
            document.getElementById('list-view-container'),
            document.getElementById('history-view-container')
        ];

        // Notepad element
        const notepadView = document.getElementById('notepad-view');

        if (view === 'notepad') {
            // Hide all timeline elements
            timelineElements.forEach(el => {
                if (el) el.classList.add('hidden');
            });
            // Show notepad
            if (notepadView) {
                notepadView.classList.remove('hidden');
                this.loadNotes();
                this.currentView = 'notepad';
            }
        } else {
            // Show timeline elements (restore previous view state)
            const pageHeader = document.querySelector('.page-header');
            if (pageHeader) pageHeader.classList.remove('hidden');

            // Restore the active sub-view
            const activeToggle = document.querySelector('.toggle-btn.active');
            const activeSubView = activeToggle?.dataset?.view || 'all';

            const timelineContainer = document.getElementById('timeline-container');
            const listContainer = document.getElementById('list-view-container');
            const historyContainer = document.getElementById('history-view-container');

            if (activeSubView === 'list') {
                if (timelineContainer) timelineContainer.classList.add('hidden');
                if (listContainer) listContainer.classList.remove('hidden');
                if (historyContainer) historyContainer.classList.add('hidden');
            } else if (activeSubView === 'history') {
                if (timelineContainer) timelineContainer.classList.add('hidden');
                if (listContainer) listContainer.classList.add('hidden');
                if (historyContainer) historyContainer.classList.remove('hidden');
            } else {
                if (timelineContainer) timelineContainer.classList.remove('hidden');
                if (listContainer) listContainer.classList.add('hidden');
                if (historyContainer) historyContainer.classList.add('hidden');
            }

            // Hide notepad
            if (notepadView) notepadView.classList.add('hidden');
            this.currentView = activeSubView; // Set current view to the restored sub-view
        }

        this.updateMobileActionBtn(); // Update mobile action button after view change
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Update Mobile Action Button Label & Icon
     */
    updateMobileActionBtn() {
        const btn = document.getElementById('mobile-action-btn');
        const label = document.getElementById('mobile-action-label');
        const icon = btn ? btn.querySelector('i[data-lucide]') : null;

        if (!btn || !label || !icon) return;

        if (this.currentView === 'notepad') {
            label.textContent = 'Buat Catatan';
            icon.setAttribute('data-lucide', 'plus-circle');
        } else {
            label.textContent = 'Tambah Pekerjaan';
            icon.setAttribute('data-lucide', 'plus');
        }
        if (window.lucide) window.lucide.createIcons(); // Re-render icon
    },

    /**
     * Handle Mobile Action Button Click
     */
    mobileActionClick() {
        if (this.currentView === 'notepad') {
            this.openNoteCreator();
        } else {
            // Default to opening add work modal for current user
            this.openAddWorkForStaff(this.state.user.id);
        }
    },

    /**
     * Load notes from API
     */
    async loadNotes(filter, page) {
        if (filter !== undefined) this.notepadState.currentFilter = filter;
        if (page !== undefined) this.notepadState.currentPage = page;

        const grid = document.getElementById('notepad-grid');
        const loading = document.getElementById('notepad-loading');

        if (!grid) return;

        // Show loading
        if (loading) loading.classList.remove('hidden');
        grid.innerHTML = '';

        try {
            const res = await API.getNotes(this.notepadState.currentFilter, this.notepadState.currentPage);
            if (res.success) {
                this.notepadState.notes = res.notes;
                this.renderNoteCards(res.notes);
            } else {
                grid.innerHTML = `
                    <div class="notepad-empty">
                        <div class="notepad-empty-icon"><i data-lucide="alert-circle"></i></div>
                        <p>${this.escapeHtml(res.message || 'Gagal memuat catatan')}</p>
                    </div>
                `;
            }
        } catch (e) {
            grid.innerHTML = `
                <div class="notepad-empty">
                    <div class="notepad-empty-icon"><i data-lucide="alert-circle"></i></div>
                    <p>Error: ${this.escapeHtml(e.message)}</p>
                </div>
            `;
        } finally {
            if (loading) loading.classList.add('hidden');
            if (window.lucide) window.lucide.createIcons();
        }
    },

    /**
     * Render note cards into the grid
     */
    renderNoteCards(notes) {
        const grid = document.getElementById('notepad-grid');
        if (!grid) return;

        if (!notes || notes.length === 0) {
            grid.innerHTML = `
                <div class="notepad-empty">
                    <div class="notepad-empty-icon"><i data-lucide="sticky-note"></i></div>
                    <p>Belum ada catatan yang sesuai filter ini.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        let html = '';
        notes.forEach(note => {
            const safeTitle = this.escapeHtml(note.title);
            const safeContent = this.escapeHtml(note.content);
            const safeAuthor = this.escapeHtml(note.author_name);
            const timeAgo = this.escapeHtml(note.time_ago || note.updated_formatted || '');

            // Visibility badge
            const visIcon = note.visibility === 'private' ? 'lock' : note.visibility === 'public' ? 'globe' : 'share-2';
            const visLabel = note.visibility === 'private' ? 'Pribadi' : note.visibility === 'public' ? 'Publik' : 'Berbagi';

            // Avatar
            const avatarContent = note.author_avatar
                ? `<img src="${this.escapeHtml(note.author_avatar)}" alt="${safeAuthor}">`
                : safeAuthor.charAt(0).toUpperCase();

            const noteIdSafe = parseInt(note.id);

            // Actions (only for owner)
            const actionsHtml = note.is_owner ? `
                <div class="note-card-actions">
                    <button class="note-action-edit" onclick="App.openNoteEditor(${noteIdSafe})" title="Edit">
                        <i data-lucide="file-edit" style="width:14px;height:14px;"></i>
                    </button>
                    <button class="note-action-delete" onclick="App.deleteNote(${noteIdSafe})" title="Hapus">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            ` : '';

            // Shared depts tags
            let sharedHtml = '';
            if (note.visibility === 'shared' && note.shared_with_depts && note.shared_with_depts.length > 0) {
                sharedHtml = `
                    <div class="note-card-shared-depts">
                        ${note.shared_with_depts.map(d => `<span class="note-dept-tag">${this.escapeHtml(d)}</span>`).join('')}
                    </div>
                `;
            }

            html += `
                <div class="note-card" data-note-id="${noteIdSafe}" onclick="App.openNoteDetail(${noteIdSafe})">
                    <div class="note-card-body">
                        <div class="note-card-header">
                            <span class="note-vis-badge ${note.visibility}">
                                <i data-lucide="${visIcon}" style="width:10px;height:10px;"></i>
                                ${visLabel}
                            </span>
                            ${actionsHtml}
                        </div>
                        <div class="note-card-title">${safeTitle}</div>
                        <div class="note-card-content">${safeContent}</div>
                    </div>
                    <div class="note-card-footer">
                        <div class="note-card-author">
                            <div class="note-card-avatar">${avatarContent}</div>
                            <span class="note-card-author-name">${safeAuthor}</span>
                        </div>
                        ${sharedHtml || `<span class="note-card-time">${timeAgo}</span>`}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Set notepad filter
     */
    setNotepadFilter(filter, btn) {
        document.querySelectorAll('.notepad-filter-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.loadNotes(filter, 1);
    },

    /**
     * Set note visibility in modal
     */
    setNoteVisibility(vis, btn) {
        document.querySelectorAll('.vis-btn').forEach(b => b.classList.remove('active'));
        if (btn) {
            btn.classList.add('active');
        } else {
            // Fallback: find button by data-vis attribute
            document.querySelector(`.vis-btn[data-vis="${vis}"]`)?.classList.add('active');
        }
        document.getElementById('note-visibility').value = vis;

        // Show/hide dept selector
        const deptSelector = document.getElementById('note-dept-selector');
        if (deptSelector) {
            deptSelector.classList.toggle('hidden', vis !== 'shared');
        }
    },

    /**
     * Open note creator modal (create new)
     */
    openNoteCreator() {
        document.getElementById('note-id').value = '';
        document.getElementById('note-title').value = '';
        document.getElementById('note-content').value = '';
        document.getElementById('note-visibility').value = 'private';
        document.getElementById('note-modal-title').textContent = 'Buat Catatan Baru';

        // Reset visibility toggle
        document.querySelectorAll('.vis-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.vis-btn[data-vis="private"]')?.classList.add('active');

        // Reset dept checkboxes
        document.querySelectorAll('.note-dept-cb').forEach(cb => cb.checked = false);
        document.getElementById('note-dept-selector')?.classList.add('hidden');

        this.openModal('modal-note');
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Open note editor modal (edit existing)
     */
    openNoteEditor(noteId) {
        const note = this.notepadState.notes.find(n => n.id == noteId);
        if (!note) return;

        document.getElementById('note-id').value = note.id;
        document.getElementById('note-title').value = note.title;
        document.getElementById('note-content').value = note.content;
        document.getElementById('note-visibility').value = note.visibility;
        document.getElementById('note-modal-title').textContent = 'Edit Catatan';

        // Set visibility toggle
        document.querySelectorAll('.vis-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.vis-btn[data-vis="${note.visibility}"]`)?.classList.add('active');

        // Set dept checkboxes
        const sharedDepts = note.shared_with_depts || [];
        document.querySelectorAll('.note-dept-cb').forEach(cb => {
            cb.checked = sharedDepts.includes(cb.value);
        });

        // Show/hide dept selector
        const deptSelector = document.getElementById('note-dept-selector');
        if (deptSelector) deptSelector.classList.toggle('hidden', note.visibility !== 'shared');

        this.openModal('modal-note');
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Handle note form submit (create or update)
     */
    async handleNoteSubmit(e) {
        e.preventDefault();

        const id = document.getElementById('note-id').value;
        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-content').value.trim();
        const visibility = document.getElementById('note-visibility').value;

        if (!title || !content) {
            this.showToast('Judul dan konten wajib diisi', 'warning');
            return;
        }

        // Disable submit button to prevent double-click
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        // Get selected departments
        const sharedWithDepts = [];
        document.querySelectorAll('.note-dept-cb:checked').forEach(cb => {
            sharedWithDepts.push(cb.value);
        });

        if (visibility === 'shared' && sharedWithDepts.length === 0) {
            this.showToast('Pilih minimal satu divisi untuk berbagi', 'warning');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        const data = { title, content, visibility, shared_with_depts: sharedWithDepts };

        try {
            let res;
            if (id) {
                data.id = parseInt(id);
                res = await API.updateNote(data);
            } else {
                res = await API.createNote(data);
            }

            if (res.success) {
                this.showToast(res.message, 'success');
                this.closeModal('modal-note');
                this.loadNotes(); // Reload notes
            } else {
                this.showToast(res.message || 'Gagal menyimpan catatan', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        } finally {
            // Re-enable submit button
            if (submitBtn) submitBtn.disabled = false;
        }
    },

    /**
     * Delete a note with confirmation
     */
    async deleteNote(noteId) {
        if (!confirm('Hapus catatan ini? Tindakan tidak dapat dibatalkan.')) return;

        try {
            const res = await API.deleteNote(noteId);
            if (res.success) {
                this.showToast(res.message, 'success');
                this.loadNotes(); // Reload
            } else {
                this.showToast(res.message, 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    /**
     * Open note detail modal to view full content
     */
    openNoteDetail(noteId) {
        const note = this.notepadState.notes.find(n => n.id == noteId);
        if (!note) return;

        const safeTitle = this.escapeHtml(note.title);
        const safeContent = this.escapeHtml(note.content);
        const safeAuthor = this.escapeHtml(note.author_name);
        const timeAgo = this.escapeHtml(note.time_ago || note.updated_formatted || '');
        const createdAt = this.escapeHtml(note.created_formatted || '');

        // Set header title
        document.getElementById('note-detail-title').textContent = note.title;

        // Set visibility icon style + meta
        const visIcon = document.getElementById('note-detail-vis-icon');
        if (note.visibility === 'private') {
            visIcon.style.background = 'var(--slate-100)';
            visIcon.innerHTML = '<i data-lucide="lock" style="width:16px;height:16px;color:var(--slate-500);"></i>';
            document.getElementById('note-detail-meta').textContent = 'Catatan Pribadi';
        } else if (note.visibility === 'public') {
            visIcon.style.background = '#ecfdf5';
            visIcon.innerHTML = '<i data-lucide="globe" style="width:16px;height:16px;color:#059669;"></i>';
            document.getElementById('note-detail-meta').textContent = 'Catatan Publik';
        } else {
            visIcon.style.background = '#eff6ff';
            visIcon.innerHTML = '<i data-lucide="share-2" style="width:16px;height:16px;color:#2563eb;"></i>';
            document.getElementById('note-detail-meta').textContent = 'Berbagi ke divisi tertentu';
        }

        // Build body content
        let bodyHtml = '';

        // Shared depts tags at top
        if (note.visibility === 'shared' && note.shared_with_depts && note.shared_with_depts.length > 0) {
            bodyHtml += `<div class="note-detail-shared-depts">`;
            note.shared_with_depts.forEach(d => {
                bodyHtml += `<span class="note-dept-tag">${this.escapeHtml(d)}</span>`;
            });
            bodyHtml += `</div>`;
        }

        // Full content
        bodyHtml += `<div style="padding:24px; white-space:pre-wrap; word-wrap:break-word; font-size:0.9rem; line-height:1.8; color:var(--slate-700);">${safeContent}</div>`;

        document.getElementById('note-detail-body').innerHTML = bodyHtml;

        // Build footer
        const avatarContent = note.author_avatar
            ? `<img src="${this.escapeHtml(note.author_avatar)}" alt="${safeAuthor}">`
            : safeAuthor.charAt(0).toUpperCase();

        let footerHtml = `
            <div class="note-detail-author">
                <div class="note-detail-avatar">${avatarContent}</div>
                <div class="note-detail-author-info">
                    <span class="note-detail-author-name">${safeAuthor}</span>
                    <span class="note-detail-author-time">${createdAt} · ${timeAgo}</span>
                </div>
            </div>
        `;

        // Action buttons for owner
        if (note.is_owner) {
            footerHtml += `
                <div class="note-detail-actions">
                    <button class="btn btn-outline btn-sm" onclick="App.closeModal('modal-note-detail'); App.openNoteEditor(${note.id});">
                        <i data-lucide="file-edit" style="width:14px;height:14px;"></i>
                        Edit
                    </button>
                    <button class="btn btn-sm" style="background:#fef2f2;color:#ef4444;border:1px solid #fecaca;" onclick="App.closeModal('modal-note-detail'); App.deleteNote(${note.id});">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                        Hapus
                    </button>
                </div>
            `;
        }

        document.getElementById('note-detail-footer').innerHTML = footerHtml;

        this.openModal('modal-note-detail');
        if (window.lucide) window.lucide.createIcons();
    },

    /**
     * Initialize notepad event bindings
     */
    initNotepadBindings() {
        // Create note button
        const btnCreate = document.getElementById('btn-create-note');
        if (btnCreate) {
            btnCreate.addEventListener('click', () => this.openNoteCreator());
        }

        // Note form submit
        const formNote = document.getElementById('form-note');
        if (formNote) {
            formNote.addEventListener('submit', (e) => this.handleNoteSubmit(e));
        }

        // Stop edit/delete buttons from triggering card click (detail modal)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.note-action-edit') || e.target.closest('.note-action-delete')) {
                e.stopPropagation();
            }
        }, true); // capture phase
    },

    /**
     * Initialize Mobile Navigation
     */
    initMobileNav() {
        const burger = document.getElementById('mobile-burger-btn');
        const drawer = document.getElementById('mobile-menu-drawer');
        const closeBtn = document.querySelector('.drawer-close');

        if (burger && drawer) {
            burger.addEventListener('click', (e) => {
                e.stopPropagation();
                drawer.classList.add('active');
            });
        }

        if (closeBtn && drawer) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                drawer.classList.remove('active');
            });
        }

        // Close on outside click
        if (drawer) {
            drawer.addEventListener('click', (e) => {
                if (e.target === drawer) {
                    drawer.classList.remove('active');
                }
            });
        }
    }
};

// Export for use in other modules
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());

