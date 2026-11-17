async function callGemini({apiKey,model,parts}){
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    contents:[{parts}],generationConfig:{temperature:0,responseMimeType:'application/json'}
  })});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error?.message||`Gemini request failed (${response.status})`);
  const text=body.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  if(!text)throw new Error('Gemini returned an empty response.');
  let parsed;
  try{parsed=JSON.parse(text)}catch{
    const match=text.match(/\{[\s\S]*\}/);
    if(!match)throw new Error('AI response was not valid JSON.');
    try{parsed=JSON.parse(match[0])}catch{throw new Error('AI response was not valid JSON.')}
  }
  if(!Array.isArray(parsed.records))throw new Error('AI JSON does not contain a records array.');
  return parsed;
}
export async function extractWithGemini({apiKey,model,mimeType,base64,prompt}){
  return callGemini({apiKey,model,parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64}}]});
}
export async function mapTableWithGemini({apiKey,model,prompt}){
  return callGemini({apiKey,model,parts:[{text:prompt}]});
}
