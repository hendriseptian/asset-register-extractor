/* Multi-document extraction and conservative record consolidation. */
(function () {
  'use strict';
  const schema = window.ARE_PSV_SCHEMA;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readJson = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const workerUrl = () => {
    const value = (localStorage.getItem('are_worker_url') || '').trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(value)) throw new Error('Cloudflare Worker URL is not configured. Open Settings / Worker URL.');
    return value;
  };
  const aliases = () => { try { return JSON.parse(localStorage.getItem('are_mapping') || '{}'); } catch { return {}; } };
  const processedFiles = () => { try { return [...readJson('are_files', []), ...JSON.parse(localStorage.getItem('are_processed_files') || '[]')]; } catch { return readJson('are_files', []); } };
  async function hashFile(file) {
    if (!globalThis.crypto?.subtle) throw new Error('Your browser does not support duplicate-file detection. Please use HTTPS and an up-to-date browser.');
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  const input = $('multi-file-input'), zone = $('multi-drop-zone'), list = $('multi-file-list');
  const run = $('multi-extract-btn'), clear = $('multi-clear-btn'), status = $('multi-status');
  let files = [];

  function notice(message, type='') { status.textContent = message; status.className = ('notice ' + type).trim(); status.hidden = false; }
  function render() {
    list.innerHTML = files.map((f,i)=>'<div class="file-row"><span>'+esc(f.name)+' <small class="muted">('+ (f.size/1024).toFixed(1)+' KB)</small></span><button class="text-link" data-remove="'+i+'" type="button">Remove</button></div>').join('');
    run.disabled = files.length < 2;
  }
  function add(incoming) {
    files = files.concat(Array.from(incoming)).filter((f,i,a)=>a.findIndex(x=>x.name===f.name && x.size===f.size)===i);
    render();
  }
  function normalizeTag(value) { return String(value || '').trim().toUpperCase().replace(/\s+/g,''); }

  function consolidate(records) {
    const fields = schema.fields.filter(f=>!f.auto);
    const byTag = new Map(), output = [];
    for (const source of records) {
      const tag = normalizeTag(source.tag_psv);
      if (!tag) { output.push({...source, _merge_conflicts:[]}); continue; }
      if (!byTag.has(tag)) {
        const record = {...source, _merge_conflicts:[...(source._merge_conflicts || [])], _source_files:[source._source_file].filter(Boolean)};
        byTag.set(tag,record); output.push(record); continue;
      }
      const target = byTag.get(tag);
      if (Array.isArray(source._merge_conflicts)) target._merge_conflicts.push(...source._merge_conflicts);
      if (source._source_file && !target._source_files.includes(source._source_file)) target._source_files.push(source._source_file);
      for (const field of fields) {
        const incoming = source[field.key];
        if (incoming == null || String(incoming).trim()==='') continue;
        const current = target[field.key];
        if (current == null || String(current).trim()==='') {
          target[field.key] = incoming;
        } else if (String(current).trim() !== String(incoming).trim()) {
          target._merge_conflicts.push({
            field: field.label, key: field.key,
            kept_value: String(current), other_value: String(incoming),
            source_file: source._source_file || 'Unknown source',
            source_location: source._source_location || ''
          });
        }
      }
      const sourceRef = (source._source_file || 'Source') + ': ' + (source._source_location || 'location not specified');
      if (!String(target._source_location || '').includes(sourceRef)) {
        target._source_location = [target._source_location, sourceRef].filter(Boolean).join(' | ');
      }
    }
    output.forEach(record=>{
      record._source_file = (record._source_files || [record._source_file]).filter(Boolean).join('; ');
      delete record._source_files;
    });
    return output;
  }

  async function extractDocument(file, url) {
    const form = new FormData();
    form.append('file',file); form.append('mapping',JSON.stringify(aliases()));
    const response = await fetch(url+'/api/extract/document',{method:'POST',body:form});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Document extraction failed.');
    return (result.records || []).map(record=>({...record,_source_file:file.name,_source_location:record._source_location || 'Document location not specified by AI — verify against source.'}));
  }

  function makeHeaders(rows, index) {
    const row = rows[index] || [];
    return row.map((_,col)=>{
      const parts=[];
      for(let r=Math.max(0,index-2);r<=index;r++){
        const value=String(rows[r]?.[col] ?? '').trim();
        if(value && !parts.includes(value)) parts.push(value);
      }
      return parts.join(' / ') || 'Column '+(col+1);
    });
  }

  async function extractSpreadsheet(file,url) {
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',raw:false,cellDates:false});
    const extracted=[];
    for(const sheetName of workbook.SheetNames){
      const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false});
      if(!rows.length) continue;
      let headerIndex=0,best=-1;
      rows.slice(0,20).forEach((row,index)=>{
        const values=row.map(v=>String(v??'').trim()).filter(Boolean);
        const textCount=values.filter(v=>/[A-Za-z]/.test(v)).length;
        const numericCount=values.filter(v=>/^[-+]?\d+(?:[.,]\d+)?(?:\s*[%°A-Za-z/]+)?$/.test(v)).length;
        const score=values.length+textCount*2-numericCount*2-index*.15;
        if(score>best){best=score;headerIndex=index;}
      });
      const headers=makeHeaders(rows,headerIndex);
      if(!headers.some(h=>!/^Column \d+$/.test(h))) continue;
      const sourceRows=[];
      for(let i=headerIndex+1;i<rows.length;i++){
        const values=headers.map((_,col)=>String(rows[i]?.[col]??'').trim());
        if(values.some(Boolean)) sourceRows.push({rowNumber:i+1,values});
      }
      for(let offset=0;offset<sourceRows.length;offset+=15){
        const batch=sourceRows.slice(offset,offset+15);
        const response=await fetch(url+'/api/extract/table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          file_name:file.name,sheet_name:sheetName,headers,rows:batch,mapping:aliases()
        })});
        const result=await response.json();
        if(!response.ok) throw new Error(result.error || 'Spreadsheet extraction failed.');
        extracted.push(...(result.records||[]).map(record=>({...record,_source_file:file.name,_source_location:record._source_location || sheetName+' · rows '+batch[0].rowNumber+'–'+batch[batch.length-1].rowNumber})));
      }
    }
    return extracted;
  }

  input.addEventListener('change',e=>add(e.target.files));
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');add(e.dataTransfer.files);});
  list.addEventListener('click',e=>{const i=e.target?.dataset?.remove;if(i!==undefined){files.splice(Number(i),1);render();}});
  clear.addEventListener('click',()=>{files=[];input.value='';render();status.hidden=true;});

  run.addEventListener('click',async()=>{
    run.disabled=true; clear.disabled=true;
    const rawRecords=[],errors=[],meta=[];
    try{
      const url=workerUrl();
      // Reuse protection only while Data Review still contains extracted records.
      // Clearing the review allows these same source documents to be processed again.
      const reviewHasData=readJson('are_records',[]).length>0;
      const knownEntries=reviewHasData?processedFiles():[];
      const knownHashes=new Set(knownEntries.map(item=>item.hash).filter(Boolean));
      const seenHashes=new Set(),fresh=[];
      const skipped=[];
      for(const file of files){
        const hash=await hashFile(file);
        const legacyMatch=knownEntries.some(item=>!item.hash&&item.name===file.name&&Number(item.size)===file.size);
        if(knownHashes.has(hash)||legacyMatch||seenHashes.has(hash)){skipped.push(file.name);continue;}
        seenHashes.add(hash);fresh.push({file,hash});
      }
      if(!fresh.length){
        notice('No new files to process. '+skipped.length+' file(s) have already been processed. Existing review data has been preserved, and no AI quota was used.','success');
        return;
      }
      for(let i=0;i<fresh.length;i++){
        const {file,hash}=fresh[i],ext=file.name.split('.').pop().toLowerCase();
        try{
          const records=['xlsx','xls','csv'].includes(ext)
            ? await extractSpreadsheet(file,url)
            : ['pdf','png','jpg','jpeg','webp'].includes(ext)
              ? await extractDocument(file,url)
              : (()=>{throw new Error('Unsupported file format.');})();
          rawRecords.push(...records);
          meta.push({name:file.name,size:file.size,type:ext,hash,processed_at:new Date().toISOString()});
          notice('Extracted '+(i+1)+'/'+fresh.length+': '+file.name+' — '+records.length+' record(s).');
        }catch(err){errors.push(file.name+': '+err.message);}
      }
      const merged=consolidate(rawRecords);
      const existing=readJson('are_records',[]);
      if(rawRecords.length){
        const finalRecords=consolidate(existing.concat(merged));
        sessionStorage.setItem('are_records',JSON.stringify(finalRecords));
      }
      if(meta.length){
        sessionStorage.setItem('are_files',JSON.stringify(readJson('are_files',[]).concat(meta)));
        const registry=(()=>{try{return JSON.parse(localStorage.getItem('are_processed_files')||'[]')}catch{return []}})();
        const known=new Set(registry.map(item=>item.hash));
        localStorage.setItem('are_processed_files',JSON.stringify(registry.concat(meta.filter(item=>!known.has(item.hash)))));
      }
      const duplicateCount=rawRecords.length-merged.length;
      const conflictCount=readJson('are_records',[]).reduce((n,r)=>n+(r._merge_conflicts||[]).length,0);
      const skippedMessage=skipped.length?' '+skipped.length+' duplicate file(s) skipped without using AI quota.':'';
      if(errors.length) notice('Partial completion. '+rawRecords.length+' extracted record(s), '+merged.length+' consolidated record(s). Errors: '+errors.join(' | ')+skippedMessage,'error');
      else notice('Completed: '+rawRecords.length+' source record(s) consolidated into '+merged.length+' record(s). '+duplicateCount+' matching record(s) merged; '+conflictCount+' conflict(s) need review.'+skippedMessage+' Previous preview records were retained. Open Data Review to verify before export.','success');
    }catch(err){notice(err.message,'error');}
    finally{run.disabled=files.length<2;clear.disabled=false;}
  });
})();
