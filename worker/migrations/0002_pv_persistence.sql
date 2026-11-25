-- MECHASSET PV persistence layer. Source files are NOT stored; only metadata and extracted JSON are retained.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pv_documents (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  period TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  extraction_model TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pv_extracted_records (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  equipment_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('document', 'previous_ut', 'last_ut')),
  record_json TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'flagged')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (document_id) REFERENCES pv_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pv_documents_equipment ON pv_documents(equipment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pv_records_equipment_type ON pv_extracted_records(equipment_id, record_type, created_at);
CREATE INDEX IF NOT EXISTS idx_pv_records_document ON pv_extracted_records(document_id);
