<?php
/**
 * Application Constants
 */

// Application Info
define('APP_NAME', 'OfficeSync');
define('APP_VERSION', '1.0.0');

// Set Timezone to Indonesia/Jakarta (WIB)
date_default_timezone_set('Asia/Jakarta');

// Departments
define('DEPARTMENTS', [
    'Advertiser',
    'Design Grafis',
    'Marketplace',
    'Customer Service',
    'Konten Video',
    'Admin Order',
    'HR',
    'Finance',
    'Gudang',
    'Affiliate',
    'Tech/Programmer'
]);

// Task Categories
define('TASK_CATEGORIES', [
    'Jobdesk',
    'Tugas Tambahan',
    'Inisiatif',
    'Request'
]);

// Task Statuses
define('TASK_STATUSES', [
    'todo' => 'To Do',
    'in-progress' => 'In Progress',
    'done' => 'Done'
]);

// Days Label (Indonesian)
define('DAYS_LABEL', [
    0 => 'Minggu',
    1 => 'Senin',
    2 => 'Selasa',
    3 => 'Rabu',
    4 => 'Kamis',
    5 => 'Jumat',
    6 => 'Sabtu'
]);

// Notification Types
define('NOTIFICATION_TYPES', [
    'info',
    'warning',
    'success',
    'error',
    'deadline',
    'transition',
    'request'
]);

// Notification Settings
define('DEADLINE_NOTIFY_BEFORE_MINUTES', 5);
define('TRANSITION_NOTIFY_BEFORE_MINUTES', 5);
