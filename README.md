# OfficeSync - Staff Timeline Management System

A dynamic web application for managing daily work schedules and monitoring staff performance.

## Features

### User Roles
- **Admin/SuperAdmin**: Full CRUD access for all users and tasks
- **Staff/User**: Can only manage their own daily work

### Core Features
1. **Timeline View** - Visual timeline showing all staff and their daily tasks
2. **Task Management** - Create, update, delete tasks with categories:
   - Jobdesk (Routine work)
   - Tugas Tambahan (Additional tasks)
   - Inisiatif (Initiative)
   - Request (Cross-department requests)

3. **Request System** - Any user can send task requests to other users
4. **Checklist System** - Tasks have checklists that auto-update task status
5. **Performance Tracking** - Visual performance metrics per staff

### Notifications
1. **Deadline Alerts** - 5 minutes before a task must be completed
2. **Transition Alerts** - 5 minutes before the next task begins
3. **Request Notifications** - When receiving new requests
4. **Browser Push Notifications** - Chrome notifications for important alerts

## Installation

### Requirements
- PHP 7.4+ with PDO MySQL extension
- MySQL 5.7+ or MariaDB 10.3+
- Apache with mod_rewrite (for Laragon, this is enabled by default)

### Setup Steps

1. **Create the database**
   ```bash
   # In MySQL/MariaDB
   mysql -u root -p < setup.sql
   ```

   Or import `setup.sql` via phpMyAdmin.

2. **Configure database connection**
   
   Edit `config/database.php` if your database credentials differ:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'staff_timeline');
   define('DB_USER', 'root');
   define('DB_PASS', '');
   ```

3. **Access the application**
   
   Navigate to: `http://localhost/timelines_working/`

## Default Users

| Username | Password | Role | Description |
|----------|----------|------|-------------|
| admin | admin | Admin | Full access |
| fallah | 1234 | Advertiser | |
| hilal | 1234 | Design Grafis | |
| putri | 1234 | Konten Video | |
| budi | 1234 | Admin Order | |
| sari | 1234 | Customer Service | |
| rina | 1234 | Marketplace | |
| andi | 1234 | Gudang | |

## Project Structure

```
timelines_working/
├── api/                    # API endpoints
│   ├── auth.php           # Authentication
│   ├── users.php          # User management
│   ├── tasks.php          # Task CRUD
│   ├── notifications.php  # Notifications
│   ├── comments.php       # Comments & Attachments
│   └── routines.php       # Routine templates
├── assets/
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   ├── js/
│   │   ├── api.js         # API helper
│   │   ├── app.js         # Main application
│   │   └── notifications.js # Browser notifications
│   └── images/
├── config/
│   ├── database.php       # DB connection
│   └── constants.php      # App constants
├── helpers/
│   └── functions.php      # Helper functions
├── logs/                  # Application logs
├── index.php              # Main entry point
├── setup.sql              # Database setup
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth.php?action=login` - Login
- `GET /api/auth.php?action=logout` - Logout
- `GET /api/auth.php?action=check` - Check auth status

### Users (Admin only for write operations)
- `GET /api/users.php?action=list` - List users
- `POST /api/users.php?action=create` - Create user
- `POST /api/users.php?action=update` - Update user
- `POST /api/users.php?action=delete` - Delete user

### Tasks
- `GET /api/tasks.php?action=list&date=YYYY-MM-DD` - List tasks
- `GET /api/tasks.php?action=get&id=X` - Get task detail
- `POST /api/tasks.php?action=create` - Create task
- `POST /api/tasks.php?action=toggle_checklist` - Toggle checklist item
- `POST /api/tasks.php?action=generate_routines` - Generate routines (Admin)

### Notifications
- `GET /api/notifications.php?action=list` - List notifications
- `GET /api/notifications.php?action=check_deadlines` - Check for alerts
- `POST /api/notifications.php?action=clear` - Clear notifications

## Browser Notifications

The app requests browser notification permission on login. Notifications are sent for:
1. Task deadline approaching (5 min before end time)
2. Next task starting soon (5 min before start time)
3. New request received

## License

MIT License
