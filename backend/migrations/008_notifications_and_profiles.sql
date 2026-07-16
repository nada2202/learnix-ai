SET @current_schema = DATABASE();

SET @add_notification_type = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'notification_type') = 0,
  'ALTER TABLE notifications ADD COLUMN notification_type VARCHAR(80) DEFAULT ''general''',
  'SELECT 1'
);
PREPARE add_notification_type_stmt FROM @add_notification_type;
EXECUTE add_notification_type_stmt;
DEALLOCATE PREPARE add_notification_type_stmt;

SET @add_notification_link = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'action_path') = 0,
  'ALTER TABLE notifications ADD COLUMN action_path VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE add_notification_link_stmt FROM @add_notification_link;
EXECUTE add_notification_link_stmt;
DEALLOCATE PREPARE add_notification_link_stmt;

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at, created_at);
