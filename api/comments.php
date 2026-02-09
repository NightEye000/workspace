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
    
    // Validate task ownership - user can only comment on their own tasks or if admin
    $stmt = $db->prepare("SELECT staff_id FROM tasks WHERE id = ?");
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }
    
    // Allow if: user owns task, user is admin, or task was assigned to user (via staff_id)
    if ($task['staff_id'] != $currentUser['id'] && !isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Anda tidak memiliki akses ke tugas ini'], 403);
    }
    
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
    $currentUser = getCurrentUser();
    
    // Validate task ownership - user can only add attachment to their own tasks or if admin
    $stmt = $db->prepare("SELECT staff_id FROM tasks WHERE id = ?");
    $stmt->execute([$taskId]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }
    
    if ($task['staff_id'] != $currentUser['id'] && !isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Anda tidak memiliki akses ke tugas ini'], 403);
    }
    
    $stmt = $db->prepare("INSERT INTO attachments (task_id, name, url, type) VALUES (?, ?, ?, ?)");
    $stmt->execute([$taskId, $name, $url, $type]);
    
    $attachmentId = $db->lastInsertId();

    // Auto-update task status to 'done' if all checklist items are completed
    // and this was the missing requirement
    $stmtCheck = $db->prepare("SELECT COUNT(*) as total, SUM(is_done) as done FROM checklist_items WHERE task_id = ?");
    $stmtCheck->execute([$taskId]);
    $stats = $stmtCheck->fetch();
    
    // Get task info to check attachment_required
    $stmtTask = $db->prepare("SELECT title, status, attachment_required FROM tasks WHERE id = ?");
    $stmtTask->execute([$taskId]);
    $taskInfo = $stmtTask->fetch();
    
    $newStatus = null;
    
    // Auto-update to 'done' if:
    // 1. All checklist items are completed (or no checklist items)
    // 2. If attachment_required, now we have at least one attachment
    $checklistComplete = ($stats['total'] == 0) || ($stats['total'] == $stats['done']);
    $attachmentSatisfied = true; // We just added one, so it's satisfied now
    
    if ($checklistComplete && $attachmentSatisfied && $taskInfo['status'] !== 'done') {
        $db->prepare("UPDATE tasks SET status = 'done' WHERE id = ?")->execute([$taskId]);
        $newStatus = 'done';
        
        // Notify mentioned users
        notifyMentionedUsersInComments($taskId, $taskInfo['title'] ?? 'Tugas');
    }
    
    jsonResponse([
        'success' => true, 
        'attachment' => [
            'id' => $attachmentId,
            'task_id' => $taskId,
            'name' => $name,
            'url' => $url,
            'type' => $type
        ],
        'new_status' => $newStatus // Tell frontend if status changed
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
    
    // Get attachment's task for permission check and status update
    $stmt = $db->prepare("
        SELECT a.*, t.staff_id, t.id as task_id, t.status, t.attachment_required 
        FROM attachments a 
        JOIN tasks t ON a.task_id = t.id 
        WHERE a.id = ?
    ");
    $stmt->execute([$attachmentId]);
    $attachment = $stmt->fetch();
    
    if (!$attachment) {
        jsonResponse(['success' => false, 'message' => 'Attachment not found'], 404);
    }
    
    $currentUser = getCurrentUser();
    if ($attachment['staff_id'] != $currentUser['id'] && !isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $taskId = $attachment['task_id'];
    $wasAttachmentRequired = $attachment['attachment_required'] == 1;
    $wasTaskDone = $attachment['status'] === 'done';
    
    // Delete the attachment
    $stmt = $db->prepare("DELETE FROM attachments WHERE id = ?");
    $stmt->execute([$attachmentId]);
    
    $newStatus = null;
    
    // Check if we need to revert task status
    if ($wasAttachmentRequired && $wasTaskDone) {
        // Count remaining attachments
        $stmtCount = $db->prepare("SELECT COUNT(*) as count FROM attachments WHERE task_id = ?");
        $stmtCount->execute([$taskId]);
        $remainingCount = $stmtCount->fetch()['count'];
        
        // If no attachments left and attachment was required, revert status to in-progress
        if ($remainingCount == 0) {
            $db->prepare("UPDATE tasks SET status = 'in-progress' WHERE id = ?")->execute([$taskId]);
            $newStatus = 'in-progress';
        }
    }
    
    jsonResponse([
        'success' => true, 
        'message' => $newStatus ? 'Lampiran dihapus. Status tugas diubah karena lampiran wajib.' : 'Lampiran dihapus',
        'new_status' => $newStatus
    ]);
}

/**
 * Notify mentioned users when a task is completed (via attachment)
 */
function notifyMentionedUsersInComments($taskId, $taskTitle) {
    $db = getDB();
    $currentUser = getCurrentUser();
    
    // Get all mentioned users who haven't been notified yet
    $stmt = $db->prepare("
        SELECT tm.id, tm.user_id
        FROM task_mentions tm
        WHERE tm.task_id = ? AND tm.notified_on_complete = 0
    ");
    $stmt->execute([$taskId]);
    $mentions = $stmt->fetchAll();
    
    if (empty($mentions)) {
        return;
    }
    
    // Send notification to each mentioned user
    $stmtNotif = $db->prepare("
        INSERT INTO notifications (user_id, title, message, type, task_id)
        VALUES (?, ?, ?, 'completed', ?)
    ");
    
    $stmtUpdate = $db->prepare("UPDATE task_mentions SET notified_on_complete = 1 WHERE id = ?");
    
    foreach ($mentions as $mention) {
        $stmtNotif->execute([
            $mention['user_id'],
            '✅ Tugas Selesai!',
            "{$currentUser['name']} telah menyelesaikan tugas \"{$taskTitle}\". Anda dapat melanjutkan pekerjaan Anda.",
            $taskId
        ]);
        
        // Mark as notified
        $stmtUpdate->execute([$mention['id']]);
    }
}
