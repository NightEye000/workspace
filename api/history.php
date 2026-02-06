<?php
/**
 * Work History API
 * Returns tasks that are completed OR past due (deadline passed but not completed)
 */

// Configure session before starting
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Lax');

session_start();
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/constants.php';
require_once __DIR__ . '/../helpers/functions.php';

// Error handling - log errors but don't display to users (prevents JSON breaking)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');

$action = $_GET['action'] ?? 'list';

if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

switch ($action) {
    case 'list': getWorkHistory(); break;
    default: jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function getWorkHistory() {
    try {
        $db = getDB();
        $currentUser = getCurrentUser();
        $limit = isset($_GET['limit']) ? min((int)$_GET['limit'], 100) : 50;
        $staffId = $_GET['staff_id'] ?? null;
        $today = date('Y-m-d');
        $now = date('H:i:s');
        
        // Get tasks that are:
        // 1. Status = 'done' (completed tasks)
        // 2. OR task_date < today (past date, regardless of status)
        // 3. OR task_date = today AND end_time < now AND status != 'done' (today but deadline passed)
        
        $sql = "
            SELECT 
                t.id,
                t.title,
                t.category,
                t.status,
                t.task_date,
                t.start_time,
                t.end_time,
                t.updated_at,
                t.created_at,
                u.id as staff_id,
                u.name as staff_name,
                u.avatar as staff_avatar,
                u.role as department,
                (SELECT COUNT(*) FROM checklist_items ci WHERE ci.task_id = t.id) as total_checklist,
                (SELECT COALESCE(SUM(ci.is_done), 0) FROM checklist_items ci WHERE ci.task_id = t.id) as done_checklist
            FROM tasks t
            JOIN users u ON t.staff_id = u.id
            WHERE (
                t.status = 'done'
                OR t.task_date < ?
                OR (t.task_date = ? AND t.end_time < ? AND t.status != 'done')
            )
        ";
        
        $params = [$today, $today, $now];
        
        if ($staffId) {
            $sql .= " AND t.staff_id = ?";
            $params[] = $staffId;
        }
        
        // LIMIT must be directly in query for MySQL PDO (can't use placeholder without emulation)
        $sql .= " ORDER BY t.task_date DESC, t.end_time DESC LIMIT " . (int)$limit;
        
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $tasks = $stmt->fetchAll();
        
        // Format for response
        $history = [];
        foreach ($tasks as $task) {
            $isCompleted = $task['status'] === 'done';
            $isPastDue = !$isCompleted && (
                $task['task_date'] < $today || 
                ($task['task_date'] === $today && $task['end_time'] < $now)
            );
            
            $history[] = [
                'id' => $task['id'],
                'title' => $task['title'],
                'category' => $task['category'],
                'status' => $task['status'],
                'task_date' => $task['task_date'],
                'start_time' => $task['start_time'],
                'end_time' => $task['end_time'],
                'staff_id' => $task['staff_id'],
                'staff_name' => $task['staff_name'],
                'staff_avatar' => $task['staff_avatar'],
                'department' => $task['department'],
                'total_checklist' => (int)$task['total_checklist'],
                'done_checklist' => (int)($task['done_checklist'] ?? 0),
                'is_completed' => $isCompleted,
                'is_past_due' => $isPastDue,
                'updated_at' => $task['updated_at'],
                'created_at' => $task['created_at']
            ];
        }
        
        jsonResponse(['success' => true, 'history' => $history]);
    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Database error: ' . $e->getMessage()], 500);
    }
}
