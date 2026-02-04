<?php
/**
 * Notifications API - With Browser Push Support
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

$action = $_GET['action'] ?? '';

if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

switch ($action) {
    case 'list': getNotifications(); break;
    case 'unread_count': getUnreadCount(); break;
    case 'mark_read': markAsRead(); break;
    case 'mark_all_read': markAllAsRead(); break;
    case 'clear': clearNotifications(); break;
    case 'pending_browser': getPendingBrowserNotifications(); break;
    case 'check_deadlines': checkDeadlines(); break;
    default: jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function getNotifications() {
    $db = getDB();
    $currentUser = getCurrentUser();
    $limit = $_GET['limit'] ?? 50;
    
    $stmt = $db->prepare("SELECT n.*, t.title as task_title FROM notifications n LEFT JOIN tasks t ON n.task_id = t.id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?");
    $stmt->execute([$currentUser['id'], (int)$limit]);
    jsonResponse(['success' => true, 'notifications' => $stmt->fetchAll()]);
}

function getUnreadCount() {
    $db = getDB();
    $currentUser = getCurrentUser();
    $stmt = $db->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0");
    $stmt->execute([$currentUser['id']]);
    jsonResponse(['success' => true, 'count' => (int)$stmt->fetchColumn()]);
}

function markAsRead() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    $input = json_decode(file_get_contents('php://input'), true);
    $db = getDB();
    $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
    $stmt->execute([$input['id'], getCurrentUser()['id']]);
    jsonResponse(['success' => true]);
}

function markAllAsRead() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    $db = getDB();
    $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
    $stmt->execute([getCurrentUser()['id']]);
    jsonResponse(['success' => true]);
}

function clearNotifications() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    $db = getDB();
    $stmt = $db->prepare("DELETE FROM notifications WHERE user_id = ?");
    $stmt->execute([getCurrentUser()['id']]);
    jsonResponse(['success' => true]);
}

function getPendingBrowserNotifications() {
    $db = getDB();
    $currentUser = getCurrentUser();
    
    $stmt = $db->prepare("SELECT * FROM notifications WHERE user_id = ? AND is_browser_sent = 0 ORDER BY created_at DESC LIMIT 10");
    $stmt->execute([$currentUser['id']]);
    $notifications = $stmt->fetchAll();
    
    if (!empty($notifications)) {
        $ids = array_column($notifications, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $db->prepare("UPDATE notifications SET is_browser_sent = 1 WHERE id IN ($placeholders)")->execute($ids);
    }
    
    jsonResponse(['success' => true, 'notifications' => $notifications]);
}

function checkDeadlines() {
    $db = getDB();
    $currentUser = getCurrentUser();
    $today = date('Y-m-d');
    $now = new DateTime();
    $results = ['deadline_alerts' => [], 'transition_alerts' => []];
    
    $stmt = $db->prepare("SELECT t.*, (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id) as total_checklist, (SELECT SUM(ci.is_done) FROM checklist_items ci WHERE ci.task_id = t.id) as done_checklist FROM tasks t WHERE t.staff_id = ? AND t.task_date = ? AND t.status != 'done' ORDER BY t.end_time");
    $stmt->execute([$currentUser['id'], $today]);
    $tasks = $stmt->fetchAll();
    
    foreach ($tasks as $index => $task) {
        $endTime = new DateTime($today . ' ' . $task['end_time']);
        $minutesUntilEnd = max(0, (int)(($endTime->getTimestamp() - $now->getTimestamp()) / 60));
        
        if ($minutesUntilEnd <= 5 && $minutesUntilEnd > 0) {
            $stmt = $db->prepare("SELECT id FROM notifications WHERE task_id = ? AND type = 'deadline' AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
            $stmt->execute([$task['id']]);
            if (!$stmt->fetch()) {
                $progress = $task['total_checklist'] > 0 ? round(($task['done_checklist'] / $task['total_checklist']) * 100) : 0;
                $msg = "⏰ \"{$task['title']}\" harus selesai dalam {$minutesUntilEnd} menit! Progress: {$progress}%";
                createNotification($currentUser['id'], 'Deadline', $msg, 'deadline', $task['id']);
                $results['deadline_alerts'][] = ['task_id' => $task['id'], 'title' => $task['title'], 'minutes' => $minutesUntilEnd, 'message' => $msg];
            }
        }
        
        if (isset($tasks[$index + 1])) {
            $next = $tasks[$index + 1];
            $nextStart = new DateTime($today . ' ' . $next['start_time']);
            $minsToNext = max(0, (int)(($nextStart->getTimestamp() - $now->getTimestamp()) / 60));
            if ($minsToNext <= 5 && $minsToNext > 0) {
                $stmt = $db->prepare("SELECT id FROM notifications WHERE task_id = ? AND type = 'transition' AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
                $stmt->execute([$next['id']]);
                if (!$stmt->fetch()) {
                    $msg = "🔄 \"{$next['title']}\" dimulai dalam {$minsToNext} menit";
                    createNotification($currentUser['id'], 'Transisi', $msg, 'transition', $next['id']);
                    $results['transition_alerts'][] = ['next_task' => $next['title'], 'minutes' => $minsToNext, 'message' => $msg];
                }
            }
        }
    }
    jsonResponse(['success' => true, 'alerts' => $results, 'checked_at' => $now->format('H:i:s')]);
}


