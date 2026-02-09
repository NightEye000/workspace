<?php
/**
 * Cron Job for Generating Routine Tasks
 * Run this script daily via Task Scheduler or Cron.
 * Example: 0 0 * * * php C:/laragon/www/workspace/api/cron_generate.php
 */

// Command Line Interface only check (optional, but good practice)
if (php_sapi_name() !== 'cli' && !isset($_GET['secret_key'])) {
    // die("Access denied"); 
    // Commented out to allow testing via browser for now
}

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/constants.php'; // If needed

// Basic helper functions if 'functions.php' has dependencies we don't want (like session start?)
// create dummy functions if needed or just query directly.

$db = getDB();

echo "Starting Routine Generation (30 Days)...\n";

try {
    // 1. Get All Active Staff
    $users = $db->query("SELECT id, role, name FROM users WHERE role != 'Admin' AND is_active = 1")->fetchAll();

    $startDate = date('Y-m-d');
    $count = 0;

    foreach ($users as $user) {
        $dept = $user['role'];
        echo "Processing user: {$user['name']} ($dept)...\n";

        // A. Departments Templates
        $stmtTpl = $db->prepare("SELECT * FROM routine_templates WHERE department = ? AND is_active = 1");
        $stmtTpl->execute([$dept]);
        $templates = $stmtTpl->fetchAll();

        // B. Personal Routines
        $stmtPersonal = $db->prepare("
            SELECT title, start_time, end_time, routine_days 
            FROM tasks 
            WHERE staff_id = ? AND is_routine = 1 
            ORDER BY id DESC
        ");
        $stmtPersonal->execute([$user['id']]);
        $personalRoutines = $stmtPersonal->fetchAll();

        // Filter unique personal routines
        $uniquePersonal = [];
        foreach ($personalRoutines as $pr) {
            if (!isset($uniquePersonal[$pr['title']])) {
                $uniquePersonal[$pr['title']] = $pr;
            }
        }

        // Loop 30 Days
        for ($d = 0; $d < 30; $d++) {
            $targetDate = date('Y-m-d', strtotime("$startDate +$d days"));
            $dayOfWeek = date('w', strtotime($targetDate));

            // 1. Process Templates
            foreach ($templates as $tpl) {
                if (!empty($tpl['start_date']) && $targetDate < $tpl['start_date']) continue;

                $days = json_decode($tpl['routine_days'], true);
                if (is_array($days) && in_array($dayOfWeek, $days)) {
                    // Check duplicate
                    $stmtCheck = $db->prepare("SELECT id FROM tasks WHERE staff_id = ? AND task_date = ? AND title = ?");
                    $stmtCheck->execute([$user['id'], $targetDate, $tpl['title']]);
                    if (!$stmtCheck->fetch()) {
                        // Insert
                        $startTime = $tpl['default_start_time'];
                        $duration = floatval($tpl['duration_hours']);
                        $endTime = date('H:i:s', strtotime($startTime) + ($duration * 3600));

                        $stmtInsert = $db->prepare("
                            INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, created_by) 
                            VALUES (?, ?, 'Jobdesk', 'todo', ?, ?, ?, 1, ?, NULL)
                        "); // Created by NULL = System
                        
                        $stmtInsert->execute([
                            $user['id'],
                            $tpl['title'],
                            $targetDate,
                            $startTime,
                            $endTime,
                            $tpl['routine_days']
                        ]);
                        $newId = $db->lastInsertId();
                        $count++;

                        // Checklist
                        $checklist = json_decode($tpl['checklist_template'], true);
                        if ($checklist) {
                            $stmtItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
                            foreach ($checklist as $idx => $text) {
                                $stmtItem->execute([$newId, $text, $idx]);
                            }
                        }
                    }
                }
            }

            // 2. Process Personal Routines
            foreach ($uniquePersonal as $routine) {
                $days = json_decode($routine['routine_days'], true);
                if (is_array($days) && in_array($dayOfWeek, $days)) {
                    $stmtCheck = $db->prepare("SELECT id FROM tasks WHERE staff_id = ? AND task_date = ? AND title = ?");
                    $stmtCheck->execute([$user['id'], $targetDate, $routine['title']]);
                    if (!$stmtCheck->fetch()) {
                        $stmtInsert = $db->prepare("
                            INSERT INTO tasks (staff_id, title, category, status, task_date, start_time, end_time, is_routine, routine_days, created_by) 
                            VALUES (?, ?, 'Jobdesk', 'todo', ?, ?, ?, 1, ?, 0)
                        ");
                        $stmtInsert->execute([
                            $user['id'],
                            $routine['title'],
                            $targetDate,
                            $routine['start_time'],
                            $routine['end_time'],
                            $routine['routine_days']
                        ]);
                        $newId = $db->lastInsertId();
                        $count++;

                        // Copy Checklists logic (simplified for cron: try to copy from previous task)
                        $stmtLast = $db->prepare("SELECT id FROM tasks WHERE staff_id = ? AND title = ? AND is_routine = 1 AND id != ? ORDER BY id DESC LIMIT 1");
                        $stmtLast->execute([$user['id'], $routine['title'], $newId]);
                        $lastTask = $stmtLast->fetch();
                        if ($lastTask) {
                            $stmtItems = $db->prepare("SELECT text, sort_order FROM checklist_items WHERE task_id = ?");
                            $stmtItems->execute([$lastTask['id']]);
                            $items = $stmtItems->fetchAll();
                            $stmtInsItem = $db->prepare("INSERT INTO checklist_items (task_id, text, sort_order) VALUES (?, ?, ?)");
                            foreach ($items as $itm) {
                                $stmtInsItem->execute([$newId, $itm['text'], $itm['sort_order']]);
                            }
                        }
                    }
                }
            }
        }
    }

    echo "Done! Generated $count tasks.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
