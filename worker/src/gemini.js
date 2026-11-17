const FALLBACK_MODELS = ['gemini-3.1-flash-lite'];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestGemini({apiKey, model, parts}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
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

  const output = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!output) throw new Error(body.promptFeedback?.blockReason
    ? `Gemini blocked the request: ${body.promptFeedback.blockReason}`
    : 'Gemini returned an empty response.');

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response was not valid JSON.');
    try { parsed = JSON.parse(match[0]); }
    catch { throw new Error('AI response was not valid JSON.'); }
  }

  if (!Array.isArray(parsed.records)) throw new Error('AI JSON does not contain a records array.');
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
        const retryable = RETRYABLE_STATUS.has(error.status);
        if (!retryable) throw error;
        if (attempt === 0) await wait(700);
      }
    }
  }

  throw new Error(`Gemini primary and fallback models are temporarily unavailable. Last error: ${lastError?.message || 'Unknown Gemini error'}`);
}

export async function extractWithGemini({apiKey, model, mimeType, base64, prompt}) {
  return callGemini({
    apiKey,
    model,
    parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }]
  });
}

export async function mapTableWithGemini({apiKey, model, prompt}) {
  return callGemini({ apiKey, model, parts: [{ text: prompt }] });
}
