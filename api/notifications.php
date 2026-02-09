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

// Validate current user session
$currentUser = getCurrentUser();
if (!$currentUser || !isset($currentUser['id'])) {
    jsonResponse(['success' => false, 'message' => 'User session invalid'], 401);
}

switch ($action) {
    case 'list': getNotifications(); break;
    case 'unread_count': getUnreadCount(); break;
    case 'mark_read': markAsRead(); break;
    case 'mark_all_read': markAllAsRead(); break;
    case 'clear': clearNotifications(); break;
    case 'pending_browser': 
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
        }
        getPendingBrowserNotifications(); 
        break;
    case 'check_deadlines': 
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
        }
        checkDeadlines(); 
        break;
    default: jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function getNotifications() {
    global $currentUser;
    
    try {
        $db = getDB();
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
        
        // Validate limit range to prevent abuse
        $limit = max(1, min($limit, 200));
        
        $stmt = $db->prepare("SELECT n.*, t.title as task_title FROM notifications n LEFT JOIN tasks t ON n.task_id = t.id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?");
        $stmt->bindValue(1, $currentUser['id'], PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        
        if (!$stmt->execute()) {
            throw new Exception("Failed to fetch notifications");
        }
        
        jsonResponse(['success' => true, 'notifications' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log("Database error in getNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in getNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function getUnreadCount() {
    global $currentUser;
    
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0");
        
        if (!$stmt->execute([$currentUser['id']])) {
            throw new Exception("Failed to fetch unread count");
        }
        
        jsonResponse(['success' => true, 'count' => (int)$stmt->fetchColumn()]);
    } catch (PDOException $e) {
        error_log("Database error in getUnreadCount: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in getUnreadCount: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function markAsRead() {
    global $currentUser;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    try {
        $rawInput = file_get_contents('php://input');
        $input = json_decode($rawInput, true);
        
        // Validate JSON decode
        if (json_last_error() !== JSON_ERROR_NONE) {
            jsonResponse(['success' => false, 'message' => 'Invalid JSON: ' . json_last_error_msg()], 400);
        }
        
        // Validate input array and required fields
        if (!is_array($input) || !isset($input['id'])) {
            jsonResponse(['success' => false, 'message' => 'Invalid input: id required'], 400);
        }
        
        // Validate id is numeric
        $notificationId = filter_var($input['id'], FILTER_VALIDATE_INT);
        if ($notificationId === false) {
            jsonResponse(['success' => false, 'message' => 'Invalid notification id'], 400);
        }
        
        $db = getDB();
        $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
        
        if (!$stmt->execute([$notificationId, $currentUser['id']])) {
            throw new Exception("Failed to update notification");
        }
        
        jsonResponse(['success' => true]);
    } catch (PDOException $e) {
        error_log("Database error in markAsRead: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in markAsRead: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function markAllAsRead() {
    global $currentUser;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    try {
        $db = getDB();
        $stmt = $db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
        
        if (!$stmt->execute([$currentUser['id']])) {
            throw new Exception("Failed to update notifications");
        }
        
        jsonResponse(['success' => true]);
    } catch (PDOException $e) {
        error_log("Database error in markAllAsRead: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in markAllAsRead: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function clearNotifications() {
    global $currentUser;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    try {
        $db = getDB();
        $stmt = $db->prepare("DELETE FROM notifications WHERE user_id = ?");
        
        if (!$stmt->execute([$currentUser['id']])) {
            throw new Exception("Failed to delete notifications");
        }
        
        jsonResponse(['success' => true]);
    } catch (PDOException $e) {
        error_log("Database error in clearNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in clearNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function getPendingBrowserNotifications() {
    global $currentUser;
    
    try {
        $db = getDB();
        
        // Use transaction to prevent race condition
        $db->beginTransaction();
        
        try {
            $stmt = $db->prepare("SELECT * FROM notifications WHERE user_id = ? AND is_browser_sent = 0 ORDER BY created_at DESC LIMIT 10 FOR UPDATE");
            
            if (!$stmt->execute([$currentUser['id']])) {
                throw new Exception("Failed to fetch pending notifications");
            }
            
            $notifications = $stmt->fetchAll();
            
            // Only update if there are notifications to prevent SQL error
            if (!empty($notifications)) {
                $ids = array_column($notifications, 'id');
                
                // Validate IDs are numeric
                $ids = array_filter($ids, function($id) {
                    return filter_var($id, FILTER_VALIDATE_INT) !== false;
                });
                
                if (!empty($ids)) {
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $updateStmt = $db->prepare("UPDATE notifications SET is_browser_sent = 1 WHERE id IN ($placeholders)");
                    
                    if (!$updateStmt->execute($ids)) {
                        throw new Exception("Failed to update notification status");
                    }
                }
            }
            
            $db->commit();
            jsonResponse(['success' => true, 'notifications' => $notifications]);
            
        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }
        
    } catch (PDOException $e) {
        error_log("Database error in getPendingBrowserNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in getPendingBrowserNotifications: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}

function checkDeadlines() {
    global $currentUser;
    
    try {
        $db = getDB();
        $today = date('Y-m-d');
        $now = new DateTime();
        $results = ['deadline_alerts' => [], 'transition_alerts' => []];
        
        $stmt = $db->prepare("SELECT t.*, (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id) as total_checklist, (SELECT COALESCE(SUM(ci.is_done), 0) FROM checklist_items ci WHERE ci.task_id = t.id) as done_checklist FROM tasks t WHERE t.staff_id = ? AND t.task_date = ? AND t.status != 'done' ORDER BY t.end_time");
        
        if (!$stmt->execute([$currentUser['id'], $today])) {
            throw new Exception("Failed to fetch tasks");
        }
        
        $tasks = $stmt->fetchAll();
        
        foreach ($tasks as $index => $task) {
            // Validate end_time exists and has valid format
            if (empty($task['end_time']) || !preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $task['end_time'])) {
                continue; // Skip invalid task
            }
            
            try {
                $endTime = new DateTime($today . ' ' . $task['end_time']);
            } catch (Exception $e) {
                error_log("Invalid datetime for task {$task['id']}: " . $e->getMessage());
                continue; // Skip invalid datetime
            }
            
            $minutesUntilEnd = max(0, (int)(($endTime->getTimestamp() - $now->getTimestamp()) / 60));
            
            if ($minutesUntilEnd <= 5 && $minutesUntilEnd > 0) {
                $checkStmt = $db->prepare("SELECT id FROM notifications WHERE task_id = ? AND type = 'deadline' AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
                $checkStmt->execute([$task['id']]);
                
                if (!$checkStmt->fetch()) {
                    // Safe progress calculation with NULL handling
                    $totalChecklist = (int)($task['total_checklist'] ?? 0);
                    $doneChecklist = (int)($task['done_checklist'] ?? 0);
                    $progress = $totalChecklist > 0 ? round(($doneChecklist / $totalChecklist) * 100) : 0;
                    
                    // Sanitize title to prevent XSS
                    $title = htmlspecialchars($task['title'], ENT_QUOTES, 'UTF-8');
                    $msg = "⏰ \"{$title}\" harus selesai dalam {$minutesUntilEnd} menit! Progress: {$progress}%";
                    
                    createNotification($currentUser['id'], 'Deadline', $msg, 'deadline', $task['id']);
                    $results['deadline_alerts'][] = [
                        'task_id' => $task['id'], 
                        'title' => $task['title'], 
                        'minutes' => $minutesUntilEnd, 
                        'message' => $msg
                    ];
                }
            }
            
            // Check for next task transition - use safer array access
            $nextIndex = $index + 1;
            if (isset($tasks[$nextIndex])) {
                $next = $tasks[$nextIndex];
                
                // Validate next task start_time
                if (empty($next['start_time']) || !preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $next['start_time'])) {
                    continue; // Skip invalid next task
                }
                
                try {
                    $nextStart = new DateTime($today . ' ' . $next['start_time']);
                } catch (Exception $e) {
                    error_log("Invalid datetime for next task {$next['id']}: " . $e->getMessage());
                    continue; // Skip invalid datetime
                }
                
                $minsToNext = max(0, (int)(($nextStart->getTimestamp() - $now->getTimestamp()) / 60));
                
                if ($minsToNext <= 5 && $minsToNext > 0) {
                    $checkStmt = $db->prepare("SELECT id FROM notifications WHERE task_id = ? AND type = 'transition' AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
                    $checkStmt->execute([$next['id']]);
                    
                    if (!$checkStmt->fetch()) {
                        // Sanitize title to prevent XSS
                        $nextTitle = htmlspecialchars($next['title'], ENT_QUOTES, 'UTF-8');
                        $msg = "🔄 \"{$nextTitle}\" dimulai dalam {$minsToNext} menit";
                        
                        createNotification($currentUser['id'], 'Transisi', $msg, 'transition', $next['id']);
                        $results['transition_alerts'][] = [
                            'next_task' => $next['title'], 
                            'minutes' => $minsToNext, 
                            'message' => $msg
                        ];
                    }
                }
            }
        }
        
        jsonResponse(['success' => true, 'alerts' => $results, 'checked_at' => $now->format('H:i:s')]);
        
    } catch (PDOException $e) {
        error_log("Database error in checkDeadlines: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
    } catch (Exception $e) {
        error_log("Error in checkDeadlines: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'An error occurred'], 500);
    }
}


