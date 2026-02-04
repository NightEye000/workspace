/**
 * OfficeSync - Main Application Logic
 * Handles timeline rendering, task management, and user interactions.
 */

const App = {
    updateNotificationBadge() {
        if (window.Notifications && window.Notifications.loadUnread) {
            window.Notifications.loadUnread();
        }
    },
    state: {
        user: null,
        viewMode: 'all', // 'all' or 'me'
        selectedDate: null,
        deptFilter: 'All'
    },

    els: {},
    checkInterval: null,

    // =========================================
    // INITIALIZATION
    // =========================================

    init() {
        this.cacheDom();
        this.bindEvents();
        this.initDatePicker();
        this.hideLoading();
        this.checkAuth();
        this.initIcons();

        if ("Notification" in window) {
            Notification.requestPermission();
        }

        // Global error handler for unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
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
        this.els.btnGenerateRoutines = document.getElementById('btn-generate-routines');
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
                this.loadTimeline();
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

        if (this.els.btnUserMgmt) {
            this.els.btnUserMgmt.addEventListener('click', () => {
                this.openModal('modal-users');
                this.loadUsersTable();
            });
        }

        if (this.els.btnGenerateRoutines) {
            this.els.btnGenerateRoutines.addEventListener('click', () => this.generateRoutines());
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
        });
    },

    // =========================================
    // UI HELPERS
    // =========================================

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
        this.loadDepartments();
        this.loadTimeline();

        // Admin Buttons Visibility
        if (this.state.user.role === 'Admin') {
            this.els.btnUserMgmt.classList.remove('hidden');
            this.els.btnGenerateRoutines.classList.remove('hidden');
        } else {
            this.els.btnUserMgmt.classList.add('hidden');
            this.els.btnGenerateRoutines.classList.add('hidden');
        }

        // Auto Refresh Timeline
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => {
            this.updateCurrentTimeLine();
        }, 60000); // Update red line every minute
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
        document.getElementById('modal-overlay').classList.add('hidden');
        this.editingTaskId = null; // Reset edit mode just in case
    },

    // =========================================
    // AUTHENTICATION
    // =========================================

    async checkAuth() {
        try {
            const result = await API.checkAuth();
            if (result && result.loggedIn) {
                this.state.user = result.user;
                if (result.csrf_token) API.setCSRFToken(result.csrf_token);
                this.showMain();
                if (window.NotificationManager) window.NotificationManager.init();
            } else {
                this.showLogin();
            }
        } catch (error) {
            this.showLogin();
            this.showToast('Gagal cek login: ' + error.message, 'error');
        }
    },

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
    // TIMELINE RENDERING
    // =========================================

    setViewMode(mode) {
        this.state.viewMode = mode;
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === mode);
        });
        this.loadTimeline();
    },

    async loadDepartments() {
        try {
            const result = await API.getDepartments();
            const select = this.els.deptFilter;
            // Keep "All" option
            select.innerHTML = '<option value="All">Semua Divisi</option>';
            result.departments.forEach(dept => {
                select.innerHTML += `<option value="${dept}">${dept}</option>`;
            });
        } catch (error) {
            console.error('Failed to load departments');
        }
    },

    async loadTimeline() {
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

            // API now returns 'timeline' which is a list of users with their tasks
            // If it returns 'tasks' (legacy), we must handle it (but we just changed API)

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
            this.updateCurrentTimeLine(); // Initial draw

        } catch (error) {
            this.showToast('Gagal memuat timeline: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    },

    renderTimeline(staffList) {
        const container = this.els.timelineContainer;

        // Premium Header
        let html = `
            <div class="timeline-header" style="display:grid; grid-template-columns: 240px 1fr; background:var(--slate-50); border-bottom:1px solid var(--slate-100);">
                <div style="padding:1rem; font-weight:600; color:var(--slate-700);">Staff & Performa</div>
                <div style="padding:1rem; font-weight:600; color:var(--slate-700); display:flex; justify-content:space-between; align-items:center;">
                    <span>Timeline (${this.state.selectedDate})</span>
                    <div style="display:flex; gap:1rem; font-size:0.75rem;">
                         <span style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--purple);"></div> Jobdesk</span>
                         <span style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--amber);"></div> Tambahan</span>
                         <span style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--teal);"></div> Inisiatif</span>
                         <span style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--rose);"></div> Request</span>
                    </div>
                </div>
            </div>
            <div class="timeline-body" style="max-height:70vh; overflow-y:auto;">
        `;

        if (staffList.length === 0) {
            html += `
                <div style="padding:3rem; text-align:center; color:var(--slate-400);">
                    <i data-lucide="calendar-x" style="width:48px;height:48px;margin-bottom:1rem;display:inline-block;"></i>
                    <p>Tidak ada staff yang ditemukan.</p>
                </div>
            `;
        } else {
            staffList.forEach(user => {
                const isMe = user.id == this.state.user.id;
                const userTasks = user.tasks || [];
                userTasks.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

                const total = userTasks.length;
                const completed = userTasks.filter(t => t.status === 'done').length;
                const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                const percentColor = percent === 100 ? 'var(--success)' : 'var(--primary)';

                html += `
                    <div class="staff-row" style="display:grid; grid-template-columns: 240px 1fr; min-height:140px; border-bottom:1px solid var(--slate-100); ${isMe ? 'background:var(--primary-bg);' : ''}">
                         <!-- PROFILE -->
                         <div style="padding:1rem; display:flex; flex-direction:column; justify-content:center; border-right:1px solid var(--slate-100); background:rgba(255,255,255,0.9); position:sticky; left:0; z-index:10;">
                            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
                                <div style="position:relative;">
                                    <img src="${user.avatar}" style="width:40px; height:40px; border-radius:50%; background:var(--slate-100);">
                                    ${isMe ? '<div style="position:absolute; bottom:-2px; right:-2px; background:var(--primary); color:white; width:14px; height:14px; border-radius:50%; font-size:8px; display:flex; align-items:center; justify-content:center; border:2px solid white;">★</div>' : ''}
                                </div>
                                <div>
                                    <div style="font-weight:700; color:var(--slate-800); font-size:0.875rem;">${user.name}</div>
                                    <div style="font-size:10px; color:var(--slate-500); text-transform:uppercase; background:var(--slate-100); padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;">${user.role}</div>
                                </div>
                            </div>
                             <div style="background:var(--slate-50); padding:0.6rem; border-radius:0.5rem; border:1px solid var(--slate-200);">
                               <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                  <span style="font-size:10px; font-weight:700; color:var(--slate-500);">PERFORMA</span>
                                  <span style="font-size:12px; font-weight:700; color:${percent === 100 ? 'var(--success)' : 'var(--slate-700)'};">${percent}%</span>
                               </div>
                               <div style="width:100%; background:var(--slate-200); height:6px; border-radius:99px; overflow:hidden;">
                                  <div style="height:100%; transition:all 0.5s; background:${percentColor}; width:${percent}%"></div>
                               </div>
                               <div style="font-size:9px; color:var(--slate-400); margin-top:4px; display:flex; justify-content:space-between;">
                                 <span>${completed} Selesai</span>
                                 <span>${total} Total</span>
                               </div>
                            </div>
                         </div>

                         <!-- TASKS -->
                         <div class="custom-scrollbar" style="padding:1rem; display:flex; align-items:center; gap:1rem; overflow-x:auto;">
                `;

                if (userTasks.length > 0) {
                    userTasks.forEach((task, index) => {
                        html += this.renderTaskCard(task);
                        if (index < userTasks.length - 1) {
                            html += '<div style="height:2px; width:16px; background:var(--slate-200); flex-shrink:0;"></div>';
                        }
                    });
                } else {
                    html += `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--slate-400); opacity:0.5; width:100%; min-width:200px;">
                           <i data-lucide="layout" style="width:24px;height:24px;margin-bottom:0.5rem;"></i>
                           <span style="font-size:12px; font-style:italic;">Tidak ada jadwal</span>
                        </div>
                    `;
                }

                if (this.state.user.role === 'Admin' || isMe) {
                    html += `
                        <button onclick="App.openAddWorkForStaff(${user.id})" title="Tambah Jobdesk" 
                            style="flex-shrink:0; width:40px; height:40px; border-radius:50%; border:2px dashed var(--slate-300); background:white; color:var(--slate-400); display:flex; align-items:center; justify-content:center; transition:all 0.2s; margin-left:8px; cursor:pointer;"
                            onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'" 
                            onmouseout="this.style.borderColor='var(--slate-300)';this.style.color='var(--slate-400)'">
                            <i data-lucide="plus"></i>
                        </button>
                    `;
                }

                html += `</div></div>`;
            });
        }

        html += '</div>';
        container.innerHTML = html;
        this.initIcons();
    },

    renderTaskCard(task) {
        const style = this.getCategoryStyle(task.category);
        const checklist = task.checklist || [];
        const doneCount = checklist.filter(c => c.is_done == 1).length;
        const totalCount = checklist.length;
        const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        let statusIcon = 'circle';
        let statusClass = 'text-slate-400 bg-slate-100 border-slate-200';
        if (task.status === 'done') {
            statusIcon = 'check-circle-2';
            statusClass = 'text-success bg-green-100 border-green-200';
        } else if (task.status === 'in-progress') {
            statusIcon = 'play-circle';
            statusClass = 'text-info bg-blue-100 border-blue-200';
        }

        return `
            <div onclick="App.openTaskDetail(${task.id})" class="task-card-premium" style="
                flex-shrink:0; width:260px; padding:0.8rem; border-radius:0.75rem; border:1px solid; cursor:pointer; transition:all 0.2s; background:white; display:flex; flex-direction:column; justify-content:space-between; position:relative;
                ${style} ${task.status === 'done' ? 'opacity: 0.5; filter: grayscale(100%);' : ''}
            ">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                     <span style="font-size:10px; font-weight:700; text-transform:uppercase; display:flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.6); border:1px solid rgba(0,0,0,0.05);">
                        <i data-lucide="${this.getCategoryIcon(task.category)}" style="width:10px;height:10px;"></i> ${task.category}
                     </span>
                     <div style="font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 6px; border-radius:99px; border:1px solid transparent; display:flex; align-items:center; gap:4px; border:1px solid; ${task.status === 'done' ? 'background:#dcfce7;color:#15803d;border-color:#bbf7d0;' : task.status === 'in-progress' ? 'background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;' : 'background:#f1f5f9;color:#64748b;border-color:#e2e8f0;'}">
                           <i data-lucide="${statusIcon}" style="width:10px;height:10px;"></i>
                           ${task.status.replace('-', ' ')}
                     </div>
                </div>

                <div style="font-weight:700; color:var(--slate-800); font-size:0.875rem; margin-bottom:0.5rem; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${task.title}
                </div>

                <div style="display:flex; align-items:center; gap:4px; font-size:10px; color:var(--slate-500); margin-bottom:0.5rem;">
                    <i data-lucide="clock" style="width:10px;height:10px;"></i> ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}
                </div>

                <div style="width:100%; background:rgba(255,255,255,0.5); height:4px; border-radius:99px; overflow:hidden; margin-bottom:4px;">
                    <div style="height:100%; width:${progress}%; background:currentColor; opacity:0.7;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:9px; opacity:0.7;">
                    <span>${doneCount}/${totalCount} Check</span>
                    ${(task.comment_count > 0) ? '<span style="display:flex;align-items:center;gap:2px"><i data-lucide="message-square" style="width:8px;height:8px"></i> Info</span>' : ''}
                </div>
            </div>
        `;
    },

    getCategoryStyle(category) {
        const color = this.getCategoryColor(category);
        const map = {
            'rose': 'background-color:#fff1f2; border-color:#fecdd3; color:#be123c;',
            'amber': 'background-color:#fffbeb; border-color:#fde68a; color:#b45309;',
            'teal': 'background-color:#f0fdfa; border-color:#99f6e4; color:#0f766e;',
            'purple': 'background-color:#faf5ff; border-color:#ddd6fe; color:#7e22ce;',
            'primary': 'background-color:#eef2ff; border-color:#c7d2fe; color:#4338ca;'
        };
        return map[color] || map['primary'];
    },

    getCategoryColor(category) {
        switch (category) {
            case 'Request': return 'rose';
            case 'Tugas Tambahan': return 'amber';
            case 'Inisiatif': return 'teal';
            case 'Jobdesk': return 'purple';
            default: return 'primary';
        }
    },

    updateCurrentTimeLine() {
        // This function is for visual time indicator - optional but nice
        // Implementation omitted for brevity in this fix
    },

    // =========================================
    // TASK DETAIL
    // =========================================

    async openTaskDetail(taskId) {
        try {
            const result = await API.getTask(taskId);
            if (!result.success) throw new Error(result.message);

            const task = result.task;
            this.renderTaskDetail(task);
            this.openModal('modal-task-detail');
            this.initIcons();
        } catch (error) {
            this.showToast('Error loading task: ' + error.message, 'error');
        }
    },

    renderTaskDetail(task) {
        const container = document.getElementById('task-detail-content');

        const checklist = task.checklist || [];
        const doneCount = checklist.filter(c => c.is_done).length;
        const totalCount = checklist.length;
        const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        const categoryClass = this.getCategoryClass(task.category);

        let html = `
            <div class="task-detail-header">
                <div class="task-detail-badges">
                    <div class="category-badge ${categoryClass}">
                        ${task.category}
                    </div>
                    <select onchange="App.updateTaskStatus(${task.id}, this.value)" class="status-badge ${task.status}" style="border:none; cursor:pointer; outline:none; appearance:none; padding-right:1em;">
                        <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>TODO</option>
                        <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>ON PROGRESS</option>
                        <option value="done" ${task.status === 'done' ? 'selected' : ''}>DONE</option>
                    </select>
                </div>
                <h2 class="task-detail-title">${task.title}</h2>
                <div class="task-detail-meta">
                    <span class="staff"><i data-lucide="user"></i> ${task.staff_name}</span>
                    <span><i data-lucide="clock"></i> ${this.formatTime(task.start_time)} - ${this.formatTime(task.end_time)}</span>
                </div>
            </div>

            <div class="checklist-section">
                <div class="checklist-header">
                    <h4>Checklist (${progress}% Selesai)</h4>
                </div>
                <div class="checklist-items">
        `;

        checklist.forEach(item => {
            html += `
                <div class="checklist-item ${item.is_done ? 'checked' : ''} ${task.can_edit ? '' : 'disabled'}" 
                     ${task.can_edit ? `onclick="App.toggleChecklist(${item.id}, ${task.id})"` : ''}>
                    <div class="checkbox">
                        ${item.is_done ? '<i data-lucide="check"></i>' : ''}
                    </div>
                    <span class="text">${item.text}</span>
                </div>
            `;
        });

        html += '</div></div>';

        // Comments
        if (task.comments && task.comments.length > 0) {
            html += '<div class="comments-section"><h4>Komentar</h4><div class="comments-list">';
            task.comments.forEach(c => {
                html += `<div class="comment-item"><strong>${c.user_name}</strong>: ${c.text}</div>`;
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

    async toggleChecklist(itemId, taskId) {
        try {
            const res = await API.toggleChecklist(itemId);
            if (res.new_status) {
                // Optional: update local task status immediately if needed
            }
            await this.openTaskDetail(taskId); // Refresh detail
            await this.loadTimeline(); // Update bar metrics
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async addComment(taskId) {
        const input = document.getElementById('comment-text');
        if (!input.value.trim()) return;
        try {
            await API.addComment(taskId, input.value.trim());
            this.openTaskDetail(taskId);
        } catch (e) {
            this.showToast(e.message, 'error');
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

            document.getElementById('work-title').value = task.title;
            document.getElementById('work-start').value = task.start_time.substring(0, 5);
            document.getElementById('work-end').value = task.end_time.substring(0, 5);

            // Checklist
            const checklistText = (task.checklist || []).map(i => i.text).join('\n');
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

            this.openModal('modal-add-work');
            this.initIcons();

        } catch (error) {
            this.showToast('Gagal edit: ' + error.message, 'error');
        }
    },

    initAddWorkForm() {
        document.getElementById('form-add-work').reset();
        document.getElementById('work-category').value = 'Jobdesk';

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
                const isJobdesk = e.target.value === 'Jobdesk';
                if (routineOpts) routineOpts.classList.toggle('hidden', !isJobdesk);
                if (!isJobdesk) {
                    if (rDays) rDays.classList.add('hidden');
                    if (tSel) tSel.classList.add('hidden');
                }

                // Color logic
                if (!this.editingTaskId && btn) {
                    btn.className = 'btn btn-block';
                    if (e.target.value === 'Tugas Tambahan') btn.classList.add('btn-warning');
                    else if (e.target.value === 'Inisiatif') btn.style.background = '#14b8a6';
                    else btn.classList.add('btn-primary');

                    const span = btn.querySelector('span');
                    if (span) span.textContent = 'Simpan ' + e.target.value;
                }
            };
        }

        const routineCheck = document.getElementById('work-is-routine');
        if (routineCheck) routineCheck.onchange = (e) => this.handleRoutineChange(e);

        document.querySelectorAll('.day-btn').forEach(btn => {
            btn.onclick = () => btn.classList.toggle('active');
        });

        if (this.loadRoutineTemplates) this.loadRoutineTemplates();
    },

    updateCurrentTimeLine() {
        // ... visual update ...
    },

    checkDeadlines() {
        if (!this.state.tasks) return;
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const todayStr = new Date().toLocaleDateString('sv').split('T')[0];

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

        const routineDays = [];
        document.querySelectorAll('.day-btn.active').forEach(b => routineDays.push(parseInt(b.dataset.day)));

        const data = {
            title, category, start_time: startTime, end_time: endTime, checklist,
            is_routine: isRoutine, routine_days: routineDays
        };

        try {
            if (this.editingTaskId) {
                data.id = this.editingTaskId;
                await API.updateTask(data);
                this.showToast('Tugas diupdate', 'success');
                this.editingTaskId = null;
            } else {
                data.staff_id = this.targetStaffId || this.state.user.id;
                data.task_date = this.state.selectedDate;
                await API.createTask(data);
                this.showToast('Tugas dibuat', 'success');
            }
            this.closeModal('modal-add-work');
            this.loadTimeline();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async deleteTask(taskId) {
        // Safe delete without title param
        const title = this.currentTask && this.currentTask.id === taskId ? this.currentTask.title : 'Tugas ini';
        this.showConfirm(`Hapus "${title}"?`, async () => {
            try {
                await API.deleteTask(taskId);
                this.closeModal('modal-task-detail');
                this.loadTimeline();
                this.showToast('Terhapus', 'success');
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
                        <div class="notif-icon ${n.type}">
                            <i data-lucide="${this.getNotifIcon(n.type)}"></i>
                        </div>
                        <div class="notif-content">
                            <div class="notif-title">${n.title}</div>
                            <div class="notif-msg">${n.message}</div>
                            <div class="notif-time">${n.created_at}</div>
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

    showToast(message, type = 'info', duration = 3000) {
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
        }, duration);
    },

    showConfirm(message, onConfirm) {
        if (confirm(message)) {
            onConfirm();
        }
    },

    getCategoryClass(cat) {
        return cat.toLowerCase().replace(' ', '-');
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
        if (this.state.user.role === 'Admin') return; // Or implement properly
        try {
            const res = await API.getRoutineTemplates(this.state.user.role);
            if (res.templates) {
                const select = document.getElementById('routine-template');
                select.innerHTML = '<option>Pilih Template...</option>';
                res.templates.forEach((t, i) => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = t.title;
                    select.appendChild(opt);
                });
                // bind logic...
                this.routineTemplates = res.templates;

                const tCheck = document.getElementById('use-template');
                const tSelect = document.getElementById('template-select');
                tSelect.classList.remove('hidden');

                tCheck.onchange = (e) => {
                    document.getElementById('routine-template').classList.toggle('hidden', !e.target.checked);
                };

                document.getElementById('routine-template').onchange = (e) => {
                    const idx = e.target.value;
                    const t = this.routineTemplates[idx];
                    if (t) {
                        document.getElementById('work-title').value = t.title;
                        document.getElementById('work-checklist').value = (t.checklist_template || []).join('\n');
                    }
                };
            }
        } catch (e) { }
    },

    async generateRoutines() {
        try {
            const res = await API.generateRoutines(this.state.selectedDate);
            this.showToast(res.message, 'success');
            this.loadTimeline();
        } catch (e) { this.showToast(e.message, 'error'); }
    },

    async loadUsersTable() {
        // Admin User Mgmt logic...
        try {
            const res = await API.getUsers();
            const list = document.getElementById('users-table-container');
            list.innerHTML = res.users.map(u => `<div>${u.name} (${u.role})</div>`).join('');
        } catch (e) { }
    },

    openUserForm() {
        document.getElementById('modal-user-form').classList.remove('hidden');
    },

    async handleUserSubmit(e) {
        e.preventDefault();
        const username = document.getElementById('user-username').value;
        const name = document.getElementById('user-name').value;
        const role = document.getElementById('user-role').value;
        const password = document.getElementById('user-password').value;
        const phone = document.getElementById('user-phone').value;

        try {
            await API.createUser({ username, name, role, password, phone });
            this.showToast('User berhasil dibuat', 'success');
            this.closeModal('modal-user-form');
            this.loadUsersTable();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    initRequestForm() {
        document.getElementById('form-request').reset();
        // Populate staff select
        const select = document.getElementById('req-assign-to');
        if (select) {
            select.innerHTML = '';
            // Get unique staff from timeline or fetch
            // Fallback: use current timeline staff
            const staff = new Map();
            if (this.state.tasks && this.state.tasks.length > 0) {
                this.state.tasks.forEach(t => {
                    if (t.staff_id) staff.set(t.staff_id, t.staff_name);
                });
            }
            if (staff.size === 0) {
                select.innerHTML = '<option value="">No staff loaded</option>';
            } else {
                staff.forEach((name, id) => {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = name;
                    select.appendChild(opt);
                });
            }
        }
    },

    async handleRequest(e) {
        e.preventDefault();
        const title = document.getElementById('req-title').value;
        const desc = document.getElementById('req-desc').value;
        const targetId = document.getElementById('req-assign-to').value;
        const deadline = document.getElementById('req-deadline').value;

        if (!targetId) {
            this.showToast('Pilih staff tujuan', 'warning');
            return;
        }

        try {
            // Create task as request
            await API.createTask({
                title: title,
                checklist: desc ? [desc] : [], // Treat desc as checklist item or separate
                staff_id: targetId,
                category: 'Request',
                end_time: deadline || '17:00',
                start_time: new Date().toTimeString().substring(0, 5),
                task_date: this.state.selectedDate,
                kanban_status: 'todo'
            });
            this.showToast('Request berhasil dikirim', 'success');
            this.closeModal('modal-request');
            this.loadTimeline();
        } catch (error) {
            this.showToast('Gagal kirim request: ' + error.message, 'error');
        }
    }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
