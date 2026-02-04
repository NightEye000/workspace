<?php
/**
 * Tasks Management API
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

// All actions require authentication
if (!isLoggedIn()) {
    jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
}

// Global DB connection
$db = getDB();

switch ($action) {
    case 'list':
        getTasks();
        break;
    case 'get':
        getTask();
        break;
    case 'create':
        createTask();
        break;
    case 'update':
        updateTask();
        break;
    case 'update_status':
        updateTaskStatus();
        break;
    case 'delete':
        deleteTask();
        break;
    case 'toggle_checklist':
        toggleChecklist();
        break;
    case 'generate_routines':
        generateRoutines();
        break;
    case 'staff_performance':
        getStaffPerformance();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

// ================================================================
// FUNCTIONS
// ================================================================

function getTasks() {
    global $db;
    
    $date = $_GET['date'] ?? date('Y-m-d');
    $department = $_GET['department'] ?? 'All';
    $staffId = $_GET['staff_id'] ?? null;
    
    // 1. Get Users
    $userSql = "SELECT id, name, role, avatar FROM users WHERE is_active = 1 AND role != 'Admin'";
    $userParams = [];

    if ($department !== 'All') {
        $userSql .= " AND role = ?";
        $userParams[] = $department;
    }
    if ($staffId) { 
        $userSql .= " AND id = ?";
        $userParams[] = $staffId;
    }
    $userSql .= " ORDER BY role, name";
    
    $stmt = $db->prepare($userSql);
    $stmt->execute($userParams);
    $users = $stmt->fetchAll();

    if (empty($users)) {
         jsonResponse(['success' => true, 'timeline' => []]);
    }

    // 2. Get Tasks for these users on the date
    $userIds = array_column($users, 'id');
    $inQuery = implode(',', array_fill(0, count($userIds), '?'));
    
    // Direct JOIN instead of View to ensure fresh status
    $taskSql = "
        SELECT t.*, u.name as staff_name, u.avatar as staff_avatar, u.role as staff_role
        FROM tasks t
        JOIN users u ON t.staff_id = u.id
        WHERE t.task_date = ? AND t.staff_id IN ($inQuery) 
        ORDER BY t.start_time
    ";
    $taskParams = array_merge([$date], $userIds);
    
    $stmt = $db->prepare($taskSql);
    $stmt->execute($taskParams);
    $tasks = $stmt->fetchAll();
    
    // 3. Process Checklists and Attach to Tasks
    if (!empty($tasks)) {
        $taskIds = array_column($tasks, 'id');
        $inQueryChecklist = implode(',', array_fill(0, count($taskIds), '?'));
        
        $stmt = $db->prepare("SELECT * FROM checklist_items WHERE task_id IN ($inQueryChecklist) ORDER BY sort_order, id");
        $stmt->execute($taskIds);
        $allChecklists = $stmt->fetchAll();
        
        $checklistMap = [];
        foreach ($allChecklists as $item) {
            $checklistMap[$item['task_id']][] = $item;
        }
        
        // Also fetch comment counts
        $stmt = $db->prepare("SELECT task_id, COUNT(*) as count FROM comments WHERE task_id IN ($inQueryChecklist) GROUP BY task_id");
        $stmt->execute($taskIds);
        $commentCounts = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        
        foreach ($tasks as &$task) {
            $task['checklist'] = $checklistMap[$task['id']] ?? [];
            $task['comment_count'] = $commentCounts[$task['id']] ?? 0;
            $task['can_edit'] = canAccessStaff($task['staff_id']);
        }
    }

    // 4. Map tasks to users
    $tasksByUser = [];
    foreach ($tasks as $t) {
        $tasksByUser[$t['staff_id']][] = $t;
    }

    foreach ($users as &$u) {
        $u['tasks'] = $tasksByUser[$u['id']] ?? [];
    }
    
    jsonResponse(['success' => true, 'timeline' => $users]);
}

function getTask() {
    global $db;
    $id = $_GET['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'Task ID required'], 400);
    }
    
    // Direct JOIN replacement
    $stmt = $db->prepare("
        SELECT t.*, u.name as staff_name, u.avatar as staff_avatar, u.role as staff_role
        FROM tasks t
        JOIN users u ON t.staff_id = u.id
        WHERE t.id = ?
    ");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }
    
    // permission check (anyone can view, but detailed actions depend on it)
    $task['can_edit'] = canAccessStaff($task['staff_id']);
    
    // Fetch checklist
    $stmt = $db->prepare("SELECT * FROM checklist_items WHERE task_id = ? ORDER BY sort_order, id");
    $stmt->execute([$id]);
    $task['checklist'] = $stmt->fetchAll();
    
    // Fetch comments
    $stmt = $db->prepare("
        SELECT c.*, u.name as user_name, u.avatar as user_avatar 
        FROM comments c 
        JOIN users u ON c.user_id = u.id 
        WHERE c.task_id = ? 
        ORDER BY c.created_at
    ");
    $stmt->execute([$id]);
    $task['comments'] = $stmt->fetchAll();
    
    // Fetch attachments
    $stmt = $db->prepare("SELECT * FROM attachments WHERE task_id = ?");
    $stmt->execute([$id]);
    $task['attachments'] = $stmt->fetchAll();
    
    jsonResponse(['success' => true, 'task' => $task]);
}

function createTask() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $title = sanitize($input['title'] ?? '');
    $category = sanitize($input['category'] ?? 'Jobdesk');
    $startTime = $input['start_time'] ?? '';
    $endTime = $input['end_time'] ?? '';
    $targetStaffId = $input['staff_id'] ?? getCurrentUser()['id'];
    
    if (!canAccessStaff($targetStaffId)) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    if (empty($title) || empty($startTime) || empty($endTime)) {
        jsonResponse(['success' => false, 'message' => 'Judul, Jam Mulai, dan Jam Selesai wajib diisi'], 400);
    }
    
    // Fix: Prioritize task_date, fallback to date, then today
    $date = $input['task_date'] ?? $input['date'] ?? date('Y-m-d');
    $isRoutine = !empty($input['is_routine']) ? 1 : 0;
    $routineDays = !empty($input['routine_days']) ? json_encode($input['routine_days']) : null;
    $status = $input['kanban_status'] ?? 'todo'; // Allow setting initial status
    
    // Insert Task
    $stmt = $db->prepare("
        INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ");
    
    $stmt->execute([
        $targetStaffId, 
        $title, 
        $category, 
        $status, 
        $date, 
        $startTime, 
        $endTime, 
        $isRoutine, 
        $routineDays, 
        getCurrentUser()['id']
    ]);
    
    $taskId = $db->lastInsertId();
    
    // Insert Checklist
    if (!empty($input['checklist']) && is_array($input['checklist'])) {
        $stmtItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
        foreach ($input['checklist'] as $index => $itemText) {
            $itemText = sanitize($itemText);
            if (!empty($itemText)) {
                $stmtItem->execute([$taskId, $itemText, $index]);
            }
        }
    }
    
    jsonResponse(['success' => true, 'message' => 'Tugas berhasil dibuat', 'task_id' => $taskId]);
}

function updateTask() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) {
        jsonResponse(['success' => false, 'message' => 'Task ID required'], 400);
    }
    
    // Check ownership
    $stmt = $db->prepare("SELECT staff_id FROM tasks WHERE id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }
    
    if (!canAccessStaff($task['staff_id'])) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $title = sanitize($input['title'] ?? '');
    $category = sanitize($input['category'] ?? 'Jobdesk');
    $startTime = $input['start_time'] ?? '';
    $endTime = $input['end_time'] ?? '';
    
    $isRoutine = !empty($input['is_routine']) ? 1 : 0;
    $routineDays = !empty($input['routine_days']) ? json_encode($input['routine_days']) : null;
    
    // Update Task
    $sql = "UPDATE tasks SET title = ?, category = ?, start_time = ?, end_time = ?, is_routine = ?, routine_days = ? WHERE id = ?";
    $stmt = $db->prepare($sql);
    $stmt->execute([$title, $category, $startTime, $endTime, $isRoutine, $routineDays, $id]);
    
    // Update Checklist (Delete all and re-insert is simplest for this scale)
    $db->prepare("DELETE FROM checklist_items WHERE task_id = ?")->execute([$id]);
    
    if (!empty($input['checklist']) && is_array($input['checklist'])) {
        $stmtItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
        foreach ($input['checklist'] as $index => $itemText) {
            $itemText = sanitize($itemText);
            if (!empty($itemText)) {
                $stmtItem->execute([$id, $itemText, $index]);
            }
        }
    }
    
    jsonResponse(['success' => true, 'message' => 'Tugas berhasil diupdate']);
}

function updateTaskStatus() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    $status = $input['status'] ?? null;
    
    if (!$id || !$status) {
        jsonResponse(['success' => false, 'message' => 'ID and Status required'], 400);
    }
    
    // Validate status
    if (!in_array($status, ['todo', 'in-progress', 'done'])) {
        jsonResponse(['success' => false, 'message' => 'Invalid status'], 400);
    }
    
    // Check ownership
    $stmt = $db->prepare("SELECT staff_id FROM tasks WHERE id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }
    
    if (!canAccessStaff($task['staff_id'])) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $stmt = $db->prepare("UPDATE tasks SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);
    
    jsonResponse(['success' => true, 'message' => 'Status updated']);
}

function deleteTask() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    // Check ownership
    $stmt = $db->prepare("SELECT staff_id FROM tasks WHERE id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    
    if ($task && canAccessStaff($task['staff_id'])) {
        $db->prepare("DELETE FROM tasks WHERE id = ?")->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Tugas berhasil dihapus']);
    } else {
        jsonResponse(['success' => false, 'message' => 'Tidak diizinkan'], 403);
    }
}

function toggleChecklist() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $itemId = $input['item_id'] ?? null;
    
    // Get Task ID for permission check
    $stmt = $db->prepare("SELECT ci.task_id, t.staff_id FROM checklist_items ci JOIN tasks t ON ci.task_id = t.id WHERE ci.id = ?");
    $stmt->execute([$itemId]);
    $data = $stmt->fetch();
    
    if ($data && canAccessStaff($data['staff_id'])) {
        $taskId = $data['task_id'];
        
        // Toggle Item
        // Use IF logic in SQL to ensure clean toggle between 0 and 1
        $db->prepare("UPDATE checklist_items SET is_done = IF(is_done = 1, 0, 1) WHERE id = ?")->execute([$itemId]);
        
        // Fetch ALL items for this task to count PHP-side
        $stmtAll = $db->prepare("SELECT is_done FROM checklist_items WHERE task_id = ?");
        $stmtAll->execute([$taskId]);
        $items = $stmtAll->fetchAll();
        
        $total = count($items);
        $done = 0;
        foreach ($items as $item) {
            if ($item['is_done'] == 1) $done++;
        }
        
        $newStatus = 'todo';
        if ($total > 0) {
            if ($done == $total) {
                $newStatus = 'done';
            } elseif ($done > 0) {
                $newStatus = 'in-progress';
            }
        }
        
        // Update Task Status
        $db->prepare("UPDATE tasks SET status = ? WHERE id = ?")->execute([$newStatus, $taskId]);
        
        jsonResponse(['success' => true, 'message' => 'Checklist updated', 'new_status' => $newStatus, 'stats' => "$done/$total"]);
    } else {
        jsonResponse(['success' => false, 'message' => 'Tidak diizinkan'], 403);
    }
}

function generateRoutines() {
    global $db;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    
    verifyCSRFToken();
    
    if (!isAdmin()) {
        jsonResponse(['success' => false, 'message' => 'Admin only'], 403);
    }
    
    $input = json_decode(file_get_contents('php://input'), true);
    $targetDate = $input['date'] ?? date('Y-m-d');
    
    $dayOfWeek = date('w', strtotime($targetDate)); // 0 (Sunday) to 6 (Saturday)
    
    // 1. Get Users
    $users = $db->query("SELECT id, role, name FROM users WHERE role != 'Admin' AND is_active = 1")->fetchAll();
    
    $count = 0;
    
    foreach ($users as $user) {
        $dept = $user['role'];
        
        // Find Templates for this Department
        $stmtTpl = $db->prepare("SELECT * FROM routine_templates WHERE department = ? AND is_active = 1");
        $stmtTpl->execute([$dept]);
        $templates = $stmtTpl->fetchAll();
        
        foreach ($templates as $tpl) {
            $days = json_decode($tpl['routine_days'], true);
            if (is_array($days) && in_array($dayOfWeek, $days)) {
                // Determine times
                $startTime = $tpl['default_start_time'];
                $duration = floatval($tpl['duration_hours']);
                $endTime = date('H:i:s', strtotime($startTime) + ($duration * 3600));
                
                // insert task if not exists matching title and date and staff
                $stmtCheck = $db->prepare("SELECT id FROM tasks WHERE staff_id = ? AND task_date = ? AND title = ?");
                $stmtCheck->execute([$user['id'], $targetDate, $tpl['title']]);
                if (!$stmtCheck->fetch()) {
                    $stmtInsert = $db->prepare("
                        INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, created_by) 
                        VALUES (?, ?, 'Jobdesk', 'todo', ?, ?, ?, 1, ?, ?)
                    ");
                    $stmtInsert->execute([
                        $user['id'],
                        $tpl['title'],
                        $targetDate,
                        $startTime,
                        $endTime,
                        $tpl['routine_days'], // preserve the days copy
                        getCurrentUser()['id']
                    ]);
                    
                    $taskId = $db->lastInsertId();
                    $count++;
                    
                    // Checklist from template
                    $checklist = json_decode($tpl['checklist_template'], true);
                    if ($checklist) {
                        $stmtItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
                        foreach ($checklist as $idx => $text) {
                            $stmtItem->execute([$taskId, $text, $idx]);
                        }
                    }
                }
            }
        }
    }
    
    jsonResponse(['success' => true, 'message' => "Berhasil generate $count rutinitas"]);
}

function getStaffPerformance() {
    global $db;
    $sql = "SELECT * FROM v_staff_performance ORDER BY task_date DESC, performance_percent DESC LIMIT 100";
    $data = $db->query($sql)->fetchAll();
    jsonResponse(['success' => true, 'data' => $data]);
}
