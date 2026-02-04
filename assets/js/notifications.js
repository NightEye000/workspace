/**
 * Browser Notifications Handler
 * Handles Chrome/Browser notifications for deadlines and transitions
 */

const NotificationManager = {
    permissionGranted: false,
    checkInterval: null,
    fetchInterval: null,
    lastCheck: null,

    /**
     * Initialize notification system
     */
    async init() {
        console.log('[NotificationManager] Initializing...');

        // Request permission
        const granted = await this.requestPermission();

        if (granted) {
            console.log('[NotificationManager] ✅ Permission granted');
            App.showToast('Notifikasi browser diaktifkan', 'success');
        } else {
            console.log('[NotificationManager] ❌ Permission denied');
            App.showToast('Notifikasi browser diblokir. Klik icon 🔒 di address bar untuk mengaktifkan.', 'warning', 5000);
        }

        // Start deadline checker (every 30 seconds for more responsive alerts)
        this.startDeadlineChecker();

        // Start notification fetcher (every 10 seconds)
        this.startNotificationFetcher();

        console.log('[NotificationManager] Initialized - checking every 30 seconds');
    },

    /**
     * Request browser notification permission
     */
    async requestPermission() {
        if (!("Notification" in window)) {
            console.warn('[NotificationManager] Browser does not support notifications');
            return false;
        }

        if (Notification.permission === "granted") {
            this.permissionGranted = true;
            return true;
        }

        if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            this.permissionGranted = permission === "granted";
            return this.permissionGranted;
        }

        return false;
    },

    /**
     * Send browser notification
     */
    sendNotification(title, body, options = {}) {
        if (!this.permissionGranted) {
            console.warn('[NotificationManager] Permission not granted');
            return null;
        }

        const defaultOptions = {
            icon: 'assets/images/logo.png',
            badge: 'assets/images/badge.png',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            tag: options.tag || 'officesync-' + Date.now(),
            ...options
        };

        try {
            const notification = new Notification(title, {
                body,
                ...defaultOptions
            });

            notification.onclick = function () {
                window.focus();
                notification.close();
                if (options.onClick) {
                    options.onClick();
                }
            };

            // Auto close after 10 seconds if not interacted
            setTimeout(() => notification.close(), 10000);

            return notification;
        } catch (error) {
            console.error('[NotificationManager] Error sending notification:', error);
            return null;
        }
    },

    /**
     * Start deadline checker loop
     * Checks every 60 seconds for upcoming deadlines
     */
    startDeadlineChecker() {
        // Clear existing interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Check immediately
        this.checkDeadlines();

        // Then check every 30 seconds (more responsive)
        this.checkInterval = setInterval(() => {
            this.checkDeadlines();
        }, 30000);
    },

    /**
     * Check for deadline and transition alerts
     */
    async checkDeadlines() {
        try {
            this.lastCheck = new Date().toLocaleTimeString();
            console.log('[NotificationManager] Checking deadlines at', this.lastCheck);

            const result = await API.checkDeadlines();

            if (result.success && result.alerts) {
                const deadlineCount = result.alerts.deadline_alerts?.length || 0;
                const transitionCount = result.alerts.transition_alerts?.length || 0;

                console.log(`[NotificationManager] Found ${deadlineCount} deadline alerts, ${transitionCount} transition alerts`);

                // Process deadline alerts
                (result.alerts.deadline_alerts || []).forEach(alert => {
                    console.log('[NotificationManager] 🔔 Deadline alert:', alert.title);
                    this.sendNotification(
                        '⏰ Deadline Mendekati!',
                        alert.message,
                        {
                            tag: `deadline-${alert.task_id}`,
                            onClick: () => {
                                if (typeof App !== 'undefined' && App.openTaskDetail) {
                                    App.openTaskDetail(alert.task_id);
                                }
                            }
                        }
                    );

                    // Also show as toast for immediate feedback
                    if (typeof App !== 'undefined') {
                        App.showToast(alert.message, 'warning', 5000);
                    }
                });

                // Process transition alerts
                (result.alerts.transition_alerts || []).forEach(alert => {
                    console.log('[NotificationManager] 🔄 Transition alert:', alert.next_task);
                    this.sendNotification(
                        '🔄 Pekerjaan Selanjutnya',
                        alert.message,
                        {
                            tag: `transition-${alert.next_task}`,
                        }
                    );

                    // Also show as toast
                    if (typeof App !== 'undefined') {
                        App.showToast(alert.message, 'info', 5000);
                    }
                });
            }
        } catch (error) {
            console.error('[NotificationManager] Error checking deadlines:', error);
        }
    },

    /**
     * Start notification fetcher loop
     * Fetches pending browser notifications from server
     */
    startNotificationFetcher() {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
        }

        // Fetch every 10 seconds
        this.fetchInterval = setInterval(() => {
            this.fetchPendingNotifications();
        }, 10000);
    },

    /**
     * Fetch and display pending browser notifications
     */
    async fetchPendingNotifications() {
        try {
            const result = await API.getPendingBrowserNotifications();

            if (result.success && result.notifications) {
                result.notifications.forEach(notif => {
                    // Map notification type to icon
                    const icons = {
                        'success': '✅',
                        'warning': '⚠️',
                        'deadline': '⏰',
                        'transition': '🔄',
                        'request': '📨',
                        'info': 'ℹ️'
                    };

                    const icon = icons[notif.type] || 'ℹ️';

                    this.sendNotification(
                        `${icon} ${notif.title}`,
                        notif.message,
                        {
                            tag: `notif-${notif.id}`,
                            onClick: () => {
                                if (notif.task_id && typeof App !== 'undefined' && App.openTaskDetail) {
                                    App.openTaskDetail(notif.task_id);
                                }
                            }
                        }
                    );
                });

                // Update badge
                if (typeof App !== 'undefined' && App.updateNotificationBadge) {
                    App.updateNotificationBadge();
                }
            }
        } catch (error) {
            // Silently fail for background fetches
        }
    },

    /**
     * Stop all intervals
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    },

    /**
     * Test notification - for debugging
     */
    testNotification() {
        console.log('[NotificationManager] Testing notification...');
        console.log('[NotificationManager] Permission status:', Notification.permission);
        console.log('[NotificationManager] permissionGranted:', this.permissionGranted);

        if (!this.permissionGranted) {
            App.showToast('Browser notification tidak diizinkan. Cek icon 🔒 di address bar.', 'error');
            return;
        }

        const notif = this.sendNotification(
            '🧪 Test Notifikasi',
            'Jika Anda melihat ini, notifikasi browser berfungsi!',
            { tag: 'test-' + Date.now() }
        );

        if (notif) {
            App.showToast('Notifikasi test dikirim! Cek desktop Anda.', 'success');
        } else {
            App.showToast('Gagal mengirim notifikasi', 'error');
        }
    },

    /**
     * Force check deadlines now
     */
    forceCheck() {
        console.log('[NotificationManager] Force checking deadlines...');
        this.checkDeadlines();
        App.showToast('Mengecek deadline...', 'info');
    },

    /**
     * Get status info
     */
    getStatus() {
        return {
            permissionGranted: this.permissionGranted,
            browserPermission: Notification.permission,
            lastCheck: this.lastCheck,
            checkIntervalActive: this.checkInterval !== null,
            fetchIntervalActive: this.fetchInterval !== null
        };
    }
};

// Export
window.NotificationManager = NotificationManager;
