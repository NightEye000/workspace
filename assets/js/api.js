/**
 * API Helper Functions
 */

const API = {
    baseUrl: 'api',
    csrfToken: null,

    setCSRFToken(token) {
        this.csrfToken = token;
    },

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}/${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }

        const config = {
            headers,
            credentials: 'include', // Important: Include cookies for session
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // Auth
    async login(username, password) {
        return this.request('auth.php?action=login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async logout() {
        return this.request('auth.php?action=logout', {
            method: 'POST'
        });
    },

    async checkAuth() {
        return this.request('auth.php?action=check');
    },

    // Users
    async getUsers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`users.php?action=list&${query}`);
    },

    async getUser(id) {
        return this.request(`users.php?action=get&id=${id}`);
    },

    async createUser(data) {
        return this.request('users.php?action=create', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateUser(data) {
        return this.request('users.php?action=update', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async deleteUser(id) {
        return this.request('users.php?action=delete', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    },

    async toggleUserStatus(id) {
        return this.request('users.php?action=toggle_status', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    },

    async getDepartments() {
        return this.request('users.php?action=departments');
    },

    // Tasks
    async getTasks(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`tasks.php?action=list&${query}`);
    },

    async getTask(id) {
        return this.request(`tasks.php?action=get&id=${id}`);
    },

    async createTask(data) {
        return this.request('tasks.php?action=create', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateTask(data) {
        return this.request('tasks.php?action=update', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateTaskStatus(id, status) {
        return this.request('tasks.php?action=update_status', {
            method: 'POST',
            body: JSON.stringify({ id, status })
        });
    },

    async deleteTask(id) {
        return this.request('tasks.php?action=delete', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    },

    async toggleChecklist(itemId) {
        return this.request('tasks.php?action=toggle_checklist', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId })
        });
    },

    async generateRoutines(date) {
        return this.request('tasks.php?action=generate_routines', {
            method: 'POST',
            body: JSON.stringify({ date })
        });
    },

    async getStaffPerformance(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`tasks.php?action=staff_performance&${query}`);
    },

    // Comments & Attachments
    async addComment(taskId, text) {
        return this.request('comments.php?action=add_comment', {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, text })
        });
    },

    async addAttachment(taskId, name, url) {
        return this.request('comments.php?action=add_attachment', {
            method: 'POST',
            body: JSON.stringify({ task_id: taskId, name, url })
        });
    },

    async deleteAttachment(attachmentId) {
        return this.request('comments.php?action=delete_attachment', {
            method: 'POST',
            body: JSON.stringify({ id: attachmentId })
        });
    },

    // Notifications
    async getNotifications(limit = 50) {
        return this.request(`notifications.php?action=list&limit=${limit}`);
    },

    async getUnreadCount() {
        return this.request('notifications.php?action=unread_count');
    },

    async markAllRead() {
        return this.request('notifications.php?action=mark_all_read', {
            method: 'POST'
        });
    },

    async markRead(id) {
        return this.request('notifications.php?action=mark_read', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    },

    async clearNotifications() {
        return this.request('notifications.php?action=clear', {
            method: 'POST'
        });
    },

    async getPendingBrowserNotifications() {
        return this.request('notifications.php?action=pending_browser');
    },

    async checkDeadlines() {
        return this.request('notifications.php?action=check_deadlines');
    },

    // Routine Templates
    async getRoutineTemplates(department = '') {
        return this.request(`routines.php?action=list&department=${department}`);
    },

    // Work History
    async getWorkHistory(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`history.php?action=list&${query}`);
    },

    // Announcements
    async getAnnouncements(limit = 10) {
        return this.request(`announcements.php?action=list&limit=${limit}`);
    },

    async createAnnouncement(data) {
        return this.request('announcements.php?action=create', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async deleteAnnouncement(id) {
        return this.request('announcements.php?action=delete', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    },

    async getAnnouncementHistory(page = 1, perPage = 20) {
        return this.request(`announcements.php?action=history&page=${page}&per_page=${perPage}`);
    },

    async acknowledgeAnnouncement(announcementId) {
        return this.request('announcements.php?action=acknowledge', {
            method: 'POST',
            body: JSON.stringify({ announcement_id: announcementId })
        });
    },

    // ========== NOTES / NOTEPAD ==========

    async getNotes(filter = 'all', page = 1) {
        return this.request(`notes.php?action=list&filter=${filter}&page=${page}`);
    },

    async createNote(data) {
        return this.request('notes.php?action=create', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateNote(data) {
        return this.request('notes.php?action=update', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async deleteNote(id) {
        return this.request('notes.php?action=delete', {
            method: 'POST',
            body: JSON.stringify({ id })
        });
    }
};

// Export for use in other modules
window.API = API;
