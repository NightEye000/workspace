<?php
/**
 * User Management API (Admin Only for most operations)
 */

// Configure session before starting
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');

session_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../helpers/functions.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Departments doesn't require auth (needed for user form)
if ($action === 'departments') {
    getDepartments();
    exit;
}

// All other actions require authentication
if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

switch ($action) {
    case 'list':
        getUsers();
        break;
    case 'get':
        getUser();
        break;
    case 'create':
        createUser();
        break;
    case 'update':
        updateUser();
        break;
    case 'delete':
        deleteUser();
        break;
    case 'toggle_status':
        toggleUserStatus();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function getUsers() {
    $db = getDB();
    $currentUser = getCurrentUser();
    
    $department = $_GET['department'] ?? '';
    $excludeAdmin = isset($_GET['exclude_admin']) && $_GET['exclude_admin'] === 'true';
    
    $sql = "SELECT id, username, name, role, gender, avatar, is_active, created_at FROM users WHERE 1=1";
    $params = [];
    
    if ($excludeAdmin) {
        $sql .= " AND role != 'Admin'";
    }
    
    if (!empty($department) && $department !== 'All') {
        $sql .= " AND role = ?";
        $params[] = $department;
    }
    
    $sql .= " ORDER BY role, name";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    
    jsonResponse(['success' => true, 'users' => $users]);
}

function getUser() {
    $id = $_GET['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'User ID required'], 400);
    }
    
    // Non-admin can only view themselves
    if (!isAdmin() && $id != getCurrentUser()['id']) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT id, username, name, role, gender, avatar, is_active, created_at FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'User not found'], 404);
    }
    
    jsonResponse(['success' => true, 'user' => $user]);
}

function createUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    // Only admin can create users
    if (!isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied. Admin only.'], 403);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $username = sanitize($input['username'] ?? '');
    $password = $input['password'] ?? '';
    $name = sanitize($input['name'] ?? '');
    $role = sanitize($input['role'] ?? '');
    $gender = sanitize($input['gender'] ?? 'Laki-laki');
    
    // Validation
    if (empty($username) || empty($password) || empty($name) || empty($role)) {
        jsonResponse(['success' => false, 'message' => 'Semua field wajib diisi'], 400);
    }
    
    if (!in_array($role, array_merge(['Admin'], DEPARTMENTS))) {
        jsonResponse(['success' => false, 'message' => 'Role tidak valid'], 400);
    }
    
    if (strlen($password) < 4) {
        jsonResponse(['success' => false, 'message' => 'Password minimal 4 karakter'], 400);
    }
    
    $db = getDB();
    
    // Check username exists
    $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Username sudah digunakan'], 400);
    }
    
    // Create user
    $hashedPassword = hashPassword($password);
    $avatar = generateAvatar($name, $gender);
    
    $stmt = $db->prepare("INSERT INTO users (username, password, name, role, gender, avatar) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$username, $hashedPassword, $name, $role, $gender, $avatar]);
    
    $newId = $db->lastInsertId();
    
    jsonResponse([
        'success' => true, 
        'message' => 'User berhasil dibuat',
        'user_id' => $newId
    ]);
}

function updateUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    // Verify CSRF Token
    verifyCSRFToken();

    // Handle Content-Type for JSON vs Multipart
    $contentType = $_SERVER["CONTENT_TYPE"] ?? '';
    if (strpos($contentType, 'application/json') !== false) {
        $input = json_decode(file_get_contents('php://input'), true);
    } else {
        $input = $_POST;
    }
    
    $id = $input['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'User ID required'], 400);
    }
    
    $currentUser = getCurrentUser();
    $isAdminUser = isAdmin();
    
    // Non-admin can only update themselves
    if (!$isAdminUser && $id != $currentUser['id']) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $name = sanitize($input['name'] ?? '');
    $role = sanitize($input['role'] ?? '');
    $username = sanitize($input['username'] ?? ''); // Allow updating username
    $password = $input['password'] ?? '';
    
    if (empty($name)) {
        jsonResponse(['success' => false, 'message' => 'Nama wajib diisi'], 400);
    }

    if (empty($username)) {
        jsonResponse(['success' => false, 'message' => 'Username wajib diisi'], 400);
    }
    
    $db = getDB();

    // Check username uniqueness if changed
    $stmt = $db->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
    $stmt->execute([$username, $id]);
    if ($stmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Username sudah digunakan'], 400);
    }
    
    // START UPDATE QUERY BUILD
    $sql = "UPDATE users SET name = ?, username = ?, gender = ?";
    $gender = sanitize($input['gender'] ?? 'Laki-laki');
    $params = [$name, $username, $gender];

    // Handle Avatar Logic for Gender Change
    // We only regenerate avatar if it looks like a default DiceBear avatar OR if Gender has changed (force update)
    // If user uploaded a custom one (starts with 'uploads/'), we keep it UNLESS gender changed.
    // Also, if a new file is uploaded, that takes precedence.
    $stmt = $db->prepare("SELECT gender, avatar FROM users WHERE id = ?");
    $stmt->execute([$id]);
    $currentUserData = $stmt->fetch();
    $currentGender = $currentUserData['gender'];
    $currentAvatar = $currentUserData['avatar'];

    $newAvatarPath = null;
    
    // 1. Check File Upload
    if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
        try {
            $newAvatarPath = handleFileUpload($_FILES['avatar'], 'avatars');
        } catch (Exception $e) {
            jsonResponse(['success' => false, 'message' => $e->getMessage()], 400);
        }
    } 
    // 2. Automatic Logic
    else {
        $genderChanged = ($gender !== $currentGender);
        $isDiceBear = (strpos($currentAvatar, 'dicebear') !== false);
        
        // Regenerate if:
        // - Gender changed (Must update specific gender traits)
        // - OR It's already a DiceBear avatar (Update seed/name)
        if ($genderChanged || $isDiceBear) {
            $newAvatarPath = generateAvatar($name, $gender);
        }
    }

    if ($newAvatarPath) {
        $sql .= ", avatar = ?";
        $params[] = $newAvatarPath;
    }

    if ($isAdminUser && !empty($role)) {
        if (!in_array($role, array_merge(['Admin'], DEPARTMENTS))) {
            jsonResponse(['success' => false, 'message' => 'Role tidak valid'], 400);
        }
        $sql .= ", role = ?";
        $params[] = $role;
    } 
    
    // Password update if provided
    if (!empty($password)) {
        if (strlen($password) < 4) {
            jsonResponse(['success' => false, 'message' => 'Password minimal 4 karakter'], 400);
        }
        $sql .= ", password = ?";
        $params[] = hashPassword($password);
    }
    
    $sql .= " WHERE id = ?";
    $params[] = $id;
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    // Update session if updating self
    if ($id == $currentUser['id']) {
        $stmt = $db->prepare("SELECT id, username, name, role, avatar, is_active FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $_SESSION['user'] = $stmt->fetch();
    }
    
    jsonResponse(['success' => true, 'message' => 'User berhasil diupdate']);
}

function deleteUser() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    if (!isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied. Admin only.'], 403);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'User ID required'], 400);
    }
    
    // Cannot delete self
    if ($id == getCurrentUser()['id']) {
        jsonResponse(['success' => false, 'message' => 'Tidak bisa menghapus akun sendiri'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("DELETE FROM users WHERE id = ?");
    $stmt->execute([$id]);
    
    jsonResponse(['success' => true, 'message' => 'User berhasil dihapus']);
}

function toggleUserStatus() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    if (!isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied. Admin only.'], 403);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'User ID required'], 400);
    }
    
    // Cannot deactivate self
    if ($id == getCurrentUser()['id']) {
        jsonResponse(['success' => false, 'message' => 'Tidak bisa menonaktifkan akun sendiri'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("UPDATE users SET is_active = NOT is_active WHERE id = ?");
    $stmt->execute([$id]);
    
    jsonResponse(['success' => true, 'message' => 'Status user berhasil diubah']);
}

function getDepartments() {
    jsonResponse(['success' => true, 'departments' => DEPARTMENTS]);
}


