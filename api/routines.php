<?php
/**
 * Routine Templates API (Admin Only)
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
    case 'list': getTemplates(); break;
    case 'get': getTemplate(); break;
    case 'create': createTemplate(); break;
    case 'update': updateTemplate(); break;
    case 'delete': deleteTemplate(); break;
    default: jsonResponse(['success' => false, 'message' => 'Invalid action'], 400);
}

function getTemplates() {
    $db = getDB();
    $department = $_GET['department'] ?? '';
    
    $sql = "SELECT * FROM routine_templates WHERE is_active = 1";
    $params = [];
    
    if (!empty($department)) {
        $sql .= " AND department = ?";
        $params[] = $department;
    }
    
    $sql .= " ORDER BY department, title";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $templates = $stmt->fetchAll();
    
    foreach ($templates as &$t) {
        $t['routine_days'] = json_decode($t['routine_days'], true) ?: [];
        $t['checklist_template'] = json_decode($t['checklist_template'], true) ?: [];
    }
    
    jsonResponse(['success' => true, 'templates' => $templates]);
}

function getTemplate() {
    $id = $_GET['id'] ?? null;
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID required'], 400);
    
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM routine_templates WHERE id = ?");
    $stmt->execute([$id]);
    $template = $stmt->fetch();
    
    if (!$template) jsonResponse(['success' => false, 'message' => 'Not found'], 404);
    
    $template['routine_days'] = json_decode($template['routine_days'], true) ?: [];
    $template['checklist_template'] = json_decode($template['checklist_template'], true) ?: [];
    
    jsonResponse(['success' => true, 'template' => $template]);
}

function createTemplate() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    if (!isAdmin()) jsonResponse(['success' => false, 'message' => 'Admin only'], 403);
    
    $input = json_decode(file_get_contents('php://input'), true);
    
    $department = sanitize($input['department'] ?? '');
    $title = sanitize($input['title'] ?? '');
    $duration = floatval($input['duration_hours'] ?? 1);
    $routineDays = $input['routine_days'] ?? [];
    $checklist = $input['checklist_template'] ?? [];
    $startTime = $input['default_start_time'] ?? '09:00:00';
    
    if (empty($department) || empty($title)) {
        jsonResponse(['success' => false, 'message' => 'Department and title required'], 400);
    }

    if (isset($input['default_start_time']) && !preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $input['default_start_time'])) {
        jsonResponse(['success' => false, 'message' => 'Format waktu start tidak valid (HH:MM)'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("INSERT INTO routine_templates (department, title, duration_hours, routine_days, checklist_template, default_start_time) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$department, $title, $duration, json_encode($routineDays), json_encode($checklist), $startTime]);
    
    jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
}

function updateTemplate() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    if (!isAdmin()) jsonResponse(['success' => false, 'message' => 'Admin only'], 403);
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID required'], 400);

    if (isset($input['default_start_time']) && !preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $input['default_start_time'])) {
        jsonResponse(['success' => false, 'message' => 'Format waktu start tidak valid (HH:MM)'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("UPDATE routine_templates SET department = ?, title = ?, duration_hours = ?, routine_days = ?, checklist_template = ?, default_start_time = ? WHERE id = ?");
    $stmt->execute([
        sanitize($input['department']),
        sanitize($input['title']),
        floatval($input['duration_hours']),
        json_encode($input['routine_days'] ?? []),
        json_encode($input['checklist_template'] ?? []),
        $input['default_start_time'] ?? '09:00:00',
        $id
    ]);
    
    jsonResponse(['success' => true]);
}

function deleteTemplate() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    verifyCSRFToken();

    if (!isAdmin()) jsonResponse(['success' => false, 'message' => 'Admin only'], 403);
    
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;
    
    if (!$id) jsonResponse(['success' => false, 'message' => 'ID required'], 400);
    
    $db = getDB();
    $stmt = $db->prepare("DELETE FROM routine_templates WHERE id = ?");
    $stmt->execute([$id]);
    
    jsonResponse(['success' => true]);
}
