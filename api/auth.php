<?php
/**
 * Authentication API
 */

// Configure session before starting
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');

session_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/functions.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check':
        checkAuth();
        break;
    case 'update_password':
        updatePassword();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function handleLogin() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $username = sanitize($input['username'] ?? '');
    $password = $input['password'] ?? '';
    
    if (empty($username) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Username dan password harus diisi'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE username = ? AND is_active = 1");
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'Username tidak ditemukan'], 401);
    }
    
    if (!verifyPassword($password, $user['password'])) {
        jsonResponse(['success' => false, 'message' => 'Password salah'], 401);
    }
    
    // Remove password from session data
    unset($user['password']);
    
    $_SESSION['user'] = $user;
    $_SESSION['login_time'] = time();
    
    jsonResponse([
        'success' => true, 
        'message' => 'Login berhasil', 
        'user' => $user,
        'csrf_token' => generateCSRFToken()
    ]);
}

function handleLogout() {
    session_destroy();
    jsonResponse(['success' => true, 'message' => 'Logout berhasil']);
}

function checkAuth() {
    $user = getCurrentUser();
    if ($user) {
        jsonResponse([
            'success' => true, 
            'loggedIn' => true, 
            'user' => $user,
            'csrf_token' => getCSRFToken()
        ]);
    } else {
        jsonResponse(['success' => true, 'loggedIn' => false]);
    }
}

function updatePassword() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    $user = getCurrentUser();
    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $oldPassword = $input['old_password'] ?? '';
    $newPassword = $input['new_password'] ?? '';
    
    if (empty($oldPassword) || empty($newPassword)) {
        jsonResponse(['success' => false, 'message' => 'Password lama dan baru harus diisi'], 400);
    }
    
    if (strlen($newPassword) < 4) {
        jsonResponse(['success' => false, 'message' => 'Password minimal 4 karakter'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT password FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $currentHash = $stmt->fetchColumn();
    
    if (!verifyPassword($oldPassword, $currentHash)) {
        jsonResponse(['success' => false, 'message' => 'Password lama salah'], 400);
    }
    
    $newHash = hashPassword($newPassword);
    $stmt = $db->prepare("UPDATE users SET password = ? WHERE id = ?");
    $stmt->execute([$newHash, $user['id']]);
    
    jsonResponse(['success' => true, 'message' => 'Password berhasil diubah']);
}
