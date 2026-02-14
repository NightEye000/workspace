<?php
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/constants.php';

// Get non-admin users
try {
    $db = getDB();
    $sql = "SELECT id, username FROM users WHERE role != 'Admin'";
    $stmt = $db->query($sql);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($users) === 0) {
        echo "No non-admin users found to clear tasks for.
";
    }

    foreach ($users as $user) {
        echo "Processing user: {$user['username']} (ID: {$user['id']})
";

        // Delete tasks
        $stmt = $db->prepare("DELETE FROM tasks WHERE staff_id = ?");
        $stmt->execute([$user['id']]);
        echo "  - Deleted tasks: {$stmt->rowCount()} rows
";

        // Delete checklist items
        $stmt = $db->prepare("DELETE FROM checklist_items WHERE task_id IN (SELECT id FROM tasks WHERE staff_id = ?)");
        $stmt->execute([$user['id']]);

        // Delete attachments
        $stmt = $db->prepare("DELETE FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE staff_id = ?)");
        $stmt->execute([$user['id']]);

        // Delete comments
        $stmt = $db->prepare("DELETE FROM comments WHERE task_id IN (SELECT id FROM tasks WHERE staff_id = ?)");
        $stmt->execute([$user['id']]);

        // Delete notifications
        $stmt = $db->prepare("DELETE FROM notifications WHERE user_id = ?");
        $stmt->execute([$user['id']]);
        echo "  - Deleted notifications: {$stmt->rowCount()} rows
";
    }

    echo "Cleanup complete for non-admin users.
";
} catch (PDOException $e) {
    die("DB Error: " . $e->getMessage());
}
