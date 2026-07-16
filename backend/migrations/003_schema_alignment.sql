SET @current_schema = DATABASE();

SET @add_duration_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'duration_minutes') = 0,
  'ALTER TABLE exams ADD COLUMN duration_minutes INT NULL',
  'SELECT 1'
);
PREPARE add_duration_stmt FROM @add_duration_sql;
EXECUTE add_duration_stmt;
DEALLOCATE PREPARE add_duration_stmt;

SET @add_access_date_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'access_date') = 0,
  'ALTER TABLE exams ADD COLUMN access_date DATETIME NULL',
  'SELECT 1'
);
PREPARE add_access_date_stmt FROM @add_access_date_sql;
EXECUTE add_access_date_stmt;
DEALLOCATE PREPARE add_access_date_stmt;
