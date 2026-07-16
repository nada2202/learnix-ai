SET @current_schema = DATABASE();
SET @add_role_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role') = 0,
  'ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT ''student''',
  'SELECT 1'
);
PREPARE add_role_stmt FROM @add_role_sql;
EXECUTE add_role_stmt;
DEALLOCATE PREPARE add_role_stmt;

SET @add_status_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE users ADD COLUMN status VARCHAR(30) DEFAULT ''active''',
  'SELECT 1'
);
PREPARE add_status_stmt FROM @add_status_sql;
EXECUTE add_status_stmt;
DEALLOCATE PREPARE add_status_stmt;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE,
  permissions_json LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS education_levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  sort_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  mode ENUM('assigned','free') DEFAULT 'assigned',
  school_id INT NULL,
  bio TEXT,
  specialties_json LONGTEXT,
  status ENUM('active','disabled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  mode ENUM('assigned','free') DEFAULT 'assigned',
  school_id INT NULL,
  main_class_id INT NULL,
  education_level VARCHAR(120),
  goals_json LONGTEXT,
  status ENUM('active','disabled') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_school_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_user_id INT NOT NULL,
  school_id INT NOT NULL,
  message TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  decided_by INT,
  decision_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME
);

CREATE TABLE IF NOT EXISTS student_class_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  class_id INT NOT NULL,
  message TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  decided_by INT,
  decision_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME
);

CREATE TABLE IF NOT EXISTS course_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(120),
  file_size INT,
  storage_path TEXT,
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  access_type ENUM('class','group','student','free_student') NOT NULL,
  target_id INT,
  granted_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  access_type ENUM('class','group','student','free_student') NOT NULL,
  target_id INT,
  granted_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_contexts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  context_level ENUM('global','school','class','module','teacher','student') NOT NULL,
  target_id INT,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_generated_exercises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT,
  module_id INT,
  prompt_hash VARCHAR(128),
  difficulty VARCHAR(50),
  exercises_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  module_id INT,
  recommendation_type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  status ENUM('new','seen','completed') DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  class_id INT NOT NULL,
  module_id INT,
  teacher_user_id INT,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(80),
  conflict_status ENUM('clear','conflict') DEFAULT 'clear',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80),
  entity_id INT,
  metadata_json LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_user_id INT,
  target_type VARCHAR(80),
  target_id INT,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  status ENUM('open','reviewing','resolved','rejected') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
