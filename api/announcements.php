<?php
/**
 * Announcements Management API
 * - Admin: Create & Delete announcements
 * - All Staff: View active announcements (running text = 1 week)
 * - History: View all past announcements
 * - Acknowledge: Track "Saya Mengerti" popup dismissal per user
 */

// Configure session
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');

session_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../helpers/functions.php';

// Error handling
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

// Auth check
if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        getAnnouncements();
        break;
    case 'history':
        getAnnouncementHistory();
        break;
    case 'create':
        createAnnouncement();
        break;
    case 'delete':
        deleteAnnouncement();
        break;
    case 'acknowledge':
        acknowledgeAnnouncement();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

/**
 * Get active announcements for running text banner (within 1 WEEK)
 * Also checks if current user has acknowledged each announcement (for popup)
 */
function getAnnouncements() {
    global $db;

    $limit = (int)($_GET['limit'] ?? 10);
    if ($limit < 1) $limit = 10;
    if ($limit > 50) $limit = 50;

    $user = getCurrentUser();
    $userId = $user['id'];

    // Get announcements that are active AND less than 1 WEEK old (for running text banner)
    $stmt = $db->prepare("
        SELECT a.*, u.name as sender_name,
               (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = :uid) as is_acknowledged
        FROM announcements a 
        LEFT JOIN users u ON a.sender_id = u.id
        WHERE a.is_active = 1 
          AND a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        ORDER BY a.created_at DESC 
        LIMIT :limit
    ");
    $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    $announcements = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format dates for frontend
    foreach ($announcements as &$ann) {
        $createdAt = strtotime($ann['created_at']);
        $ann['time_formatted'] = date('H:i', $createdAt);
        $ann['date_formatted'] = date('d M Y', $createdAt);
        $ann['sender_name'] = $ann['sender_name'] ?? 'Admin';
        $ann['is_acknowledged'] = (int)$ann['is_acknowledged'] > 0;
        
        // Calculate remaining days before auto-expire from running text
        $expireAt = $createdAt + (7 * 24 * 3600); // 7 days
        $remaining = $expireAt - time();
        $ann['expires_in_days'] = max(0, round($remaining / 86400, 1));
        $ann['expires_in_hours'] = max(0, round($remaining / 3600));
    }

    jsonResponse(['success' => true, 'announcements' => $announcements]);
}

/**
 * Get ALL announcements for history/log view (paginated)
 */
function getAnnouncementHistory() {
    global $db;

    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(50, max(5, (int)($_GET['per_page'] ?? 20)));
    $offset = ($page - 1) * $perPage;

    $user = getCurrentUser();
    $userId = $user['id'];

    // Count total
    $countStmt = $db->prepare("SELECT COUNT(*) FROM announcements WHERE is_active = 1");
    $countStmt->execute();
    $total = (int)$countStmt->fetchColumn();

    // Get paginated history
    $stmt = $db->prepare("
        SELECT a.*, u.name as sender_name,
               (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id AND ar.user_id = :uid) as is_acknowledged
        FROM announcements a 
        LEFT JOIN users u ON a.sender_id = u.id
        WHERE a.is_active = 1
        ORDER BY a.created_at DESC 
        LIMIT :limit OFFSET :offset
    ");
    $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $announcements = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($announcements as &$ann) {
        $createdAt = strtotime($ann['created_at']);
        $ann['time_formatted'] = date('H:i', $createdAt);
        $ann['date_formatted'] = date('d M Y', $createdAt);
        $ann['relative_time'] = getRelativeTime($createdAt);
        $ann['sender_name'] = $ann['sender_name'] ?? 'Admin';
        $ann['is_acknowledged'] = (int)$ann['is_acknowledged'] > 0;

        // Check if still showing on running text (within 1 week)
        $ann['is_on_banner'] = (time() - $createdAt) < (7 * 24 * 3600);
    }

    jsonResponse([
        'success' => true, 
        'announcements' => $announcements,
        'pagination' => [
            'current_page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => ceil($total / $perPage)
        ]
    ]);
}

/**
 * Get relative time string (e.g. "2 jam lalu", "3 hari lalu")
 */
function getRelativeTime($timestamp) {
    $diff = time() - $timestamp;
    
    if ($diff < 60) return 'Baru saja';
    if ($diff < 3600) return floor($diff / 60) . ' menit lalu';
    if ($diff < 86400) return floor($diff / 3600) . ' jam lalu';
    if ($diff < 604800) return floor($diff / 86400) . ' hari lalu';
    if ($diff < 2592000) return floor($diff / 604800) . ' minggu lalu';
    return floor($diff / 2592000) . ' bulan lalu';
}

function createAnnouncement() {
    global $db;

    // Admin only
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }

    $user = getCurrentUser();
    if ($user['role'] !== 'Admin') {
        jsonResponse(['success' => false, 'message' => 'Hanya Admin yang dapat membuat pengumuman'], 403);
    }

    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $title = sanitize($input['title'] ?? '');
    $message = sanitize($input['message'] ?? '');
    $senderId = $user['id'];

    if (empty($title) || empty($message)) {
        jsonResponse(['success' => false, 'message' => 'Judul dan pesan wajib diisi'], 400);
    }

    if (strlen($title) > 255) {
        jsonResponse(['success' => false, 'message' => 'Judul maksimal 255 karakter'], 400);
    }

    $stmt = $db->prepare("INSERT INTO announcements (title, message, sender_id, is_active, created_at) VALUES (:title, :message, :sender_id, 1, NOW())");
    $stmt->bindValue(':title', $title, PDO::PARAM_STR);
    $stmt->bindValue(':message', $message, PDO::PARAM_STR);
    $stmt->bindValue(':sender_id', $senderId, PDO::PARAM_INT);

    if ($stmt->execute()) {
        // Send notification to all non-admin users
        $stmtUsers = $db->prepare("SELECT id FROM users WHERE role != 'Admin' AND is_active = 1");
        $stmtUsers->execute();
        $staffUsers = $stmtUsers->fetchAll(PDO::FETCH_ASSOC);
        
        foreach ($staffUsers as $staffUser) {
            createNotification(
                $staffUser['id'],
                '📢 Pengumuman: ' . $title,
                $message,
                'info',
                null
            );
        }

        jsonResponse(['success' => true, 'message' => 'Pengumuman berhasil dibuat dan dikirim ke semua staff']);
    } else {
        jsonResponse(['success' => false, 'message' => 'Gagal membuat pengumuman'], 500);
    }
}

/**
 * Acknowledge announcement (dismiss popup permanently for this user)
 */
function acknowledgeAnnouncement() {
    global $db;

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }

    verifyCSRFToken();

    $user = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    $announcementId = (int)($input['announcement_id'] ?? 0);

    if (!$announcementId) {
        jsonResponse(['success' => false, 'message' => 'ID pengumuman diperlukan'], 400);
    }

    // Ensure announcement_reads table exists (auto-create if not)
    try {
        $db->exec("
            CREATE TABLE IF NOT EXISTS announcement_reads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                announcement_id INT NOT NULL,
                user_id INT NOT NULL,
                read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_read (announcement_id, user_id),
                FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ");
    } catch (Exception $e) {
        // Table might already exist, ignore
    }

    // Insert read record (ignore duplicates)
    $stmt = $db->prepare("INSERT IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (:aid, :uid)");
    $stmt->bindValue(':aid', $announcementId, PDO::PARAM_INT);
    $stmt->bindValue(':uid', $user['id'], PDO::PARAM_INT);
    $stmt->execute();

    jsonResponse(['success' => true, 'message' => 'Pengumuman telah dikonfirmasi']);
}

function deleteAnnouncement() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    $user = getCurrentUser();
    if ($user['role'] !== 'Admin') {
        jsonResponse(['success' => false, 'message' => 'Akses ditolak'], 403);
    }
    
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'ID diperlukan'], 400);
    }
    
    // Soft delete - set is_active to 0
    $stmt = $db->prepare("UPDATE announcements SET is_active = 0 WHERE id = ?");
    $stmt->execute([(int)$id]);
    
    jsonResponse(['success' => true, 'message' => 'Pengumuman dihapus']);
}
