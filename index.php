<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#4f46e5">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <title>OfficeSync - Staff Timeline Management</title>
    <meta name="description" content="Sistem manajemen timeline kerja harian staff">
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    
    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    
    <!-- Main CSS -->
    <link rel="stylesheet" href="assets/css/style.css?v=<?php echo time(); ?>">
</head>
<body>
    <!-- Loading Screen -->
    <div id="loading-screen" class="loading-screen">
        <div class="loading-spinner"></div>
        <p>Memuat OfficeSync...</p>
    </div>

    <!-- Login Page -->
    <div id="login-page" class="login-page hidden">
        <div class="login-card">
            <div class="login-icon">
                <i data-lucide="lock"></i>
            </div>
            <h2>OfficeSync Login</h2>
            <p class="login-subtitle">Masuk untuk melihat & mengatur jadwal.</p>
            
            <form id="login-form">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="login-username" placeholder="Username (ex: fallah, admin)" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="login-password" placeholder="Password (default: 1234)" required>
                </div>
                <div id="login-error" class="error-message hidden"></div>
                <button type="submit" class="btn btn-primary btn-block">Masuk</button>
            </form>
        </div>
    </div>

    <!-- Main App -->
    <div id="main-app" class="main-app hidden">
        <!-- Header -->
        <header class="header">
            <div class="header-container">
                <div class="header-left">
                    <div class="logo">
                        <i data-lucide="briefcase"></i>
                    </div>
                    <div class="logo-text">
                        <h1>OfficeSync</h1>
                        <p>Logged: <span id="header-user-info"></span></p>
                    </div>
                </div>
                
                <div class="header-right">
                    <!-- Notifications -->
                    <div class="notification-wrapper">
                        <button id="notif-btn" class="icon-btn">
                            <i data-lucide="bell"></i>
                            <span id="notif-badge" class="badge hidden">0</span>
                        </button>
                        <div id="notif-dropdown" class="dropdown hidden">
                            <div class="dropdown-header">
                                <span>Notifikasi</span>
                                <button id="clear-notifs" class="text-btn">Clear All</button>
                            </div>
                            <div id="notif-list" class="dropdown-content">
                                <p class="empty-state">Tidak ada notifikasi</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="divider-vertical"></div>
                    
                    <!-- Admin: User Management -->
                    <button id="btn-user-management" class="btn btn-ghost hidden">
                        <i data-lucide="users"></i>
                        <span>Users</span>
                    </button>
                    
                    <!-- Generate Routines (Admin) -->
                    <button id="btn-generate-routines" class="btn btn-purple hidden">
                        <i data-lucide="refresh-cw"></i>
                        <span>Rutinitas</span>
                    </button>
                    
                    <!-- Add Work (Staff) -->
                    <button id="btn-add-work" class="btn btn-primary">
                        <i data-lucide="plus-circle"></i>
                        <span>Tambah Kerja</span>
                    </button>
                    
                    <!-- Request -->
                    <button id="btn-request" class="btn btn-outline">
                        <i data-lucide="send"></i>
                        <span>Request</span>
                    </button>
                    
                    <!-- Logout -->
                    <button id="btn-logout" class="icon-btn" title="Logout">
                        <i data-lucide="log-out"></i>
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="main-content">
            <!-- Page Header -->
            <div class="page-header">
                <div class="page-header-left">
                    <h2>Timeline Kerja</h2>
                    <div class="view-toggle">
                        <button class="toggle-btn active" data-view="all" onclick="App.setViewMode('all')">
                            <i data-lucide="users" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: text-top;"></i>
                            Semua Staff
                        </button>
                        <button class="toggle-btn" data-view="me" onclick="App.setViewMode('me')">
                            <i data-lucide="user" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: text-top;"></i>
                            Hanya Saya
                        </button>
                        <button class="toggle-btn" data-view="list" onclick="App.setViewMode('list')">
                            <i data-lucide="list" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: text-top;"></i>
                            Daftar Tugas
                        </button>
                        <button class="toggle-btn" data-view="history" onclick="App.setViewMode('history')">
                            <i data-lucide="history" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: text-top;"></i>
                            Log Pekerjaan
                        </button>
                    </div>
                    <p>Jadwal: <span id="selected-date-label"></span></p>
                    <div class="date-picker-wrapper">
                        <input type="date" id="date-picker" onclick="try{this.showPicker()}catch(e){}">
                    </div>
                </div>
                <div class="page-header-right">
                    <i data-lucide="filter"></i>
                    <select id="dept-filter">
                        <option value="All">Semua Divisi</option>
                    </select>
                </div>
            </div>

            <!-- Timeline Container -->
            <div id="timeline-container" class="timeline-container">
                <!-- Timeline will be rendered here -->
            </div>

            <!-- List View Container (Hidden by default) -->
            <div id="list-view-container" class="list-view-container hidden">
                <!-- Filters Row -->
                <div class="list-view-filters">
                    <div class="filter-group">
                        <button class="filter-chip active" data-filter="me" onclick="App.setListFilter('me', this)">Tugas Saya</button>
                        <button class="filter-chip" data-filter="all" onclick="App.setListFilter('all', this)">Semua Staff</button>
                    </div>
                    
                        <!-- New Custom Date Filter Trigger -->
                        <div class="date-filter-wrapper" style="position:relative;">
                            <button id="date-filter-btn" class="btn btn-outline btn-sm" onclick="App.toggleDateFilter()">
                                <i data-lucide="calendar"></i>
                                <span id="date-filter-label">Rentang Waktu</span>
                                <i data-lucide="chevron-down" style="width:14px; margin-left:4px;"></i>
                            </button>

                            <!-- Custom Dropdown -->
                            <div id="date-filter-dropdown" class="date-filter-dropdown hidden">
                                <div class="filter-sidebar">
                                    <button onclick="App.applyDatePreset('today')" class="preset-btn" data-preset="today">Hari Ini</button>
                                    <button onclick="App.applyDatePreset('yesterday')" class="preset-btn" data-preset="yesterday">Kemarin</button>
                                    <button onclick="App.applyDatePreset('last_7_days')" class="preset-btn" data-preset="last_7_days">7 Hari Terakhir</button>
                                    <button onclick="App.applyDatePreset('last_30_days')" class="preset-btn" data-preset="last_30_days">30 Hari Terakhir</button>
                                    <button onclick="App.applyDatePreset('month_current')" class="preset-btn" data-preset="month_current">Bulan Ini</button>
                                    <button onclick="App.applyDatePreset('month_last')" class="preset-btn" data-preset="month_last">Bulan Lalu</button>
                                    <button onclick="App.applyDatePreset('all_time')" class="preset-btn" data-preset="all_time">Semua Waktu</button>
                                </div>
                                <div class="filter-custom">
                                    <div class="custom-header">CUSTOM RANGE</div>
                                    
                                    <!-- Selected Date Display -->
                                    <div class="selected-range-display">
                                        <div class="range-item">
                                            <label>Dari</label>
                                            <span id="display-start-date">-</span>
                                        </div>
                                        <div class="range-arrow">→</div>
                                        <div class="range-item">
                                            <label>Sampai</label>
                                            <span id="display-end-date">-</span>
                                        </div>
                                    </div>

                                    <!-- Dual Calendar Widget -->
                                    <div class="dual-calendar-container">
                                        <div class="calendar-nav">
                                            <button onclick="App.calendarPrevMonth()"><i data-lucide="chevron-left"></i></button>
                                            <button onclick="App.calendarNextMonth()"><i data-lucide="chevron-right"></i></button>
                                        </div>
                                        <div class="calendars-wrapper">
                                            <div id="calendar-left" class="calendar-month"></div>
                                            <div id="calendar-right" class="calendar-month"></div>
                                        </div>
                                    </div>
                                    
                                    <div class="filter-actions-bottom">
                                         <button class="btn btn-ghost btn-xs text-danger" onclick="App.clearDateFilter()">Hapus Filter</button>
                                         <button class="btn btn-primary btn-xs" onclick="App.applyCustomDateRange()">Terapkan</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                </div>

                <!-- List Content -->
                <div id="list-view-content" class="list-view-content">
                    <!-- Tasks will be rendered here -->
                </div>
            </div>

            <!-- History View Container (Hidden by default) -->
            <div id="history-view-container" class="history-view-container hidden">
                <div class="history-view-header">
                    <h3><i data-lucide="history"></i> Riwayat Pekerjaan</h3>
                    <p class="text-muted">Tugas yang sudah selesai atau melewati deadline</p>
                </div>
                <div id="history-view-content" class="history-view-content">
                    <!-- History will be rendered here -->
                </div>
            </div>
        </main>

        <!-- Mobile Bottom Navigation (Simple Version) -->
        <nav class="mobile-bottom-nav simple-nav">
             <button class="btn btn-outline nav-btn-mobile" id="mobile-btn-request" style="flex:1; margin-right:8px;">
                <i data-lucide="send"></i>
                <span>Request</span>
            </button>

             <button class="btn btn-primary nav-btn-mobile" id="mobile-btn-add-work" style="flex:1;">
                <i data-lucide="plus-circle"></i>
                <span>Tambah Pekerjaan</span>
            </button>
        </nav>
        
        <!-- Mobile Menu Drawer (Side or Bottom) -->
        <div id="mobile-menu-drawer" class="mobile-drawer hidden">
             <div class="drawer-header">
                <h3>Menu</h3>
                <button class="drawer-close" id="close-mobile-menu"><i data-lucide="x"></i></button>
             </div>
             <div class="drawer-content">
                 <div class="user-card-drawer">
                     <div class="avatar-circle" id="drawer-avatar"></div>
                     <div class="user-details">
                         <strong id="drawer-username">User</strong>
                         <span id="drawer-role">Role</span>
                     </div>
                 </div>
                 
                 <div class="drawer-links">
                     <!-- Admin Links -->
                     <button id="mobile-btn-users" class="drawer-link hidden">
                         <i data-lucide="users"></i> Management Users
                     </button>
                     <button id="mobile-btn-routines" class="drawer-link hidden">
                         <i data-lucide="refresh-cw"></i> Generate Rutinitas
                     </button>
                     
                     <div class="drawer-divider"></div>
                     
                     <button id="mobile-btn-logout" class="drawer-link text-danger">
                         <i data-lucide="log-out"></i> Logout
                     </button>
                 </div>
             </div>
        </div>
    </div>

    <!-- Modals -->
    <div id="modal-overlay" class="modal-overlay hidden"></div>
    
    <!-- Task Detail Modal -->
    <div id="modal-task-detail" class="modal hidden">
        <div class="modal-header">
            <h3>Detail Pekerjaan</h3>
            <button class="modal-close" data-modal="modal-task-detail">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body" id="task-detail-content">
            <!-- Content loaded dynamically -->
        </div>
    </div>

    <!-- Add Work Modal -->
    <div id="modal-add-work" class="modal hidden">
        <div class="modal-header">
            <h3 id="modal-title-work">Tambah Kerja / Jobdesk Baru</h3>
            <button class="modal-close" data-modal="modal-add-work">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <form id="form-add-work">
                <div class="form-group">
                    <label>Kategori Pekerjaan</label>
                    <select id="work-category">
                        <option value="Jobdesk">Jobdesk (Rutinitas Utama)</option>
                        <option value="Tugas Tambahan">Tugas Tambahan</option>
                        <option value="Inisiatif">Inisiatif Kerjaan</option>
                    </select>
                </div>

                <div id="work-deadline-group" class="form-group hidden">
                    <label>Tanggal Deadline</label>
                    <input type="date" id="work-deadline-date">
                </div>
                
                <!-- Routine Options (for Jobdesk) -->
                <div id="routine-options" class="routine-options">
                    <label class="checkbox-label">
                        <input type="checkbox" id="work-is-routine">
                        <span>Set sebagai Rutinitas?</span>
                    </label>
                    <div id="routine-days" class="routine-days hidden">
                        <span class="label">Hari Pengerjaan:</span>
                        <div class="day-buttons">
                            <button type="button" class="day-btn" data-day="1">Sen</button>
                            <button type="button" class="day-btn" data-day="2">Sel</button>
                            <button type="button" class="day-btn" data-day="3">Rab</button>
                            <button type="button" class="day-btn" data-day="4">Kam</button>
                            <button type="button" class="day-btn" data-day="5">Jum</button>
                            <button type="button" class="day-btn" data-day="6">Sab</button>
                            <button type="button" class="day-btn" data-day="0">Min</button>
                        </div>
                    </div>
                    <div id="template-select" class="template-select hidden">
                        <label class="checkbox-label">
                            <input type="checkbox" id="use-template">
                            <span>Ambil dari Template Rutinitas?</span>
                        </label>
                        <select id="routine-template" class="hidden"></select>
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Judul Pekerjaan</label>
                    <input type="text" id="work-title" placeholder="Contoh: Meeting Evaluasi" required>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Mulai Jam</label>
                        <input type="time" id="work-start" value="09:00">
                    </div>
                    <div class="form-group">
                        <label>Selesai Jam</label>
                        <input type="time" id="work-end" value="12:00">
                    </div>
                </div>

                <div class="form-group" style="margin-top: 8px;">
                    <label class="checkbox-label" style="
                        display: flex; 
                        align-items: center; 
                        gap: 10px;
                        padding: 12px 16px; 
                        background: linear-gradient(135deg, #fff1f2 0%, #fce7f3 100%); 
                        border: 1px solid #fecdd3; 
                        border-radius: 10px;
                        cursor: pointer;
                        transition: all 0.2s;
                    ">
                        <input type="checkbox" id="work-attachment-required" style="
                            width: 18px; 
                            height: 18px; 
                            accent-color: #e11d48;
                            cursor: pointer;
                        ">
                        <span style="font-weight: 600; color: #be123c; font-size: 0.85rem;">
                            📎 Wajib Lampiran (Bukti Foto/File) untuk Selesai
                        </span>
                    </label>
                </div>

                
                <div class="form-group">
                    <label>Checklist (Enter untuk baris baru)</label>
                    <textarea id="work-checklist" rows="4" placeholder="- Siapkan data&#10;- Siapkan presentasi"></textarea>
                </div>

                <!-- Mentions/Tag Section -->
                <div class="form-group" style="margin-top: 8px;">
                    <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                        <i data-lucide="at-sign" style="width: 16px; height: 16px; color: var(--primary);"></i>
                        Tag Staff untuk Notifikasi Selesai
                        <span style="font-size: 0.75rem; color: var(--slate-500); font-weight: 400;">(Opsional)</span>
                    </label>
                    <div id="work-mentions-container" style="
                        border: 1px solid var(--slate-200);
                        border-radius: 10px;
                        padding: 12px;
                        background: var(--slate-50);
                        min-height: 40px;
                    ">
                        <div id="work-mentions-selected" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
                        <select id="work-mentions" style="
                            width: 100%;
                            padding: 8px 12px;
                            border: 1px solid var(--slate-200);
                            border-radius: 8px;
                            font-size: 0.85rem;
                        ">
                            <option value="">+ Pilih staff untuk di-tag...</option>
                        </select>
                    </div>
                    <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 6px;">
                        Staff yang di-tag akan menerima notifikasi ketika tugas ini selesai
                    </p>
                </div>
                
                <button type="submit" id="btn-submit-work" class="btn btn-primary btn-block">
                    <i data-lucide="plus-circle"></i>
                    <span>Simpan Jobdesk</span>
                </button>
            </form>
        </div>
    </div>

    <!-- Request Modal -->
    <div id="modal-request" class="modal modal-xl hidden">
        <div class="modal-header">
            <h3>Request ke Tim Lain</h3>
            <button class="modal-close" data-modal="modal-request">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="request-modal-grid">
                <!-- LEft: Form -->
                <div class="request-form-section">
                    <div class="alert alert-rose">
                        <i data-lucide="alert-circle"></i>
                        <p>Anda me-request sebagai <b id="request-from-dept"></b>. Tugas akan masuk ke antrean staff tujuan.</p>
                    </div>
                    
                    <form id="form-request">
                        <div class="form-group">
                            <label>Request Ke Siapa?</label>
                            <select id="request-to" required>
                                <option value="">Pilih Staff...</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Judul Tugas</label>
                            <input type="text" id="request-title" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Detail (Enter untuk baris baru)</label>
                            <textarea id="request-notes" rows="3"></textarea>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Tanggal Deadline</label>
                                <input type="date" id="request-date" required>
                            </div>
                            <div class="form-group">
                                <label>Jam Deadline</label>
                                <input type="time" id="request-deadline" value="17:00" required>
                            </div>
                        </div>

                        <div class="form-group" style="margin-top: 8px;">
                            <label class="checkbox-label" style="
                                display: flex; 
                                align-items: center; 
                                gap: 10px;
                                padding: 12px 16px; 
                                background: linear-gradient(135deg, #fff1f2 0%, #fce7f3 100%); 
                                border: 1px solid #fecdd3; 
                                border-radius: 10px;
                                cursor: pointer;
                                transition: all 0.2s;
                            ">
                                <input type="checkbox" id="request-attachment-required" style="
                                    width: 18px; 
                                    height: 18px; 
                                    accent-color: #e11d48;
                                    cursor: pointer;
                                ">
                                <span style="font-weight: 600; color: #be123c; font-size: 0.85rem;">
                                    📎 Wajib Lampiran untuk Selesai
                                </span>
                            </label>
                        </div>

                        <!-- Mentions/Tag Section for Request -->
                        <div class="form-group" style="margin-top: 8px;">
                            <label style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                                <i data-lucide="at-sign" style="width: 16px; height: 16px; color: var(--rose);"></i>
                                Tag Staff Lain untuk Notifikasi
                                <span style="font-size: 0.75rem; color: var(--slate-500); font-weight: 400;">(Opsional)</span>
                            </label>
                            <div id="request-mentions-container" style="
                                border: 1px solid var(--slate-200);
                                border-radius: 10px;
                                padding: 12px;
                                background: var(--slate-50);
                                min-height: 40px;
                            ">
                                <div id="request-mentions-selected" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
                                <select id="request-mentions" style="
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid var(--slate-200);
                                    border-radius: 8px;
                                    font-size: 0.85rem;
                                ">
                                    <option value="">+ Pilih staff untuk di-tag...</option>
                                </select>
                            </div>
                            <p style="font-size: 0.75rem; color: var(--slate-500); margin-top: 6px;">
                                Staff yang di-tag akan menerima notifikasi ketika request ini selesai
                            </p>
                        </div>
                        
                        <button type="submit" class="btn btn-rose btn-block">
                            <i data-lucide="send"></i>
                            <span>Kirim Request</span>
                        </button>
                    </form>
                </div>

                <!-- Right: Schedule Visual -->
                <div class="request-schedule-section">
                    <h4>Jadwal Staff Hari Ini (<span id="req-schedule-date"></span>)</h4>
                    <div id="request-staff-timeline" class="mini-timeline custom-scrollbar" style="max-height: 400px; overflow-y: auto;">
                        <p class="text-muted text-center" style="padding:20px;">Pilih staff untuk melihat jadwal</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- User Management Modal (Admin) -->
    <div id="modal-users" class="modal modal-large hidden">
        <div class="modal-header">
            <h3>Manajemen User</h3>
            <button class="modal-close" data-modal="modal-users">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <div class="users-header">
                <button id="btn-add-user" class="btn btn-primary btn-sm">
                    <i data-lucide="user-plus"></i>
                    <span>Tambah User</span>
                </button>
            </div>
            <div id="users-table-container">
                <!-- Users table rendered here -->
            </div>
        </div>
    </div>

    <!-- Add/Edit User Modal -->
    <div id="modal-user-form" class="modal modal-top hidden">
        <div class="modal-header">
            <h3 id="user-form-title">Tambah User</h3>
            <button class="modal-close" data-modal="modal-user-form">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <form id="form-user">
                <input type="hidden" id="user-id">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="user-username" required>
                </div>
                <div class="form-group">
                    <label>Password <span id="password-hint" class="text-muted">(kosongkan jika tidak ingin mengubah)</span></label>
                    <input type="password" id="user-password">
                </div>
                <div class="form-group">
                    <label>Nama</label>
                    <input type="text" id="user-name" required>
                </div>
                <div class="form-group">
                    <label>Role/Divisi</label>
                    <select id="user-role" required>
                        <option value="">Pilih Role...</option>
                        <option value="Admin">Admin</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Simpan User</button>
            </form>
        </div>
    </div>

    <!-- Add Attachment Modal -->
    <div id="modal-attachment" class="modal hidden">
        <div class="modal-header">
            <h3>Tambah Lampiran</h3>
            <button class="modal-close" data-modal="modal-attachment">
                <i data-lucide="x"></i>
            </button>
        </div>
        <div class="modal-body">
            <form id="form-attachment">
                <input type="hidden" id="att-task-id">
                <div class="form-group">
                    <label>Nama Lampiran</label>
                    <input type="text" id="att-name" placeholder="Misal: Link Google Drive" required>
                </div>
                <div class="form-group">
                    <label>URL / Link</label>
                    <input type="url" id="att-url" placeholder="https://..." required>
                </div>
                <button type="submit" class="btn btn-primary btn-block">Simpan</button>
            </form>
        </div>
    </div>

    <!-- Custom Confirm Modal -->
    <div id="modal-confirm" class="modal hidden" style="max-width:320px;">
        <div class="modal-body text-center" style="padding: 24px;">
            <div style="background:#fee2e2; width:48px; height:48px; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center; color:#ef4444;">
                <i data-lucide="alert-triangle"></i>
            </div>
            <h3 id="confirm-title" style="font-size:1.1rem; font-weight:700; color:#1e293b; margin-bottom:8px;">Konfirmasi</h3>
            <p id="confirm-msg" style="color:#64748b; font-size:0.9rem; margin-bottom:24px;">Yakin ingin melakukan ini?</p>
            <div style="display:flex; gap:12px;">
                <button id="btn-confirm-cancel" class="btn btn-outline" style="flex:1;">Batal</button>
                <button id="btn-confirm-yes" class="btn btn-danger" style="flex:1;">Ya, Hapus</button>
            </div>
        </div>
    </div>

    <!-- Notification Blocker Overlay -->
    <div id="notification-blocker" class="modal-overlay hidden" style="z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.9);">
        <div class="modal-content" style="background: white; padding: 2rem; border-radius: 12px; max-width: 400px; text-align: center;">
            <div style="width: 60px; height: 60px; background: #fee2e2; color: #ef4444; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                <i data-lucide="bell-off" style="width: 32px; height: 32px;"></i>
            </div>
            <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: #1f2937;">Notifikasi Wajib!</h2>
            <p id="notif-blocker-msg" style="color: #4b5563; margin-bottom: 1.5rem; line-height: 1.5;">
                Aplikasi ini membutuhkan notifikasi agar Anda tidak melewatkan tugas penting.
            </p>
            <button id="btn-enable-notif" class="btn btn-primary btn-block" style="width: 100%; justify-content: center;">
                <i data-lucide="bell"></i> Aktifkan Notifikasi
            </button>
            <p id="notif-denied-msg" class="hidden" style="color: #ef4444; margin-top: 1rem; font-size: 0.875rem;">
                Notifikasi diblokir browser. Mohon izinkan via pengaturan browser (icon (i) di URL bar) Pojok Kiri.
            </p>
        </div>
    </div>

    <!-- Scripts -->
    <script src="assets/js/api.js?v=<?php echo time(); ?>"></script>
    <script src="assets/js/notifications.js?v=<?php echo time(); ?>"></script>
    <script src="assets/js/app.js?v=<?php echo time(); ?>"></script>
</body>
</html>
