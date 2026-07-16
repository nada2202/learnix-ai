SET @has_module_id = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_context_documents' AND column_name = 'module_id'
);
SET @sql = IF(@has_module_id = 0,
  'ALTER TABLE ai_context_documents ADD COLUMN module_id INT NULL AFTER class_id',
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @has_module_name = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'ai_context_documents' AND column_name = 'module_name'
);
SET @sql = IF(@has_module_name = 0,
  'ALTER TABLE ai_context_documents ADD COLUMN module_name VARCHAR(255) NULL AFTER module_id',
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @has_module_index = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'ai_context_documents' AND index_name = 'idx_ai_document_module'
);
SET @sql = IF(@has_module_index = 0,
  'ALTER TABLE ai_context_documents ADD INDEX idx_ai_document_module (user_id, module_id, created_at)',
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;
