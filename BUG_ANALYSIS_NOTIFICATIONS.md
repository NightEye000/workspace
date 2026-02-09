# Analisis Bug Potensial - notifications.php

## 🔴 BUG KRITIS

### 1. **Missing Input Validation pada `markAsRead()` (Line 65-69)**
**Lokasi:** Line 65-68
```php
$input = json_decode(file_get_contents('php://input'), true);
// ...
$stmt->execute([$input['id'], getCurrentUser()['id']]);
```

**Masalah:**
- Tidak ada validasi jika JSON decode gagal (return null)
- Tidak ada pengecekan apakah key `'id'` ada di array `$input`
- Jika `$input` null atau `$input['id']` tidak ada, akan terjadi PHP Warning/Error

**Dampak:** 
- Error 500 jika JSON invalid atau field 'id' tidak ada
- Potensi crash aplikasi

**Solusi:**
```php
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || !isset($input['id'])) {
    jsonResponse(['success' => false, 'message' => 'Invalid input: id required'], 400);
}
```

---

### 2. **SQL Injection Risk pada `getPendingBrowserNotifications()` (Line 107)**
**Lokasi:** Line 106-107
```php
$placeholders = implode(',', array_fill(0, count($ids), '?'));
$db->prepare("UPDATE notifications SET is_browser_sent = 1 WHERE id IN ($placeholders)")->execute($ids);
```

**Masalah:**
- Meskipun menggunakan prepared statement, jika `$ids` kosong, query menjadi `WHERE id IN ()` yang invalid SQL
- Tidak ada error handling jika prepare/execute gagal

**Dampak:**
- SQL syntax error jika tidak ada notifications
- Error 500 jika query gagal

**Solusi:**
```php
if (!empty($ids)) {
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare("UPDATE notifications SET is_browser_sent = 1 WHERE id IN ($placeholders)");
    $stmt->execute($ids);
}
```

---

### 3. **Null Pointer Risk pada `getCurrentUser()['id']` (Multiple Locations)**
**Lokasi:** Line 38, 45, 53, 55, 68, 79, 80, 91, 98, 101, 115, 134, 148

**Masalah:**
- `getCurrentUser()` bisa return `null` (lihat helpers/functions.php line 56)
- Mengakses `['id']` langsung tanpa null check akan menyebabkan PHP Warning/Error

**Dampak:**
- Error jika session user tidak valid
- Potensi crash aplikasi

**Solusi:**
```php
$currentUser = getCurrentUser();
if (!$currentUser || !isset($currentUser['id'])) {
    jsonResponse(['success' => false, 'message' => 'User session invalid'], 401);
}
```

**Catatan:** Meskipun ada check `isLoggedIn()` di line 21, race condition atau session corruption bisa terjadi antara check dan penggunaan.

---

## ⚠️ BUG MENENGAH

### 4. **Missing DateTime Validation pada `checkDeadlines()` (Line 125, 141)**
**Lokasi:** Line 125, 141
```php
$endTime = new DateTime($today . ' ' . $task['end_time']);
// ...
$nextStart = new DateTime($today . ' ' . $next['start_time']);
```

**Masalah:**
- Tidak ada validasi apakah `end_time` atau `start_time` ada di array
- Tidak ada validasi format waktu (bisa null, empty string, atau format invalid)
- `DateTime` constructor akan throw Exception jika format invalid

**Dampak:**
- Fatal error jika waktu tidak valid
- Error 500 jika data task corrupt

**Solusi:**
```php
if (empty($task['end_time']) || !preg_match('/^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/', $task['end_time'])) {
    continue; // Skip invalid task
}
try {
    $endTime = new DateTime($today . ' ' . $task['end_time']);
} catch (Exception $e) {
    continue; // Skip invalid datetime
}
```

---

### 5. **Division by Zero / NULL Handling pada Progress Calculation (Line 132)**
**Lokasi:** Line 132
```php
$progress = $task['total_checklist'] > 0 ? round(($task['done_checklist'] / $task['total_checklist']) * 100) : 0;
```

**Masalah:**
- Jika `done_checklist` adalah NULL (dari SUM query), operasi matematika akan menghasilkan NULL
- Tidak ada pengecekan apakah `done_checklist` adalah numeric

**Dampak:**
- Progress bisa menjadi NULL bukan 0
- Message notification bisa menampilkan "Progress: " tanpa angka

**Solusi:**
```php
$totalChecklist = (int)($task['total_checklist'] ?? 0);
$doneChecklist = (int)($task['done_checklist'] ?? 0);
$progress = $totalChecklist > 0 ? round(($doneChecklist / $totalChecklist) * 100) : 0;
```

---

### 6. **Missing Error Handling untuk Database Queries**
**Lokasi:** Semua fungsi database

**Masalah:**
- Tidak ada try-catch untuk database operations
- Tidak ada pengecekan apakah `execute()` berhasil
- Error database akan langsung crash aplikasi

**Dampak:**
- Error 500 tanpa pesan yang jelas ke user
- Tidak ada logging untuk debugging

**Solusi:**
```php
try {
    $stmt = $db->prepare("...");
    if (!$stmt->execute([...])) {
        throw new Exception("Database query failed");
    }
} catch (PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    jsonResponse(['success' => false, 'message' => 'Database error occurred'], 500);
}
```

---

### 7. **Array Access tanpa Validation pada `checkDeadlines()` (Line 139)**
**Lokasi:** Line 139
```php
if (isset($tasks[$index + 1])) {
    $next = $tasks[$index + 1];
```

**Masalah:**
- Menggunakan `$index + 1` tanpa memastikan array masih sequential
- Jika array di-reorder atau ada gap, bisa mengakses task yang salah

**Dampak:**
- Logic error dalam perhitungan transisi task
- Bisa skip task atau hitung task yang salah

**Solusi:**
```php
// Lebih aman menggunakan next() atau array pointer
reset($tasks);
while (($current = current($tasks)) !== false) {
    // Process current task
    $next = next($tasks);
    if ($next !== false) {
        // Process transition
    }
}
```

---

## 💡 BUG MINOR / IMPROVEMENT

### 8. **Missing JSON Decode Error Handling (Line 65)**
**Lokasi:** Line 65
```php
$input = json_decode(file_get_contents('php://input'), true);
```

**Masalah:**
- Tidak ada pengecekan `json_last_error()`
- Jika JSON malformed, `$input` akan null tanpa error message yang jelas

**Solusi:**
```php
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    jsonResponse(['success' => false, 'message' => 'Invalid JSON: ' . json_last_error_msg()], 400);
}
```

---

### 9. **Potential XSS pada Notification Messages (Line 133, 147)**
**Lokasi:** Line 133, 147
```php
$msg = "⏰ \"{$task['title']}\" harus selesai dalam {$minutesUntilEnd} menit! Progress: {$progress}%";
```

**Masalah:**
- `$task['title']` langsung di-interpolate ke string tanpa sanitization
- Jika title mengandung karakter khusus atau script, bisa jadi masalah saat ditampilkan di frontend

**Dampak:**
- Potensi XSS jika frontend tidak escape dengan benar
- Formatting issue jika title mengandung quotes

**Solusi:**
```php
$title = htmlspecialchars($task['title'], ENT_QUOTES, 'UTF-8');
$msg = "⏰ \"{$title}\" harus selesai dalam {$minutesUntilEnd} menit! Progress: {$progress}%";
```

**Catatan:** Atau pastikan frontend selalu escape output.

---

### 10. **Missing HTTP Method Validation untuk GET Actions**
**Lokasi:** Line 25-33

**Masalah:**
- `check_deadlines` dan `pending_browser` bisa diakses via POST/PUT/DELETE
- Tidak ada validasi HTTP method untuk actions yang seharusnya hanya GET

**Dampak:**
- Inconsistent API behavior
- Potensi security issue jika action sensitive

**Solusi:**
```php
case 'check_deadlines':
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(['success' => false, 'message' => 'Method not allowed'], 405);
    }
    checkDeadlines();
    break;
```

---

### 11. **Race Condition pada `getPendingBrowserNotifications()` (Line 100-107)**
**Lokasi:** Line 100-107

**Masalah:**
- SELECT dan UPDATE dilakukan secara terpisah
- Jika multiple requests terjadi bersamaan, bisa terjadi duplicate notifications

**Dampak:**
- User bisa menerima notifikasi yang sama beberapa kali
- Inconsistent state

**Solusi:**
```php
// Gunakan transaction atau atomic update
$db->beginTransaction();
try {
    $stmt = $db->prepare("SELECT * FROM notifications WHERE user_id = ? AND is_browser_sent = 0 ORDER BY created_at DESC LIMIT 10 FOR UPDATE");
    $stmt->execute([$currentUser['id']]);
    $notifications = $stmt->fetchAll();
    
    if (!empty($notifications)) {
        $ids = array_column($notifications, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $db->prepare("UPDATE notifications SET is_browser_sent = 1 WHERE id IN ($placeholders)")->execute($ids);
    }
    $db->commit();
} catch (Exception $e) {
    $db->rollBack();
    throw $e;
}
```

---

## 📊 RINGKASAN

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Kritis | 3 | Perlu diperbaiki segera |
| ⚠️ Menengah | 4 | Perlu diperbaiki |
| 💡 Minor | 4 | Disarankan untuk improvement |

**Total Bug Potensial: 11**

---

## ✅ REKOMENDASI PRIORITAS PERBAIKAN

1. **PRIORITAS TINGGI:**
   - Bug #1: Input validation `markAsRead()`
   - Bug #3: Null pointer pada `getCurrentUser()['id']`
   - Bug #2: SQL injection risk `getPendingBrowserNotifications()`

2. **PRIORITAS MENENGAH:**
   - Bug #4: DateTime validation
   - Bug #5: NULL handling pada progress
   - Bug #6: Database error handling

3. **PRIORITAS RENDAH:**
   - Bug #7-11: Improvements dan optimizations
