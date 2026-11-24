-- MECHASSET D1 initial schema
-- Stores extracted engineering data and processing checkpoints only.
-- Original PDF/image bytes are intentionally NOT stored in D1.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS equipment (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK (module IN ('PSV', 'BVV', 'PV')),
  tag TEXT,
  serial_number TEXT,
  equipment_name TEXT,
  owner_operator TEXT,
  location TEXT,
  identity_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_tag ON equipment(tag);
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number);
CREATE INDEX IF NOT EXISTS idx_equipment_module ON equipment(module);

CREATE TABLE IF NOT EXISTS extraction_jobs (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK (module IN ('PSV', 'BVV', 'PV')),
  job_type TEXT NOT NULL DEFAULT 'document',
  equipment_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'detecting', 'processing', 'review', 'completed', 'failed', 'cancelled')),
  current_stage TEXT,
  total_pages INTEGER NOT NULL DEFAULT 0,
  detected_pages INTEGER NOT NULL DEFAULT 0,
  completed_pages INTEGER NOT NULL DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 0,
  completed_batches INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON extraction_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_equipment ON extraction_jobs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON extraction_jobs(created_at);

CREATE TABLE IF NOT EXISTS job_documents (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  document_role TEXT NOT NULL DEFAULT 'source'
    CHECK (document_role IN ('source', 'previous_report', 'previous_ut', 'last_ut', 'datasheet', 'coi', 'other')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (processing_status IN ('queued', 'detecting', 'processing', 'completed', 'failed', 'deleted')),
  storage_mode TEXT NOT NULL DEFAULT 'memory_only'
    CHECK (storage_mode IN ('memory_only', 'temporary_external')),
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT,
  FOREIGN KEY (job_id) REFERENCES extraction_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_documents_job ON job_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_documents_role ON job_documents(document_role);

CREATE TABLE IF NOT EXISTS processing_batches (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  batch_number INTEGER NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  checkpoint_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (job_id) REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES job_documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_job_status ON processing_batches(job_id, status);
CREATE INDEX IF NOT EXISTS idx_batches_checkpoint ON processing_batches(checkpoint_at);

CREATE TABLE IF NOT EXISTS extracted_records (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  document_id TEXT,
  batch_id TEXT,
  equipment_id TEXT,
  record_type TEXT NOT NULL,
  component_name TEXT,
  source_page INTEGER,
  source_section TEXT,
  confidence REAL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'accepted', 'rejected', 'needs_review')),
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (job_id) REFERENCES extraction_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES job_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (batch_id) REFERENCES processing_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_records_job ON extracted_records(job_id);
CREATE INDEX IF NOT EXISTS idx_records_equipment ON extracted_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_records_component ON extracted_records(component_name);
CREATE INDEX IF NOT EXISTS idx_records_review ON extracted_records(review_status);
