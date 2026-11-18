/* Multi-document extraction and conservative record consolidation. */
(function () {
  'use strict';
  const schema = window.ARE_PSV_SCHEMA;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readJson = (key, fallback) => { try { return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const workerUrl = () => {
    const value = (localStorage.getItem('are_worker_url') || '').trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(value)) throw new Error('Cloudflare Worker URL belum dikonfigurasi. Buka Settings / Worker URL.');
    return value;
  };
  const aliases = () => { try { return JSON.parse(localStorage.getItem('are_mapping') || '{}'); } catch { return {}; } };
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
        const record = {...source, _merge_conflicts:[], _source_files:[source._source_file].filter(Boolean)};
        byTag.set(tag,record); output.push(record); continue;
      }
      const target = byTag.get(tag);
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
      for(let i=0;i<files.length;i++){
        const file=files[i],ext=file.name.split('.').pop().toLowerCase();
        try{
          const records=['xlsx','xls','csv'].includes(ext)
            ? await extractSpreadsheet(file,url)
            : ['pdf','png','jpg','jpeg','webp'].includes(ext)
              ? await extractDocument(file,url)
              : (()=>{throw new Error('Unsupported file format.');})();
          rawRecords.push(...records);
          meta.push({name:file.name,size:file.size,type:ext});
          notice('Extracted '+(i+1)+'/'+files.length+': '+file.name+' — '+records.length+' record(s).');
        }catch(err){errors.push(file.name+': '+err.message);}
      }
      const merged=consolidate(rawRecords);
      const existing=readJson('are_records',[]);
      const finalRecords=consolidate(existing.concat(merged));
      sessionStorage.setItem('are_records',JSON.stringify(finalRecords));
      const previousFiles=readJson('are_files',[]);
      sessionStorage.setItem('are_files',JSON.stringify(previousFiles.concat(meta)));
      const duplicateCount=rawRecords.length-merged.length;
      const conflictCount=finalRecords.reduce((n,r)=>n+(r._merge_conflicts||[]).length,0);
      if(errors.length) notice('Partial completion. '+rawRecords.length+' extracted record(s), '+merged.length+' consolidated record(s). Errors: '+errors.join(' | '),'error');
      else notice('Completed: '+rawRecords.length+' source record(s) consolidated into '+merged.length+' record(s). '+duplicateCount+' matching record(s) merged; '+conflictCount+' conflict(s) need review. Open Data Review to verify before export.','success');
    }catch(err){notice(err.message,'error');}
    finally{run.disabled=files.length<2;clear.disabled=false;}
  });
})();
