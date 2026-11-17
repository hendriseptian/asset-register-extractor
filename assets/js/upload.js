document.addEventListener('DOMContentLoaded',()=>{
  const input=document.getElementById('file-input'),zone=document.getElementById('drop-zone'),list=document.getElementById('file-list'),run=document.getElementById('extract-btn'),clear=document.getElementById('clear-files'),status=document.getElementById('extract-status');
  let selected=[];
  const render=()=>{list.innerHTML=selected.map((f,i)=>`<div class="file-row"><span>${ARE.escape(f.name)} <small class="muted">(${(f.size/1024).toFixed(1)} KB)</small></span><button data-remove="${i}" class="text-link">Remove</button></div>`).join('');run.disabled=!selected.length};
  const add=files=>{selected=[...selected,...Array.from(files)].filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size)===i);render()};
  const worker=()=>{const u=ARE.getWorkerUrl();if(!u)throw new Error('Cloudflare Worker URL belum dikonfigurasi. Buka Settings / Worker URL.');return u};
  const mapping=()=>ARE.getFieldMapping();
  async function postTable(url,fileName,sheet,rows){
    const response=await fetch(url+'/api/extract/table',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_name:fileName,sheet_name:sheet.name,headers:sheet.headers,rows,mapping:mapping()})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'AI table mapping failed');
    return (data.records||[]).map(record=>({...record,_source_file:fileName,_source_location:record._source_location||`${sheet.name} · source rows ${rows[0]?.rowNumber||'?'}–${rows[rows.length-1]?.rowNumber||'?'}`}));
  }
  async function processSpreadsheet(file,url){
    const sheets=await window.AREExcel.read(file);if(!sheets.length)throw new Error('Tidak ditemukan tabel berisi data pada workbook.');
    const out=[];
    for(const sheet of sheets){
      // Small batches keep prompts within free-tier token limits and preserve source row references.
      for(let i=0;i<sheet.rows.length;i+=15){
        const batch=sheet.rows.slice(i,i+15);
        const records=await postTable(url,file.name,sheet,batch);
        out.push(...records);
      }
    }
    return out;
  }
  async function processDocument(file,url){
    const form=new FormData();form.append('file',file);form.append('mapping',JSON.stringify(mapping()));
    const response=await fetch(url+'/api/extract/document',{method:'POST',body:form});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'AI document extraction failed');
    return (data.records||[]).map(r=>({...r,_source_file:file.name,_source_location:r._source_location||'AI document extraction'}));
  }
  input.addEventListener('change',e=>add(e.target.files));
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});
  zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');add(e.dataTransfer.files)});
  list.addEventListener('click',e=>{const i=e.target.dataset.remove;if(i!==undefined){selected.splice(Number(i),1);render()}});
  clear.addEventListener('click',()=>{selected=[];input.value='';render();status.hidden=true});
  run.addEventListener('click',async()=>{
    let records=ARE.getRecords();const fileMeta=[],errors=[];run.disabled=true;clear.disabled=true;
    ARE.notify(status,'Memproses dokumen. File spreadsheet akan dibaca di browser lalu dipetakan oleh Gemini…');
    try{
      const url=worker();
      for(let i=0;i<selected.length;i++){
        const file=selected[i],ext=file.name.split('.').pop().toLowerCase();
        fileMeta.push({name:file.name,size:file.size,type:ext});
        try{
          let extracted=[];
          if(['xlsx','xls','csv'].includes(ext))extracted=await processSpreadsheet(file,url);
          else if(['pdf','png','jpg','jpeg','webp'].includes(ext))extracted=await processDocument(file,url);
          else throw new Error('Format file tidak didukung: '+ext);
          records.push(...extracted);
          ARE.notify(status,`Memproses ${i+1}/${selected.length}: ${file.name} — ${extracted.length} record ditemukan.`);
        }catch(err){console.error(err);errors.push(`${file.name}: ${err.message}`)}
      }
      ARE.setRecords(records);ARE.setFiles([...ARE.getFiles(),...fileMeta]);
      if(errors.length)ARE.notify(status,`Selesai dengan ${errors.length} file bermasalah. ${records.length} record tersedia.\n${errors.join('\n')}`,'error');
      else ARE.notify(status,`Selesai. ${records.length} record tersedia. Lanjutkan ke Field Mapping untuk memeriksa alias, lalu Data Review.`,'success');
    }catch(err){ARE.notify(status,err.message,'error')}
    finally{run.disabled=!selected.length;clear.disabled=false}
  });
});
