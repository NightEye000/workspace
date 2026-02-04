<?php
/**
 * Comments & Attachments API
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

$action = $_GET['action'] ?? '';

if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

switch ($action) {
    case 'add_comment': addComment(); break;
    case 'delete_comment': deleteComment(); break;
    case 'add_attachment': addAttachment(); break;
    case 'delete_attachment': deleteAttachment(); break;
    default: jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function addComment() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $taskId = $input['task_id'] ?? null;
    $text = sanitize($input['text'] ?? '');
    
    if (!$taskId || empty($text)) {
        jsonResponse(['success' => false, 'message' => 'Task ID and text required'], 400);
    }
    
    $db = getDB();
    $currentUser = getCurrentUser();
    
    $stmt = $db->prepare("INSERT INTO comments (task_id, user_id, text) VALUES (?, ?, ?)");
    $stmt->execute([$taskId, $currentUser['id'], $text]);
    
    $commentId = $db->lastInsertId();
    
    $comment = [
        'id' => $commentId,
        'task_id' => $taskId,
        'user_id' => $currentUser['id'],
        'user_name' => $currentUser['name'],
        'user_avatar' => $currentUser['avatar'],
        'text' => $text,
        'created_at' => date('Y-m-d H:i:s')
    ];

    // Notification: Notify task owner if commenter is different
    $stmt = $db->prepare("SELECT staff_id, title FROM tasks WHERE id = ?");
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();
    
    if ($task && $task['staff_id'] != $currentUser['id']) {
        $msg = "💬 Komentar baru dari {$currentUser['name']} di tugas \"{$task['title']}\"";
        createNotification($task['staff_id'], 'Komentar Baru', $msg, 'info', $taskId);
    }
    
    jsonResponse(['success' => true, 'comment' => $comment]);
}

function deleteComment() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $commentId = $input['id'] ?? null;
    
    if (!$commentId) {
        jsonResponse(['success' => false, 'message' => 'Comment ID required'], 400);
    }
    
    $db = getDB();
    $currentUser = getCurrentUser();
    
    // Check ownership
    $stmt = $db->prepare("SELECT user_id FROM comments WHERE id = ?");
    $stmt->execute([$commentId]);
    $comment = $stmt->fetch();
    
    if (!$comment) {
        jsonResponse(['success' => false, 'message' => 'Comment not found'], 404);
    }
    
    if ($comment['user_id'] != $currentUser['id'] && !isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $stmt = $db->prepare("DELETE FROM comments WHERE id = ?");
    $stmt->execute([$commentId]);
    
    jsonResponse(['success' => true, 'message' => 'Comment deleted']);
}

function addAttachment() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $taskId = $input['task_id'] ?? null;
    $name = sanitize($input['name'] ?? '');
    $url = sanitize($input['url'] ?? '');
    $type = $input['type'] ?? 'link';
    
    if (!$taskId || empty($name) || empty($url)) {
        jsonResponse(['success' => false, 'message' => 'Task ID, name and URL required'], 400);
    }
    
    // Validate URL protocol to prevent XSS (javascript:)
    if (!preg_match('/^(https?:\/\/|ftp:\/\/|mailto:|file:\/\/)/i', $url)) {
        jsonResponse(['success' => false, 'message' => 'URL tidak valid (harus dimulai dengan http://, https://, dll)'], 400);
    }
    
    $db = getDB();
    
    $stmt = $db->prepare("INSERT INTO attachments (task_id, name, url, type) VALUES (?, ?, ?, ?)");
    $stmt->execute([$taskId, $name, $url, $type]);
    
    $attachmentId = $db->lastInsertId();
    
    jsonResponse([
        'success' => true, 
        'attachment' => [
            'id' => $attachmentId,
            'task_id' => $taskId,
            'name' => $name,
            'url' => $url,
            'type' => $type
        ]
    ]);
}

function deleteAttachment() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $attachmentId = $input['id'] ?? null;
    
    if (!$attachmentId) {
        jsonResponse(['success' => false, 'message' => 'Attachment ID required'], 400);
    }
    
    $db = getDB();
    
    // Get attachment's task for permission check
    $stmt = $db->prepare("SELECT a.*, t.staff_id FROM attachments a JOIN tasks t ON a.task_id = t.id WHERE a.id = ?");
    $stmt->execute([$attachmentId]);
    $attachment = $stmt->fetch();
    
    if (!$attachment) {
        jsonResponse(['success' => false, 'message' => 'Attachment not found'], 404);
    }
    
    $currentUser = getCurrentUser();
    if ($attachment['staff_id'] != $currentUser['id'] && !isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $stmt = $db->prepare("DELETE FROM attachments WHERE id = ?");
    $stmt->execute([$attachmentId]);
    
    jsonResponse(['success' => true, 'message' => 'Attachment deleted']);
}
