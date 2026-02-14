<?php
/**
 * Notes (Notepad) API
 * - All users: CRUD their own notes
 * - Visibility: private, public, shared (by department)
 */

ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');

session_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../helpers/functions.php';

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

$db = getDB();
$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':
        listNotes();
        break;
    case 'create':
        createNote();
        break;
    case 'update':
        updateNote();
        break;
    case 'delete':
        deleteNote();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

/**
 * List notes visible to the current user
 * - Own notes (all visibilities)
 * - Public notes from others
 * - Shared notes where user's dept is in shared_with_depts
 */
function listNotes() {
    global $db;
    
    $currentUser = getCurrentUser();
    $filter = $_GET['filter'] ?? 'all'; // all, mine, public, shared
    $page = max(1, intval($_GET['page'] ?? 1));
    $perPage = min(50, max(5, intval($_GET['per_page'] ?? 30)));
    $offset = ($page - 1) * $perPage;
    
    $userDept = $currentUser['role'];
    $userId = $currentUser['id'];
    
    // Build WHERE clause based on filter
    $conditions = [];
    $params = [];
    
    switch ($filter) {
        case 'mine':
            $conditions[] = "n.staff_id = ?";
            $params[] = $userId;
            break;
        case 'public':
            $conditions[] = "n.visibility = 'public'";
            break;
        case 'shared':
            $conditions[] = "n.visibility = 'shared'";
            $conditions[] = "n.staff_id != ?";
            $params[] = $userId;
            // Admin can see all shared notes; others filter by department
            if ($currentUser['role'] !== 'Admin') {
                $conditions[] = "JSON_CONTAINS(n.shared_with_depts, ?)";
                $params[] = json_encode($userDept);
            }
            break;
        default: // 'all' — show everything the user can see
            if ($currentUser['role'] === 'Admin') {
                // Admin sees everything
                $conditions[] = "(
                    n.staff_id = ? 
                    OR n.visibility = 'public' 
                    OR n.visibility = 'shared'
                )";
                $params[] = $userId;
            } else {
                $conditions[] = "(
                    n.staff_id = ? 
                    OR n.visibility = 'public' 
                    OR (n.visibility = 'shared' AND JSON_CONTAINS(n.shared_with_depts, ?))
                )";
                $params[] = $userId;
                $params[] = json_encode($userDept);
            }
            break;
    }
    
    $whereClause = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
    
    // Count total
    $countSql = "SELECT COUNT(*) as total FROM notes n $whereClause";
    $stmtCount = $db->prepare($countSql);
    $stmtCount->execute($params);
    $total = $stmtCount->fetch()['total'];
    
    // Fetch notes
    $sql = "
        SELECT n.*, u.name as author_name, u.avatar as author_avatar, u.role as author_role
        FROM notes n
        JOIN users u ON n.staff_id = u.id
        $whereClause
        ORDER BY n.updated_at DESC
        LIMIT $perPage OFFSET $offset
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format notes
    foreach ($notes as &$note) {
        $note['shared_with_depts'] = json_decode($note['shared_with_depts'], true) ?? [];
        $note['is_owner'] = ($note['staff_id'] == $userId);
        $note['created_formatted'] = date('d M Y H:i', strtotime($note['created_at']));
        $note['updated_formatted'] = date('d M Y H:i', strtotime($note['updated_at']));
        $note['time_ago'] = getRelativeTime($note['updated_at']);
    }
    
    jsonResponse([
        'success' => true,
        'notes' => $notes,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => ceil($total / $perPage)
        ]
    ]);
}

/**
 * Create a new note
 */
function createNote() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $currentUser = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    
    $title = sanitize($input['title'] ?? '');
    $content = sanitize($input['content'] ?? '');
    $visibility = $input['visibility'] ?? 'private';
    $sharedWithDepts = $input['shared_with_depts'] ?? [];
    
    // Validate
    if (empty($title)) {
        jsonResponse(['success' => false, 'message' => 'Judul catatan wajib diisi'], 400);
    }
    if (empty($content)) {
        jsonResponse(['success' => false, 'message' => 'Konten catatan wajib diisi'], 400);
    }
    if (!in_array($visibility, ['private', 'public', 'shared'])) {
        jsonResponse(['success' => false, 'message' => 'Visibilitas tidak valid'], 400);
    }
    if ($visibility === 'shared' && empty($sharedWithDepts)) {
        jsonResponse(['success' => false, 'message' => 'Pilih minimal satu divisi untuk berbagi'], 400);
    }
    
    $stmt = $db->prepare("
        INSERT INTO notes (staff_id, title, content, visibility, shared_with_depts)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $currentUser['id'],
        $title,
        $content,
        $visibility,
        $visibility === 'shared' ? json_encode($sharedWithDepts) : null
    ]);
    
    jsonResponse([
        'success' => true,
        'message' => 'Catatan berhasil disimpan',
        'note_id' => $db->lastInsertId()
    ]);
}

/**
 * Update an existing note (owner only)
 */
function updateNote() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $currentUser = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($input['id'] ?? 0);
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'ID catatan diperlukan'], 400);
    }
    
    // Check ownership
    $stmt = $db->prepare("SELECT * FROM notes WHERE id = ?");
    $stmt->execute([$id]);
    $note = $stmt->fetch();
    
    if (!$note) {
        jsonResponse(['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
    }
    if ($note['staff_id'] != $currentUser['id'] && $currentUser['role'] !== 'Admin') {
        jsonResponse(['success' => false, 'message' => 'Anda tidak memiliki akses untuk mengedit catatan ini'], 403);
    }
    
    $title = sanitize($input['title'] ?? '');
    $content = sanitize($input['content'] ?? '');
    $visibility = $input['visibility'] ?? 'private';
    $sharedWithDepts = $input['shared_with_depts'] ?? [];
    
    if (empty($title) || empty($content)) {
        jsonResponse(['success' => false, 'message' => 'Judul dan konten wajib diisi'], 400);
    }
    if (!in_array($visibility, ['private', 'public', 'shared'])) {
        jsonResponse(['success' => false, 'message' => 'Visibilitas tidak valid'], 400);
    }
    if ($visibility === 'shared' && empty($sharedWithDepts)) {
        jsonResponse(['success' => false, 'message' => 'Pilih minimal satu divisi untuk berbagi'], 400);
    }
    
    $stmt = $db->prepare("
        UPDATE notes SET title = ?, content = ?, visibility = ?, shared_with_depts = ?
        WHERE id = ?
    ");
    $stmt->execute([
        $title,
        $content,
        $visibility,
        $visibility === 'shared' ? json_encode($sharedWithDepts) : null,
        $id
    ]);
    
    jsonResponse(['success' => true, 'message' => 'Catatan berhasil diperbarui']);
}

/**
 * Delete a note (owner or Admin)
 */
function deleteNote() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $currentUser = getCurrentUser();
    $input = json_decode(file_get_contents('php://input'), true);
    
    $id = intval($input['id'] ?? 0);
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'ID catatan diperlukan'], 400);
    }
    
    $stmt = $db->prepare("SELECT staff_id FROM notes WHERE id = ?");
    $stmt->execute([$id]);
    $note = $stmt->fetch();
    
    if (!$note) {
        jsonResponse(['success' => false, 'message' => 'Catatan tidak ditemukan'], 404);
    }
    if ($note['staff_id'] != $currentUser['id'] && $currentUser['role'] !== 'Admin') {
        jsonResponse(['success' => false, 'message' => 'Tidak diizinkan'], 403);
    }
    
    $db->prepare("DELETE FROM notes WHERE id = ?")->execute([$id]);
    
    jsonResponse(['success' => true, 'message' => 'Catatan berhasil dihapus']);
}

/**
 * Helper: Relative time in Indonesian
 */
function getRelativeTime($datetime) {
    $now = new DateTime();
    $past = new DateTime($datetime);
    $diff = $now->diff($past);
    
    if ($diff->y > 0) return $diff->y . ' tahun lalu';
    if ($diff->m > 0) return $diff->m . ' bulan lalu';
    if ($diff->d > 0) return $diff->d . ' hari lalu';
    if ($diff->h > 0) return $diff->h . ' jam lalu';
    if ($diff->i > 0) return $diff->i . ' menit lalu';
    return 'Baru saja';
}
