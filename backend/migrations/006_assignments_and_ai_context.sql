CREATE TABLE IF NOT EXISTS student_school_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_user_id INT NOT NULL,
  school_id INT NOT NULL,
  message TEXT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  decided_by INT NULL,
  decision_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  INDEX idx_student_school_request (student_user_id, status),
  INDEX idx_school_student_request (school_id, status)
);

CREATE TABLE IF NOT EXISTS ai_context_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  school_id INT NULL,
  class_id INT NULL,
  education_level VARCHAR(120) NULL,
  file_name VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_document_user (user_id, created_at),
  INDEX idx_ai_document_scope (school_id, class_id)
);
