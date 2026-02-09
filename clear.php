<?php
/**
 * PHP Native Cache Clear Utility
 * Inspired by php artisan optimize:clear
 */

// Define paths to clear
$targets = [
    'Logs' => __DIR__ . '/logs',
    'Temp' => __DIR__ . '/tmp', // In case it exists in the future
];

echo "------------------------------------------\n";
echo "   PHP Native Project Cache Cleaner\n";
echo "------------------------------------------\n\n";

// 1. Clear OPcache
if (function_exists('opcache_reset')) {
    if (opcache_reset()) {
        echo "[√] OPcache: Successfully reset.\n";
    } else {
        echo "[x] OPcache: Failed to reset (is it enabled?).\n";
    }
} else {
    echo "[!] OPcache: Extension not loaded.\n";
}

// 2. Clear Specific Directories
foreach ($targets as $label => $path) {
    if (is_dir($path)) {
        echo "[...] $label: Cleaning $path...\n";
        
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );

        $count = 0;
        foreach ($files as $fileinfo) {
            // Keep .gitkeep if exists
            if ($fileinfo->getFilename() === '.gitkeep') continue;
            
            $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
            if ($todo($fileinfo->getRealPath())) {
                $count++;
            }
        }
        echo "[√] $label: $count items cleared.\n";
    } else {
        // echo "[i] $label: Directory not found, skipping.\n";
    }
}

// 3. Clear Session (Optional - use with care)
/*
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
session_destroy();
echo "[√] Sessions: Destroyed current session.\n";
*/

echo "\n------------------------------------------\n";
echo "   DONE: Project is now fresh!\n";
echo "------------------------------------------\n";
