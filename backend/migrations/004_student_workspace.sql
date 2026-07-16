ALTER TABLE students ADD COLUMN birth_date DATE NULL;
ALTER TABLE students ADD COLUMN phone VARCHAR(60) NULL;
ALTER TABLE students ADD COLUMN guardian_name VARCHAR(255) NULL;
ALTER TABLE students ADD COLUMN guardian_phone VARCHAR(60) NULL;
ALTER TABLE students ADD COLUMN preferred_language VARCHAR(10) DEFAULT 'fr';
ALTER TABLE students ADD COLUMN learning_style VARCHAR(80) NULL;
ALTER TABLE students ADD COLUMN interests_json LONGTEXT NULL;
ALTER TABLE students ADD COLUMN notes TEXT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_user_id INT NOT NULL,
  recipient_user_id INT NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_conversation (sender_user_id, recipient_user_id, created_at),
  INDEX idx_messages_recipient_read (recipient_user_id, read_at)
);

DELETE t
FROM teachers t
LEFT JOIN users u ON u.id = t.user_id
WHERE u.id IS NULL;
