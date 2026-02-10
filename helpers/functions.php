<?php
/**
 * Helper Functions
 */

/**
 * Send JSON Response
 */
function jsonResponse($data, $statusCode = 200) {
    if (!headers_sent()) {
        http_response_code($statusCode);
        header('Content-Type: application/json');
    }
    echo json_encode($data);
    exit;
}

// Global Exception Handler
set_exception_handler(function ($e) {
    error_log("Unhandled Exception: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());
    jsonResponse([
        'success' => false,
        'message' => 'Internal Server Error: ' . $e->getMessage(),
        'error_type' => get_class($e)
    ], 500);
});

// Global Error Handler
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    
    error_log("PHP Error [$errno]: $errstr in $errfile:$errline");
    
    // For fatal-like errors, return JSON
    if (in_array($errno, [E_ERROR, E_USER_ERROR, E_RECOVERABLE_ERROR])) {
        jsonResponse([
            'success' => false,
            'message' => "Fatal Error: $errstr",
            'file' => basename($errfile),
            'line' => $errline
        ], 500);
    }
    return false;
});

// Register shutdown function for fatal errors not caught by error handler
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error !== NULL && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log("Fatal Shutdown Error: " . $error['message']);
        jsonResponse([
            'success' => false,
            'message' => 'Fatal Execution Error: ' . $error['message'],
            'type' => $error['type']
        ], 500);
    }
});

/**
 * Hash Password
 */
function hashPassword($password) {
    return password_hash($password, PASSWORD_DEFAULT);
}

/**
 * Verify Password
 */
function verifyPassword($password, $hash) {
    return password_verify($password, $hash);
}

/**
 * Generate Avatar URL
 */
/**
 * Generate Avatar URL
 * @param string $seed Name seed
 * @param string $gender 'Laki-laki' or 'Perempuan'
 */
function generateAvatar($seed, $gender = 'Laki-laki') {
    // Local Avatar Logic (Group 1-6)
    // Male (Laki-laki) -> Odd (1, 3, 5)
    // Female (Perempuan) -> Even (2, 4, 6)
    
    if ($gender === 'Perempuan') {
        $options = [2, 4, 6];
    } else {
        $options = [1, 3, 5];
    }
    
    // Pick random index
    $randIndex = array_rand($options);
    $num = $options[$randIndex];
    
    // Return relative path from web root
    return 'assets/images/Group ' . $num . '.png';
}

/**
 * Sanitize Input
 * Note: We only trim here. HTML escaping is done on the frontend at render time
 * to prevent double-escaping issues. SQL injection is prevented by using PDO prepared statements.
 */
function sanitize($input) {
    if (is_array($input)) {
        return array_map('sanitize', $input);
    }
    return trim($input);
}

/**
 * Get Current User from Session
 */
function getCurrentUser() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return $_SESSION['user'] ?? null;
}

/**
 * Check if User is Admin
 */
function isAdmin() {
    $user = getCurrentUser();
    return $user && $user['role'] === 'Admin';
}

/**
 * Check if User is Logged In
 */
function isLoggedIn() {
    return getCurrentUser() !== null;
}

/**
 * Check Access Permission
 * Admin can access all, Staff can only access their own data
 */
function canAccessStaff($staffId) {
    $user = getCurrentUser();
    if (!$user) return false;
    if ($user['role'] === 'Admin') return true;
    return $user['id'] == $staffId;
}

/**
 * Format Time to HH:MM
 */
function formatTime($time) {
    return date('H:i', strtotime($time));
}

/**
 * Format Date to Indonesian
 */
function formatDateIndonesian($date) {
    $days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    $months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
               'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    $timestamp = strtotime($date);
    $dayIndex = date('w', $timestamp);
    $day = date('d', $timestamp);
    $monthIndex = (int)date('m', $timestamp);
    $year = date('Y', $timestamp);
    
    return $days[$dayIndex] . ', ' . $day . ' ' . $months[$monthIndex] . ' ' . $year;
}

/**
 * Calculate Minutes Until Time
 */
function minutesUntil($targetTime, $baseTime = null) {
    $base = $baseTime ? strtotime($baseTime) : time();
    $target = strtotime($targetTime);
    return round(($target - $base) / 60);
}

/**
 * Get Day Name from Index
 */
function getDayName($index) {
    $days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    return $days[$index] ?? '';
}

/**
 * Generate Unique ID
 */
function generateUID($prefix = '') {
    return $prefix . uniqid() . bin2hex(random_bytes(4));
}

/**
 * Log Activity (for debugging)
 */
function logActivity($message, $data = []) {
    $logFile = __DIR__ . '/../logs/activity.log';
    $logDir = dirname($logFile);
    
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    
    $entry = date('Y-m-d H:i:s') . ' - ' . $message;
    if (!empty($data)) {
        $entry .= ' - ' . json_encode($data);
    }
    $entry .= PHP_EOL;
    
    file_put_contents($logFile, $entry, FILE_APPEND);
}

/**
 * Generate CSRF Token
 */
function generateCSRFToken() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

/**
 * Get CSRF Token
 */
function getCSRFToken() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return $_SESSION['csrf_token'] ?? generateCSRFToken();
}

/**
 * Verify CSRF Token
 */
function verifyCSRFToken() {
    // Fallback for non-Apache servers (nginx, etc.)
    $headers = [];
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
    } else {
        // Manual header extraction for non-Apache
        foreach ($_SERVER as $key => $value) {
            if (substr($key, 0, 5) === 'HTTP_') {
                $headerKey = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
                $headers[$headerKey] = $value;
            }
        }
    }
    
    $token = $headers['X-Csrf-Token'] ?? $headers['X-CSRF-Token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    
    if (empty($token) || $token !== getCSRFToken()) {
        jsonResponse(['success' => false, 'message' => 'Invalid CSRF Token'], 403);
    }
}

/**
 * Create Notification
 */
function createNotification($userId, $title, $message, $type = 'info', $taskId = null) {
    $db = getDB();
    $stmt = $db->prepare("INSERT INTO notifications (user_id, title, message, type, task_id) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$userId, $title, $message, $type, $taskId]);
    return $db->lastInsertId();
}

/**
 * Handle File Upload
 * @param array $file $_FILES['input_name']
 * @param string $subDir Subdirectory in uploads folder
 * @return string Relative path to file (e.g., helpers/../uploads/filename.jpg)
 * @throws Exception
 */
function handleFileUpload($file, $subDir = '') {
    // Config - Adjusted to point to root/uploads
    $uploadDir = __DIR__ . '/../uploads/';
    
    // Allowed MIME types
    $allowedTypes = [
        'image/jpeg', 
        'image/png', 
        'image/gif', 
        'image/webp'
    ];
    
    // Max size 2MB
    $maxSize = 2 * 1024 * 1024; 

    // Error check
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Upload failed with error code: ' . $file['error']);
    }

    // Type check
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    
    if (!in_array($mimeType, $allowedTypes)) {
        throw new Exception('Hanya file gambar yang diperbolehkan (JPG, PNG, GIF, WEBP)');
    }

    // Size check
    if ($file['size'] > $maxSize) {
        throw new Exception('Ukuran file maksimal 2MB');
    }

    // Prepare Directory
    $targetDir = $uploadDir . ($subDir ? $subDir . '/' : '');
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, true)) {
            throw new Exception('Gagal membuat direktori upload');
        }
    }

    // Generate Safe Filename
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    // Sanitize extension
    $ext = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $ext));
    
    $filename = uniqid('img_', true) . '.' . $ext;
    $targetFile = $targetDir . $filename;

    // Move File
    if (!move_uploaded_file($file['tmp_name'], $targetFile)) {
        throw new Exception('Gagal menyimpan file');
    }

    // Return relative URL path
    return 'uploads/' . ($subDir ? $subDir . '/' : '') . $filename;
}


