import { buildExtractionPrompt, buildTableMappingPrompt, PSV_FIELDS, buildBvvExtractionPrompt, buildBvvTableMappingPrompt, BVV_FIELDS } from './prompts.js';
import { extractWithGemini, mapTableWithGemini } from './gemini.js';
import { buildPvDocumentPrompt } from './pv-prompts.js';


// Allow GitHub Pages user sites automatically (https://<username>.github.io).
// Keep local development origins explicit; do not reflect arbitrary Origin values.
const LOCAL_DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_TABLE_BYTES = 90 * 1024;
const MODEL_DEFAULT = 'gemini-3.5-flash-lite';

function getAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  if (LOCAL_DEVELOPMENT_ORIGINS.has(origin)) return origin;

  try {
    const parsed = new URL(origin);
    const isCanonicalHttpsOrigin =
      parsed.protocol === 'https:' &&
      parsed.origin === origin &&
      !parsed.username &&
      !parsed.password;

    // GitHub Pages account sites use exactly one account label before github.io.
    // Example: https://hendriseptian.github.io
    const isGitHubPagesOrigin =
      isCanonicalHttpsOrigin &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.github\.io$/i.test(parsed.hostname);

    return isGitHubPagesOrigin ? origin : null;
  } catch {
    return null;
  }
}

function cors(request) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin;

  return headers;
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json; charset=utf-8' }
  });
}


// MECHASSET Equipment API helpers. Mutating and read operations require a Worker secret.
const EQUIPMENT_MODULES = new Set(['PSV', 'BVV', 'PV']);
const EQUIPMENT_FIELDS = ['tag', 'serial_number', 'equipment_name', 'owner_operator', 'location'];
const MAX_EQUIPMENT_FIELD_LENGTH = 300;

async function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function equipmentApiAuthorized(request, env) {
  const expected = env.MECHASSET_API_TOKEN;
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return Boolean(expected && match && await tokenMatches(match[1].trim(), expected));
}

function validateEquipmentPayload(body, requireModule = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  if (requireModule && !EQUIPMENT_MODULES.has(String(body.module || '').toUpperCase())) {
    return 'module must be PSV, BVV, or PV.';
  }
  for (const field of EQUIPMENT_FIELDS) {
    if (body[field] !== undefined && body[field] !== null &&
        (typeof body[field] !== 'string' || body[field].length > MAX_EQUIPMENT_FIELD_LENGTH)) {
      return field + ' must be text up to 300 characters.';
    }
  }
  if (body.identity_json !== undefined &&
      (!body.identity_json || typeof body.identity_json !== 'object' || Array.isArray(body.identity_json))) {
    return 'identity_json must be a JSON object.';
  }
  return null;
}

function parseMapping(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function filenameTagCandidate(fileName) {
  const name = String(fileName || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
  // Only accept an explicit PSV/BV-style filename, never certificate or serial-number filenames.
  if (!/^(?:BV|PSV)[-_ ]/i.test(name) || (name.match(/\d/g) || []).length < 2) return null;
  return name.replace(/\s+/g, ' ').trim();
}
// Split combined BV/BVV "Model / Ukuran" strings into the workbook's separate fields.
// BVV_YEAR_SPLIT_FIX_2026_11_19: uses split('/') and digit validation; no year regex.
function normalizeBvvYearAndUsed(record) {
  const output = { ...record };
  // Example: "1994/1994" under "Tahun Dibuat / Digunakan".
  // Split without a regular expression to avoid escaping/build-parser issues.
  const value = String(output.year_built ?? '').trim();
  const parts = value.split('/');
  if (parts.length === 2) {
    const built = parts[0].trim();
    const used = parts[1].trim();
    const isFourDigitYear = (year) => year.length === 4 && year.split('').every((ch) => ch >= '0' && ch <= '9');
    if (isFourDigitYear(built) && isFourDigitYear(used)) {
      output.year_built = built;
      if (!String(output.used ?? '').trim()) output.used = used;
    }
  }
  return output;
}

function normalizeBvvModelAndSize(record) {
  const output = { ...record };
  const modelText = String(output.model ?? '').trim();
  if (!modelText) return output;

  // Example: 2010-51/8"#150 -> model=2010-51, size=8", rating=#150.
  // Require an inch marker to avoid splitting ordinary model numbers or fractions.
  const combined = modelText.match(/^(.+?)\s*\/\s*(\d+(?:\s*[- ]\s*\d+\s*\/\s*\d+)?\s*(?:["″”]|inch(?:es)?|in\b))\s*(#\s*\d+|class\s*\d+)?\s*$/i);
  if (!combined) return output;

  const parsedModel = combined[1].trim();
  const parsedSize = combined[2].trim().replace(/[″”]/g, '"').replace(/\s+/g, ' ');
  const parsedRating = combined[3] ? combined[3].replace(/\s+/g, '').replace(/^class/i, '#') : null;

  output.model = parsedModel;
  if (!String(output.bvv_size_inch ?? '').trim()) output.bvv_size_inch = parsedSize;
  if (!String(output.bvv_rating ?? '').trim() && parsedRating) output.bvv_rating = parsedRating;
  return output;
}

function normalizePsvInspectionDates(record) {
  const output = { ...record };
  const dateInW = String(output.date_inspection ?? '').trim();
  const dateInL = String(output.actual_inspection_date ?? '').trim();

  // W is canonical. If W is empty, retain an existing L value as the best available date.
  const canonicalDate = dateInW || dateInL;
  if (canonicalDate) {
    output.date_inspection = canonicalDate;
    output.actual_inspection_date = canonicalDate;
    const year = canonicalDate.match(/\b\d{4}\b/);
    if (year) output.actual_inspection = year[0];
  }
  return output;
}

function normalizeRecords(records, fileName = '') {
  if (!Array.isArray(records)) throw new Error('AI response does not contain a records array.');
  const candidateTag = records.length === 1 ? filenameTagCandidate(fileName) : null;
  return records.map((record) => {
    const output = {};
    for (const [key] of PSV_FIELDS) output[key] = record?.[key] ?? null;
    output._source_location = record?._source_location ?? null;
    if ((!output.tag_psv || !String(output.tag_psv).trim()) && candidateTag) {
      output.tag_psv = candidateTag;
      output._tag_source = 'filename_candidate';
      output._source_location = [output._source_location, `Tag PSV candidate recovered from filename: ${fileName} (verify against source document)`].filter(Boolean).join(' | ');
    }
    Object.assign(output, normalizePsvInspectionDates(output));
    const confidence = Number(record?._confidence);
    output._confidence = output._tag_source === 'filename_candidate'
      ? Math.min(0.55, Number.isFinite(confidence) ? Math.max(0, confidence) : 0.5)
      : (Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5);
    return output;
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(request, {
        ok: true,
        service: 'asset-register-extractor-worker',
        aiProvider: env.GEMINI_API_KEY ? 'gemini-configured' : 'not-configured',
        model: env.GEMINI_MODEL || MODEL_DEFAULT,
        template: 'DTP PSV 39-column A:AM'
      });
    }

    // Read-only D1 connectivity check. Exposes only availability, never stored data.
    if (url.pathname === '/api/db/health' && request.method === 'GET') {
      if (!env.DB) {
        return json(request, { ok: false, database: 'unavailable', error: 'D1 binding DB is not configured.' }, 503);
      }
      try {
        const result = await env.DB.prepare(
          "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?, ?)"
        ).bind('equipment', 'extraction_jobs', 'job_documents', 'processing_batches', 'extracted_records').first();

        const tableCount = Number(result?.table_count || 0);
        return json(request, {
          ok: tableCount === 5,
          database: tableCount === 5 ? 'connected' : 'connected_schema_incomplete',
          expected_tables: 5,
          available_tables: tableCount
        }, tableCount === 5 ? 200 : 503);
      } catch (error) {
        return json(request, {
          ok: false,
          database: 'query_failed',
          error: 'D1 health query failed.'
        }, 503);
      }
    }

    // Equipment CRUD API. No records are exposed unless the caller has the private API token.
    if (url.pathname === '/api/equipment' || url.pathname.startsWith('/api/equipment/')) {
      if (!env.DB) return json(request, { error: 'D1 binding DB is not configured.' }, 503);
      if (!env.MECHASSET_API_TOKEN) return json(request, { error: 'Equipment API authentication is not configured.' }, 503);
      if (!await equipmentApiAuthorized(request, env)) {
        return json(request, { error: 'Unauthorized.' }, 401);
      }

      try {
        if (url.pathname === '/api/equipment' && request.method === 'GET') {
          const module = String(url.searchParams.get('module') || '').toUpperCase();
          const search = String(url.searchParams.get('search') || '').trim().slice(0, 100);
          if (module && !EQUIPMENT_MODULES.has(module)) {
            return json(request, { error: 'module must be PSV, BVV, or PV.' }, 400);
          }
          let query = 'SELECT id, module, tag, serial_number, equipment_name, owner_operator, location, identity_json, created_at, updated_at FROM equipment';
          const conditions = [];
          const values = [];
          if (module) { conditions.push('module = ?'); values.push(module); }
          if (search) {
            conditions.push('(tag LIKE ? OR serial_number LIKE ? OR equipment_name LIKE ?)');
            const term = '%' + search + '%';
            values.push(term, term, term);
          }
          if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
          query += ' ORDER BY updated_at DESC LIMIT 500';
          const result = await env.DB.prepare(query).bind(...values).all();
          return json(request, { ok: true, equipment: result.results || [], count: (result.results || []).length });
        }

        if (url.pathname === '/api/equipment' && request.method === 'POST') {
          const body = await request.json();
          const validationError = validateEquipmentPayload(body, true);
          if (validationError) return json(request, { error: validationError }, 400);
          const module = String(body.module).toUpperCase();
          const id = crypto.randomUUID();
          const identity = JSON.stringify(body.identity_json || {});
          const values = EQUIPMENT_FIELDS.map((field) => body[field] == null ? null : body[field].trim());
          await env.DB.prepare(
            'INSERT INTO equipment (id, module, tag, serial_number, equipment_name, owner_operator, location, identity_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(id, module, ...values, identity).run();
          const created = await env.DB.prepare(
            'SELECT id, module, tag, serial_number, equipment_name, owner_operator, location, identity_json, created_at, updated_at FROM equipment WHERE id = ?'
          ).bind(id).first();
          return json(request, { ok: true, equipment: created }, 201);
        }

        const id = decodeURIComponent(url.pathname.slice('/api/equipment/'.length));
        if (!id || id.includes('/')) return json(request, { error: 'A valid equipment ID is required.' }, 400);

        if (request.method === 'GET') {
          const item = await env.DB.prepare(
            'SELECT id, module, tag, serial_number, equipment_name, owner_operator, location, identity_json, created_at, updated_at FROM equipment WHERE id = ?'
          ).bind(id).first();
          return item ? json(request, { ok: true, equipment: item }) : json(request, { error: 'Equipment not found.' }, 404);
        }

        if (request.method === 'PUT') {
          const body = await request.json();
          const validationError = validateEquipmentPayload(body, false);
          if (validationError) return json(request, { error: validationError }, 400);
          const existing = await env.DB.prepare('SELECT id FROM equipment WHERE id = ?').bind(id).first();
          if (!existing) return json(request, { error: 'Equipment not found.' }, 404);
          const assignments = [];
          const values = [];
          for (const field of EQUIPMENT_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
              assignments.push(field + ' = ?');
              values.push(body[field] == null ? null : body[field].trim());
            }
          }
          if (Object.prototype.hasOwnProperty.call(body, 'module')) {
            const module = String(body.module || '').toUpperCase();
            if (!EQUIPMENT_MODULES.has(module)) return json(request, { error: 'module must be PSV, BVV, or PV.' }, 400);
            assignments.push('module = ?');
            values.push(module);
          }
          if (Object.prototype.hasOwnProperty.call(body, 'identity_json')) {
            assignments.push('identity_json = ?');
            values.push(JSON.stringify(body.identity_json));
          }
          if (!assignments.length) return json(request, { error: 'No supported fields were provided.' }, 400);
          assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
          values.push(id);
          await env.DB.prepare('UPDATE equipment SET ' + assignments.join(', ') + ' WHERE id = ?').bind(...values).run();
          const updated = await env.DB.prepare(
            'SELECT id, module, tag, serial_number, equipment_name, owner_operator, location, identity_json, created_at, updated_at FROM equipment WHERE id = ?'
          ).bind(id).first();
          return json(request, { ok: true, equipment: updated });
        }

        if (request.method === 'DELETE') {
          const result = await env.DB.prepare('DELETE FROM equipment WHERE id = ?').bind(id).run();
          if (!result.meta?.changes) return json(request, { error: 'Equipment not found.' }, 404);
          return json(request, { ok: true, deleted_id: id });
        }

        return json(request, { error: 'Method not allowed.' }, 405);
      } catch (error) {
        if (error instanceof SyntaxError) return json(request, { error: 'Invalid JSON request body.' }, 400);
        return json(request, { error: 'Equipment API request failed.' }, 500);
      }
    }

    if (!['/api/extract/document', '/api/extract/table', '/api/extract/bvv-document', '/api/extract/bvv-table', '/api/extract/pv-document'].includes(url.pathname)) {
      return json(request, { error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
    if (url.pathname === '/api/extract/pv-document' && !await equipmentApiAuthorized(request, env)) {
      return json(request, { error: 'Unauthorized.' }, 401);
    }
    if (!env.GEMINI_API_KEY) return json(request, { error: 'Gemini API key is not configured' }, 503);

    const model = env.GEMINI_MODEL || MODEL_DEFAULT;
    try {
      if (url.pathname === '/api/extract/document' || url.pathname === '/api/extract/bvv-document' || url.pathname === '/api/extract/pv-document') {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') {
          return json(request, { error: 'Upload a PDF or image in form field "file".' }, 400);
        }
        if (file.size > MAX_DOCUMENT_BYTES) return json(request, { error: 'File exceeds the 10 MB limit.' }, 413);
        const mimeType = file.type || 'application/octet-stream';
        if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
          return json(request, { error: 'Supported document formats: PDF, PNG, JPEG and WEBP.' }, 415);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        const result = await extractWithGemini({
          apiKey: env.GEMINI_API_KEY,
          model,
          mimeType,
          base64: btoa(binary),
          prompt: url.pathname === '/api/extract/bvv-document'
            ? buildBvvExtractionPrompt(parseMapping(form.get('mapping')), file.name)
            : url.pathname === '/api/extract/pv-document'
              ? buildPvDocumentPrompt(form.get('document_type'), {
                  id: String(form.get('equipment_id') || '').slice(0, 100),
                  tag: String(form.get('equipment_tag') || '').slice(0, 200),
                  name: String(form.get('equipment_name') || '').slice(0, 200)
                }, file.name)
              : buildExtractionPrompt(parseMapping(form.get('mapping')), file.name)
        });
        if (url.pathname === '/api/extract/pv-document') {
          const records = (Array.isArray(result.records) ? result.records : []).map((record) => {
            const output = {};
            for (const key of ['equipment_tag','equipment_name','equipment_type','manufacturer','model','serial_number','year_built','owner_operator','location','design_code','design_pressure','design_temperature','mawp','operating_pressure','operating_temperature','volume','diameter','length_or_height','material_shell','material_head','corrosion_allowance','nominal_thickness','inspection_date','inspection_summary','document_reference']) {
              output[key] = record?.[key] ?? null;
            }
            output._source_location = record?._source_location ?? null;
            const confidence = Number(record?._confidence);
            output._confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5;
            return output;
          });
          return json(request, { ok: true, records, provider: 'gemini', model: result._model_used || model });
        }
        if (url.pathname === '/api/extract/bvv-document') {
          const records = result.records.map((record) => {
            const output = {};
            for (const [key] of BVV_FIELDS) output[key] = record?.[key] ?? null;
            output._source_location = record?._source_location ?? null;
            output._confidence = Number.isFinite(Number(record?._confidence)) ? Math.max(0, Math.min(1, Number(record._confidence))) : 0.5;
            return normalizeBvvModelAndSize(normalizeBvvYearAndUsed(output));
          });
          return json(request, { ok: true, records, provider: 'gemini', model: result._model_used || model });
        }
        return json(request, { ok: true, records: normalizeRecords(result.records, file.name), provider: 'gemini', model: result._model_used || model });
      }

      const body = await request.json();
      if (!Array.isArray(body.headers) || !Array.isArray(body.rows)) {
        return json(request, { error: 'Request must contain headers[] and rows[].' }, 400);
      }
      if (body.headers.length > 100 || body.rows.length > 20 || JSON.stringify(body).length > MAX_TABLE_BYTES) {
        return json(request, { error: 'Table batch exceeds limits (100 columns, 20 rows, 90 KB).'}, 413);
      }
      if (!body.rows.length) return json(request, { ok: true, records: [], provider: 'gemini', model });

      const isBvvTable = url.pathname === '/api/extract/bvv-table';
      const result = await mapTableWithGemini({
        apiKey: env.GEMINI_API_KEY,
        model,
        prompt: (isBvvTable ? buildBvvTableMappingPrompt : buildTableMappingPrompt)({
          fileName: String(body.file_name || 'client.xlsx').slice(0, 200),
          sheetName: String(body.sheet_name || 'Sheet1').slice(0, 100),
          headers: body.headers,
          rows: body.rows,
          mapping: parseMapping(JSON.stringify(body.mapping || {}))
        })
      });
      if (isBvvTable) {
        const records = result.records.map((record) => {
          const output = {};
          for (const [key] of BVV_FIELDS) output[key] = record?.[key] ?? null;
          output._source_location = record?._source_location ?? null;
          output._confidence = Number.isFinite(Number(record?._confidence)) ? Math.max(0, Math.min(1, Number(record._confidence))) : 0.5;
          return normalizeBvvModelAndSize(output);
        });
        return json(request, { ok: true, records, provider: 'gemini', model: result._model_used || model });
      }
      return json(request, { ok: true, records: normalizeRecords(result.records), provider: 'gemini', model: result._model_used || model });
    } catch (error) {
      return json(request, { error: error?.message || 'Extraction failed.' }, 502);
    }
  }
};
