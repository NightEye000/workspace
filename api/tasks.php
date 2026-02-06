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

// Error handling - log errors but don't display to users (prevents JSON breaking)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

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

    // 2a. Date Range Logic (For List View)
    $startDate = $_GET['start_date'] ?? null;
    $endDate = $_GET['end_date'] ?? null;
    $singleDate = $_GET['date'] ?? date('Y-m-d');

    if ($startDate && $endDate) {
        $taskSql = "
            SELECT t.*, u.name as staff_name, u.avatar as staff_avatar, u.role as staff_role
            FROM tasks t
            JOIN users u ON t.staff_id = u.id
            WHERE t.task_date BETWEEN ? AND ? 
        ";
        $params = [$startDate, $endDate];
        
        if ($department !== 'All') {
            $taskSql .= " AND u.role = ?";
            $params[] = $department;
        }
        if ($staffId && $staffId !== 'null') {
            $taskSql .= " AND t.staff_id = ?";
            $params[] = $staffId;
        }
        
        $taskSql .= " ORDER BY t.task_date ASC, t.start_time ASC";
        
        $stmt = $db->prepare($taskSql);
        $stmt->execute($params);
        $tasks = $stmt->fetchAll();
        
        // Enrich Checklists
        if (!empty($tasks)) {
             $taskIds = array_column($tasks, 'id');
             $inQuery = implode(',', array_fill(0, count($taskIds), '?'));
             $stmt = $db->prepare("SELECT * FROM checklist_items WHERE task_id IN ($inQuery) ORDER BY sort_order");
             $stmt->execute($taskIds);
             $checks = $stmt->fetchAll();
             $checkMap = [];
             foreach($checks as $c) $checkMap[$c['task_id']][] = $c;
             
             foreach($tasks as &$t) {
                 $t['checklist'] = $checkMap[$t['id']] ?? [];
                 $t['can_edit'] = canAccessStaff($t['staff_id']);
             }
        }

        jsonResponse(['success' => true, 'tasks' => $tasks]);
    }

    // 2b. Existing Single Date Logic (For Timeline View)
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
    $taskParams = array_merge([$singleDate], $userIds);
    
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
    $targetStaffId = isset($input['staff_id']) ? (int)$input['staff_id'] : getCurrentUser()['id'];
    
    // Validate time format (HH:MM or HH:MM:SS)
    if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $startTime)) {
        jsonResponse(['success' => false, 'message' => 'Format waktu mulai tidak valid'], 400);
    }
    if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $endTime)) {
        jsonResponse(['success' => false, 'message' => 'Format waktu selesai tidak valid'], 400);
    }
    
    if ($category !== 'Request' && !canAccessStaff($targetStaffId)) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    if (empty($title) || empty($startTime) || empty($endTime)) {
        jsonResponse(['success' => false, 'message' => 'Judul, Jam Mulai, dan Jam Selesai wajib diisi'], 400);
    }
    
    // Fix: Prioritize task_date, fallback to date, then today
    $date = $input['task_date'] ?? $input['date'] ?? date('Y-m-d');
    // Validate date format
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        jsonResponse(['success' => false, 'message' => 'Format tanggal tidak valid'], 400);
    }
    
    $isRoutine = !empty($input['is_routine']) ? 1 : 0;
    $routineDays = !empty($input['routine_days']) ? json_encode($input['routine_days']) : null;
    $attachmentRequired = !empty($input['attachment_required']) ? 1 : 0;
    
    // Validate and sanitize status
    $status = $input['kanban_status'] ?? 'todo';
    if (!in_array($status, ['todo', 'in-progress', 'done'])) {
        $status = 'todo'; // Default to todo if invalid
    }
    
    // Insert Task
    $stmt = $db->prepare("
        INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, attachment_required, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        $attachmentRequired,
        getCurrentUser()['id']
    ]);
    
    $taskId = $db->lastInsertId();

    // NOTIFICATION: If assigning to someone else (Request), notify them immediately
    if ($targetStaffId != getCurrentUser()['id']) {
        $currentUser = getCurrentUser();
        $notifTitle = "📨 Tugas Baru Masuk";
        $notifMsg = "{$currentUser['name']} memberikan tugas baru: \"{$title}\". Tolong cek Daftar Tugas!";
        
        $stmtNotif = $db->prepare("
            INSERT INTO notifications (user_id, title, message, type, task_id, is_read, created_at)
            VALUES (?, ?, ?, 'info', ?, 0, NOW())
        ");
        $stmtNotif->execute([$targetStaffId, $notifTitle, $notifMsg, $taskId]);
    }
    
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

    // Insert Mentions (for collaboration notifications)
    if (!empty($input['mentions']) && is_array($input['mentions'])) {
        $stmtMention = $db->prepare("INSERT IGNORE INTO task_mentions (task_id, user_id) VALUES (?, ?)");
        $currentUser = getCurrentUser();
        
        foreach ($input['mentions'] as $mentionedUserId) {
            $mentionedUserId = intval($mentionedUserId);
            if ($mentionedUserId > 0 && $mentionedUserId != $currentUser['id']) {
                $stmtMention->execute([$taskId, $mentionedUserId]);
                
                // Send notification to mentioned user
                $stmtNotif = $db->prepare("
                    INSERT INTO notifications (user_id, title, message, type, task_id)
                    VALUES (?, ?, ?, 'mention', ?)
                ");
                $stmtNotif->execute([
                    $mentionedUserId,
                    '🔔 Anda di-tag di tugas baru',
                    "{$currentUser['name']} menambahkan Anda untuk diberitahu ketika tugas \"{$title}\" selesai.",
                    $taskId
                ]);
            }
        }
    }

    // 3. AUTO-SAVE TO ROUTINE TEMPLATES MASTER
    // If set as routine, add to Master Templates list so it appears in Dropdown
    if ($isRoutine == 1) {
        $user = getCurrentUser();
        $dept = $user['role'];
        
        // Calculate duration based on start/end
        $start = strtotime($startTime);
        $end = strtotime($endTime);
        $duration = 1; // Default
        if ($end > $start) {
            $duration = round(($end - $start) / 3600, 1);
        }

        // Checklist for template
        $checklistTpl = [];
        if (!empty($input['checklist']) && is_array($input['checklist'])) {
            $checklistTpl = array_values(array_filter($input['checklist'])); // Reindex
        }

        // Check if template exists
        $stmtCheckTpl = $db->prepare("SELECT id FROM routine_templates WHERE department = ? AND title = ?");
        $stmtCheckTpl->execute([$dept, $title]);
        
        if (!$stmtCheckTpl->fetch()) {
            // Insert new template
            $stmtTpl = $db->prepare("
                INSERT INTO routine_templates (department, title, duration_hours, routine_days, checklist_template, default_start_time, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            ");
            $stmtTpl->execute([
                $dept,
                $title,
                $duration,
                $routineDays, // JSON string already
                json_encode($checklistTpl),
                $startTime
            ]);
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
    // Check ownership
    $stmt = $db->prepare("SELECT staff_id, attachment_required FROM tasks WHERE id = ?");
    $stmt->execute([$id]);
    $task = $stmt->fetch();
    
    if (!$task) {
        jsonResponse(['success' => false, 'message' => 'Task not found'], 404);
    }

    // Attachment Requirement Check
    if ($status === 'done' && !empty($task['attachment_required']) && $task['attachment_required'] == 1) {
        $stmtAtt = $db->prepare("SELECT COUNT(*) as count FROM attachments WHERE task_id = ?");
        $stmtAtt->execute([$id]);
        $count = $stmtAtt->fetch()['count'];
        
        if ($count == 0) {
            jsonResponse(['success' => false, 'message' => 'Tugas ini WAJIB melampirkan bukti sebelum diselesaikan!'], 400);
        }
    }
    
    if (!canAccessStaff($task['staff_id'])) {
        jsonResponse(['success' => false, 'message' => 'Access denied'], 403);
    }
    
    $stmt = $db->prepare("UPDATE tasks SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);
    
    // If status changed to done, notify mentioned users
    if ($status === 'done') {
        notifyMentionedUsers($id, $task['title'] ?? 'Tugas');
    }
    
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
    
    // CSRF Protection - was missing before
    verifyCSRFToken();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $itemId = $input['item_id'] ?? null;
    
    if (!$itemId) {
        jsonResponse(['success' => false, 'message' => 'Item ID required'], 400);
    }
    
    // Get Task ID for permission check
    $stmt = $db->prepare("SELECT ci.task_id, ci.is_done, t.staff_id FROM checklist_items ci JOIN tasks t ON ci.task_id = t.id WHERE ci.id = ?");
    $stmt->execute([$itemId]);
    $data = $stmt->fetch();
    
    if ($data && canAccessStaff($data['staff_id'])) {
        $taskId = $data['task_id'];
        $currentIsDone = $data['is_done'];
        
        // Toggle Item - Fix race condition by using PHP logic instead of MySQL IF
        // If currently done (1) -> set to not done (0) and clear completed_at
        // If currently not done (0) -> set to done (1) and set completed_at to NOW()
        $newIsDone = $currentIsDone ? 0 : 1;
        $completedAt = $newIsDone ? date('Y-m-d H:i:s') : null;
        
        $db->prepare("UPDATE checklist_items SET is_done = ?, completed_at = ? WHERE id = ?")->execute([$newIsDone, $completedAt, $itemId]);
        
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
            if ($done > 0) {
                $newStatus = 'in-progress';
            }
            
            if ($done == $total) {
                // Check if attachment is required
                $stmtCheck = $db->prepare("SELECT attachment_required FROM tasks WHERE id = ?");
                $stmtCheck->execute([$taskId]);
                $tRow = $stmtCheck->fetch();
                
                $canComplete = true;
                if ($tRow && $tRow['attachment_required'] == 1) {
                    $stmtAtt = $db->prepare("SELECT COUNT(*) as cnt FROM attachments WHERE task_id = ?");
                    $stmtAtt->execute([$taskId]);
                    if ($stmtAtt->fetch()['cnt'] == 0) {
                        $canComplete = false;
                    }
                }
                
                if ($canComplete) {
                    $newStatus = 'done';
                }
            }
        }
        
        // Update Task Status
        $db->prepare("UPDATE tasks SET status = ? WHERE id = ?")->execute([$newStatus, $taskId]);
        
        // Notify mentioned users if task is now done
        if ($newStatus === 'done') {
            $stmtTitle = $db->prepare("SELECT title FROM tasks WHERE id = ?");
            $stmtTitle->execute([$taskId]);
            $taskRow = $stmtTitle->fetch();
            notifyMentionedUsers($taskId, $taskRow['title'] ?? 'Tugas');
        }
        
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
    
    // ALLOW Staff to generate their own routines
    // if (!isAdmin()) { ... } // REMOVED BLOCKING CHECK

    $currentUser = getCurrentUser();
    if (!$currentUser) {
         jsonResponse(['success' => false, 'message' => 'Unauthorized'], 401);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $targetDate = $input['date'] ?? date('Y-m-d');
    
    // Determine WHO to generate for
    $targetUserId = null;

    if ($currentUser['role'] === 'Admin') {
        // Admin can generate for specific user OR all (default)
        $targetUserId = $input['user_id'] ?? 'all';
    } else {
        // Staff can ONLY generate for themselves
        $targetUserId = $currentUser['id'];
    }

    $dayOfWeek = date('w', strtotime($targetDate));
    
    // 1. Get Users to Process
    $users = [];
    if ($targetUserId === 'all') {
        $users = $db->query("SELECT id, role, name FROM users WHERE role != 'Admin' AND is_active = 1")->fetchAll();
    } else {
        $stmt = $db->prepare("SELECT id, role, name FROM users WHERE id = ? AND is_active = 1");
        $stmt->execute([$targetUserId]);
        $users = $stmt->fetchAll();
    }
    
    $count = 0;
    
    // Move user fetch outside loop
    $currentUserId = getCurrentUser()['id'] ?? null;

    try {
        foreach ($users as $user) {
            $dept = $user['role'];
            
            // ... (Template logic remains similar, passing $currentUserId) ...
            // Find Templates for this Department
            $stmtTpl = $db->prepare("SELECT * FROM routine_templates WHERE department = ? AND is_active = 1");
            $stmtTpl->execute([$dept]);
            $templates = $stmtTpl->fetchAll();
            
            foreach ($templates as $tpl) {
                // ... logic ...
                $days = json_decode($tpl['routine_days'], true);
                if (is_array($days) && in_array($dayOfWeek, $days)) {
                     // ...
                     $startTime = $tpl['default_start_time'];
                     $duration = floatval($tpl['duration_hours']);
                     $endTime = date('H:i:s', strtotime($startTime) + ($duration * 3600));

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
                            $tpl['routine_days'],
                            $currentUserId
                        ]);
                        
                        $taskId = $db->lastInsertId();
                        $count++;
                        
                        // Checklist
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

            // 2. PERSONAL ROUTINES
            $stmtPersonal = $db->prepare("
                SELECT title, start_time, end_time, routine_days, staff_id 
                FROM tasks 
                WHERE staff_id = ? AND is_routine = 1 
                ORDER BY id DESC
            ");
            $stmtPersonal->execute([$user['id']]);
            $personalRoutines = $stmtPersonal->fetchAll();

            // Filter unique titles for this user to avoid double processing
            $uniquePersonal = [];
            foreach ($personalRoutines as $pr) {
                if (!isset($uniquePersonal[$pr['title']])) {
                    $uniquePersonal[$pr['title']] = $pr;
                }
            }

            foreach ($uniquePersonal as $routine) {
                $days = json_decode($routine['routine_days'], true);
                if (is_array($days) && in_array($dayOfWeek, $days)) {
                    
                    $stmtCheck = $db->prepare("SELECT id FROM tasks WHERE staff_id = ? AND task_date = ? AND title = ?");
                    $stmtCheck->execute([$user['id'], $targetDate, $routine['title']]);
                    
                    if (!$stmtCheck->fetch()) {
                        $stmtInsert = $db->prepare("
                            INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, created_by) 
                            VALUES (?, ?, 'Jobdesk', 'todo', ?, ?, ?, 1, ?, ?)
                        ");
                        $stmtInsert->execute([
                            $user['id'],
                            $routine['title'],
                            $targetDate,
                            $routine['start_time'],
                            $routine['end_time'],
                            $routine['routine_days'],
                            $currentUserId
                        ]);
                        
                        $newTaskId = $db->lastInsertId();
                        $count++;

                        $stmtLast = $db->prepare("
                            SELECT id FROM tasks 
                            WHERE staff_id = ? AND title = ? AND is_routine = 1 AND id != ?
                            ORDER BY id DESC LIMIT 1
                        ");
                        $stmtLast->execute([$user['id'], $routine['title'], $newTaskId]);
                        $lastTask = $stmtLast->fetch();

                        if ($lastTask) {
                            $stmtChecklist = $db->prepare("SELECT text, sort_order FROM checklist_items WHERE task_id = ? ORDER BY sort_order");
                            $stmtChecklist->execute([$lastTask['id']]);
                            $checklistItems = $stmtChecklist->fetchAll();

                            if ($checklistItems) {
                                $stmtItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
                                foreach ($checklistItems as $item) {
                                    $stmtItem->execute([$newTaskId, $item['text'], $item['sort_order']]);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        jsonResponse(['success' => true, 'message' => "Berhasil generate $count rutinitas"]);

    } catch (Exception $e) {
        jsonResponse(['success' => false, 'message' => 'Error generating routines: ' . $e->getMessage()], 500);
    }
}

function getStaffPerformance() {
    global $db;
    $sql = "SELECT * FROM v_staff_performance ORDER BY task_date DESC, performance_percent DESC LIMIT 100";
    $data = $db->query($sql)->fetchAll();
    jsonResponse(['success' => true, 'data' => $data]);
}

/**
 * Notify mentioned users when a task is completed
 */
function notifyMentionedUsers($taskId, $taskTitle) {
    global $db;
    
    $currentUser = getCurrentUser();
    
    // Get all mentioned users who haven't been notified yet
    $stmt = $db->prepare("
        SELECT tm.id, tm.user_id, u.name as user_name
        FROM task_mentions tm
        JOIN users u ON tm.user_id = u.id
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
