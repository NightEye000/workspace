-- =====================================================
-- Staff Timeline Management System - Database Setup
-- =====================================================

-- Create Database
CREATE DATABASE IF NOT EXISTS workspace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE workspace;

-- =====================================================
-- 1. USERS TABLE (LEVEL 1 - Tidak butuh tabel lain)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role ENUM('Admin', 'Advertiser', 'Design Grafis', 'Marketplace', 'Customer Service', 
              'Konten Video', 'Admin Order', 'HR', 'Finance', 'Gudang', 'Affiliate', 'Tech/Programmer') NOT NULL,
    gender ENUM('Laki-laki', 'Perempuan') NOT NULL DEFAULT 'Laki-laki',
    avatar VARCHAR(255) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. ROUTINE TEMPLATES TABLE (LEVEL 1 - Dipindah ke ATAS)
-- =====================================================
-- Tabel ini harus ada DULUAN sebelum Tasks
CREATE TABLE IF NOT EXISTS routine_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    department VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    duration_hours DECIMAL(3,1) DEFAULT 1.0,
    routine_days JSON DEFAULT NULL,
    checklist_template JSON DEFAULT NULL,
    default_start_time TIME DEFAULT '09:00:00',
    start_date DATE DEFAULT NULL, -- Tambahan agar kompatibel dengan logika baru
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_department (department)
);

-- =====================================================
-- 3. DAILY WORK (TASKS) TABLE (LEVEL 2 - Butuh Users & Templates)
-- =====================================================
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    routine_template_id INT DEFAULT NULL, -- PERBAIKAN: Harus boleh NULL untuk tugas manual
    title VARCHAR(255) NOT NULL,
    category ENUM('Jobdesk', 'Tugas Tambahan', 'Inisiatif', 'Request') DEFAULT 'Jobdesk',
    source_dept VARCHAR(100) DEFAULT NULL,
    status ENUM('todo', 'in-progress', 'done') DEFAULT 'todo',
    task_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_routine TINYINT(1) DEFAULT 0,
    routine_days JSON DEFAULT NULL,
    attachment_required TINYINT(1) DEFAULT 0, -- Tambahan agar kompatibel dengan logika baru
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Foreign Keys
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (routine_template_id) REFERENCES routine_templates(id) ON DELETE SET NULL,
    -- Indexes
    INDEX idx_staff_date (staff_id, task_date),
    INDEX idx_date (task_date),
    INDEX idx_template (routine_template_id) -- Index baru untuk performa update massal
);

-- =====================================================
-- 4. CHECKLIST ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    text VARCHAR(500) NOT NULL,
    is_done TINYINT(1) DEFAULT 0,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- =====================================================
-- 5. COMMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- 6. ATTACHMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS attachments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    type ENUM('link', 'file') DEFAULT 'link',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- =====================================================
-- 7. NOTIFICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'warning', 'success', 'error', 'deadline', 'transition', 'request', 'mention', 'completed') DEFAULT 'info',
    task_id INT DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    is_browser_sent TINYINT(1) DEFAULT 0,
    scheduled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_scheduled (scheduled_at, is_browser_sent)
);

-- =====================================================
-- 8. TASK MENTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS task_mentions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    notified_on_complete TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_mention (task_id, user_id),
    INDEX idx_user (user_id)
);

-- =====================================================
-- 9. REQUEST LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS request_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    from_user_id INT NOT NULL,
    to_user_id INT NOT NULL,
    status ENUM('pending', 'accepted', 'rejected', 'completed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- 10. ANNOUNCEMENTS TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    sender_id INT NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- 11. ANNOUNCEMENT READS TABLE (Track popup dismissal)
-- =====================================================
CREATE TABLE IF NOT EXISTS announcement_reads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_read (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- INSERT DEFAULT DATA
-- =====================================================
INSERT INTO users (username, password, name, role, avatar) VALUES
('admin', '$2y$10$ogKlOoKzQQddV5X9InNUMeY6ud5g.Twb8GitVUvJDC0cJLEHL/vQ2', 'Super Admin', 'Admin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin');

-- =====================================================
-- HELPFUL VIEWS
-- =====================================================

-- =============================================
-- NOTES TABLE (Notepad Feature)
-- =============================================
CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    visibility ENUM('private', 'public', 'shared') DEFAULT 'private',
    shared_with_depts JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW v_tasks_detail AS
SELECT 
    t.*,
    u.name as staff_name,
    u.role as staff_role,
    u.avatar as staff_avatar,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id) as total_checklist,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id AND ci.is_done = 1) as done_checklist
FROM tasks t
JOIN users u ON t.staff_id = u.id;

CREATE OR REPLACE VIEW v_staff_performance AS
SELECT 
    u.id,
    u.name,
    u.role,
    u.avatar,
    t.task_date,
    COUNT(t.id) as total_tasks,
    SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_tasks,
    ROUND(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) / COUNT(t.id) * 100, 2) as performance_percent
FROM users u
LEFT JOIN tasks t ON u.id = t.staff_id
WHERE u.role != 'Admin'
GROUP BY u.id, t.task_date;