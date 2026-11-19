import { buildExtractionPrompt, buildTableMappingPrompt, PSV_FIELDS } from './prompts.js';
import { extractWithGemini, mapTableWithGemini } from './gemini.js';

const ALLOWED_ORIGINS = new Set([
  'https://hendriseptian.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_TABLE_BYTES = 90 * 1024;
const MODEL_DEFAULT = 'gemini-3.5-flash-lite';

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://hendriseptian.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(request), 'Content-Type': 'application/json; charset=utf-8' }
  });
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
    const confidence = Number(record?._confidence);
    output._confidence = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5;
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
        template: 'DTP PSV 40-column A:AN'
      });
    }

    if (!['/api/extract/document', '/api/extract/table'].includes(url.pathname)) {
      return json(request, { error: 'Not found' }, 404);
    }
    if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
    if (!env.GEMINI_API_KEY) return json(request, { error: 'Gemini API key is not configured' }, 503);

    const model = env.GEMINI_MODEL || MODEL_DEFAULT;
    try {
      if (url.pathname === '/api/extract/document') {
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
          prompt: buildExtractionPrompt(parseMapping(form.get('mapping')), file.name)
        });
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

      const result = await mapTableWithGemini({
        apiKey: env.GEMINI_API_KEY,
        model,
        prompt: buildTableMappingPrompt({
          fileName: String(body.file_name || 'client.xlsx').slice(0, 200),
          sheetName: String(body.sheet_name || 'Sheet1').slice(0, 100),
          headers: body.headers,
          rows: body.rows,
          mapping: parseMapping(JSON.stringify(body.mapping || {}))
        })
      });
      return json(request, { ok: true, records: normalizeRecords(result.records), provider: 'gemini', model: result._model_used || model });
    } catch (error) {
      return json(request, { error: error?.message || 'Extraction failed.' }, 502);
    }
  }
};
