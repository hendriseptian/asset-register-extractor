-- PV intake staging for documents where equipment identity is not yet confirmed.
-- Records without a source-supported equipment tag remain pending and are not assigned a fabricated tag.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pv_intake_staging (
  id TEXT PRIMARY KEY,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  extraction_model TEXT,
  record_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_identification'
    CHECK (status IN ('pending_identification', 'matched', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_pv_intake_staging_status ON pv_intake_staging(status, created_at);
