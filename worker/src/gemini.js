const FALLBACK_MODELS = ['gemini-3.1-flash-lite'];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const LOCATION_ERROR = /User location is not supported for the API use/i;
const MAX_OUTPUT_TOKENS = 12288;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripTrailingCommas(value) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
      continue;
    }
    if (char === ',') {
      let next = index + 1;
      while (next < value.length && /\s/.test(value[next])) next++;
      if (value[next] === '}' || value[next] === ']') continue;
    }
    output += char;
  }
  return output;
}

function firstCompleteJsonObject(value) {
  const start = value.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
}

function parseGeminiJson(output) {
  const text = String(output || '').replace(/^\uFEFF/, '').trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const object = firstCompleteJsonObject(unfenced);
  const candidates = [...new Set([unfenced, object].filter(Boolean))];
  let lastError;
  for (const candidate of candidates) {
    for (const value of [candidate, stripTrailingCommas(candidate)]) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (!Array.isArray(parsed.records)) {
            const error = new Error('Gemini JSON is valid but does not contain a records array.');
            error.code = 'INVALID_AI_SCHEMA';
            throw error;
          }
          return parsed;
        }
      } catch (error) {
        if (error.code === 'INVALID_AI_SCHEMA') throw error;
        lastError = error;
      }
    }
  }
  const error = new Error('Gemini returned malformed JSON. The response could not be safely parsed.');
  error.code = 'INVALID_AI_JSON';
  error.cause = lastError;
  throw error;
}

async function requestGemini({apiKey, model, parts}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        maxOutputTokens: MAX_OUTPUT_TOKENS
      }
    })
  });

  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = {}; }

  if (!response.ok) {
    const error = new Error(body.error?.message || `Gemini request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  const candidate = body.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    const error = new Error('Gemini response reached the output limit. The document may contain too many records or pages.');
    error.code = 'OUTPUT_TRUNCATED';
    throw error;
  }
  if (candidate?.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
    const error = new Error(`Gemini stopped the response: ${candidate.finishReason}.`);
    error.code = 'AI_FINISH_REASON';
    throw error;
  }

  const output = candidate?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!output) {
    const error = new Error(body.promptFeedback?.blockReason
      ? `Gemini blocked the request: ${body.promptFeedback.blockReason}`
      : 'Gemini returned an empty response.');
    error.code = 'EMPTY_AI_RESPONSE';
    throw error;
  }

  const parsed = parseGeminiJson(output);
  parsed._model_used = model;
  return parsed;
}

async function callGemini({apiKey, model, parts}) {
  const models = [...new Set([model, ...FALLBACK_MODELS])];
  let lastError;

  for (const candidate of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await requestGemini({ apiKey, model: candidate, parts });
      } catch (error) {
        lastError = error;
        if (error.code === 'INVALID_AI_JSON' || error.code === 'INVALID_AI_SCHEMA' ||
            error.code === 'OUTPUT_TRUNCATED' || error.code === 'EMPTY_AI_RESPONSE' ||
            error.code === 'AI_FINISH_REASON') {
          throw error;
        }
        const locationRejected = error.status === 400 && LOCATION_ERROR.test(error.message);
        if (locationRejected) {
          if (attempt === 0) { await wait(1500); continue; }
          throw error;
        }
        if (!RETRYABLE_STATUS.has(error.status)) throw error;
        if (attempt === 0) await wait(700);
      }
    }
  }

  throw new Error(`Gemini primary and fallback models are temporarily unavailable. Last error: ${lastError?.message || 'Unknown Gemini error'}`);
}

function strictJsonRetryParts(parts) {
  const retryInstruction = [
    'IMPORTANT RETRY: Your previous response could not be parsed as JSON.',
    'Re-read the attached source and return a complete response now.',
    'Return exactly one JSON object with a top-level "records" array.',
    'Do not use Markdown fences, comments, explanations, or text before/after the JSON.',
    'Use double quotes for every JSON key and string. Escape internal quotation marks and backslashes correctly.',
    'Use null for unavailable values. Do not omit identifiable equipment records.',
    'Do not truncate the JSON. Keep all records and all required schema keys.'
  ].join(' ');
  const retryParts = [...parts];
  const firstText = retryParts.findIndex((part) => typeof part.text === 'string');
  if (firstText >= 0) retryParts[firstText] = { text: `${retryParts[firstText].text}\n\n${retryInstruction}` };
  else retryParts.unshift({ text: retryInstruction });
  return retryParts;
}

async function callGeminiWithJsonRetry({apiKey, model, parts}) {
  try {
    return await callGemini({ apiKey, model, parts });
  } catch (error) {
    if (!['INVALID_AI_JSON', 'INVALID_AI_SCHEMA', 'OUTPUT_TRUNCATED'].includes(error.code)) throw error;
    // Retry once with the same source file and an explicit strict-JSON recovery instruction.
    return callGemini({ apiKey, model, parts: strictJsonRetryParts(parts) });
  }
}

export async function extractWithGemini({apiKey, model, mimeType, base64, prompt}) {
  return callGeminiWithJsonRetry({
    apiKey,
    model,
    parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }]
  });
}

export async function mapTableWithGemini({apiKey, model, prompt}) {
  return callGeminiWithJsonRetry({ apiKey, model, parts: [{ text: prompt }] });
}
