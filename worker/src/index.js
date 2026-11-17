import { extractWithGemini } from './gemini.js';
import { buildExtractionPrompt } from './prompts.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Replace with your exact GitHub Pages origin before production.
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
export default {
 async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{headers:corsHeaders});
  const url=new URL(request.url);
  if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,service:'asset-register-extractor-worker',aiProvider:env.GEMINI_API_KEY?'gemini-configured':'not-configured'});
  if(url.pathname==='/api/extract/document'&&request.method==='POST'){
   try{
    if(!env.GEMINI_API_KEY)return json({error:'Gemini API key is not configured in Worker secrets.'},503);
    const form=await request.formData();const file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function')return json({error:'Upload a PDF or image using form field "file".'},400);
    if(file.size>10*1024*1024)return json({error:'File exceeds the 10 MB starter limit.'},413);
    const type=file.type||'application/octet-stream';
    if(!['application/pdf','image/png','image/jpeg','image/webp'].includes(type))return json({error:'Only PDF, PNG, JPEG and WEBP are supported by this endpoint.'},415);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const base64=btoa(bytes.reduce((s,b)=>s+String.fromCharCode(b),''));
    const prompt=buildExtractionPrompt();
    const result=await extractWithGemini({apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||'gemini-2.5-flash-lite',mimeType:type,base64,prompt});
    return json({ok:true,records:result.records||[],provider:'gemini',model:env.GEMINI_MODEL||'gemini-2.5-flash-lite'});
   }catch(e){return json({error:e.message||'Extraction failed'},502)}
  }
  return json({error:'Not found'},404);
 }
};
