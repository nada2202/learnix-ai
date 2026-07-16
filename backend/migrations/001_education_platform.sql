CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  school_type VARCHAR(100),
  address TEXT,
  city VARCHAR(120),
  country VARCHAR(120) DEFAULT 'Morocco',
  phone VARCHAR(60),
  official_email VARCHAR(255),
  logo_url TEXT,
  legal_documents_json LONGTEXT,
  director_user_id INT,
  director_name VARCHAR(255),
  director_email VARCHAR(255),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  requester_user_id INT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  admin_user_id INT,
  decision_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS levels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  sort_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT,
  name VARCHAR(255) NOT NULL,
  level_name VARCHAR(120) NOT NULL,
  study_system VARCHAR(120) DEFAULT 'Système marocain',
  academic_year VARCHAR(20) NOT NULL,
  pedagogical_structure LONGTEXT,
  status ENUM('draft','pending','approved','archived') DEFAULT 'draft',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  level_name VARCHAR(120),
  weekly_hours DECIMAL(4,2) DEFAULT 1,
  pedagogical_objectives TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_modules (
  class_id INT NOT NULL,
  module_id INT NOT NULL,
  PRIMARY KEY (class_id, module_id)
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id INT NOT NULL,
  student_user_id INT NOT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS class_teachers (
  class_id INT NOT NULL,
  teacher_user_id INT NOT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, teacher_user_id)
);

CREATE TABLE IF NOT EXISTS module_teachers (
  module_id INT NOT NULL,
  teacher_user_id INT NOT NULL,
  PRIMARY KEY (module_id, teacher_user_id)
);

CREATE TABLE IF NOT EXISTS student_modules (
  student_user_id INT NOT NULL,
  module_id INT NOT NULL,
  teacher_user_id INT NULL,
  status ENUM('pending','approved','active','archived') DEFAULT 'active',
  PRIMARY KEY (student_user_id, module_id)
);

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  class_id INT NULL,
  module_id INT NULL,
  teacher_user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT,
  files_json LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  class_id INT NULL,
  module_id INT NULL,
  teacher_user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  access_scope ENUM('class','students','free_students') DEFAULT 'class',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  class_id INT NULL,
  module_id INT NULL,
  teacher_user_id INT NULL,
  title VARCHAR(255) NOT NULL,
  grading_scale LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NULL,
  exam_id INT NULL,
  prompt LONGTEXT NOT NULL,
  expected_answer LONGTEXT,
  points DECIMAL(5,2) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  student_user_id INT,
  answer LONGTEXT,
  is_correct BOOLEAN,
  feedback LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NULL,
  exam_id INT NULL,
  student_user_id INT,
  score DECIMAL(6,2),
  feedback LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_learning_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  estimated_level VARCHAR(120),
  strengths LONGTEXT,
  weaknesses LONGTEXT,
  recommendations LONGTEXT,
  history_summary LONGTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NULL,
  class_id INT NOT NULL,
  generated_by INT NULL,
  status ENUM('draft','published') DEFAULT 'draft',
  entries_json LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teacher_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_user_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_availability (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  day_of_week TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
