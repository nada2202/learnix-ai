SET @current_schema = DATABASE();

SET @add_quiz_difficulty = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @current_schema AND TABLE_NAME = 'quizzes' AND COLUMN_NAME = 'difficulty') = 0,
  'ALTER TABLE quizzes ADD COLUMN difficulty VARCHAR(50) NULL',
  'SELECT 1'
);
PREPARE add_quiz_difficulty_stmt FROM @add_quiz_difficulty;
EXECUTE add_quiz_difficulty_stmt;
DEALLOCATE PREPARE add_quiz_difficulty_stmt;
