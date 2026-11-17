document.addEventListener('DOMContentLoaded',()=>{
 const input=document.getElementById('file-input'),zone=document.getElementById('drop-zone'),list=document.getElementById('file-list'),run=document.getElementById('extract-btn'),clear=document.getElementById('clear-files'),status=document.getElementById('extract-status');
 let selected=[];
 const render=()=>{list.innerHTML=selected.map((f,i)=>`<div class="file-row"><span>${ARE.escape(f.name)} <small class="muted">(${(f.size/1024).toFixed(1)} KB)</small></span><button data-remove="${i}" class="text-link">Remove</button></div>`).join('');run.disabled=!selected.length};
 const add=fs=>{selected=[...selected,...Array.from(fs)].filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size)===i);render()};
 input.addEventListener('change',e=>add(e.target.files));zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');add(e.dataTransfer.files)});
 list.addEventListener('click',e=>{const i=e.target.dataset.remove;if(i!==undefined){selected.splice(Number(i),1);render()}});
 clear.addEventListener('click',()=>{selected=[];input.value='';render();status.hidden=true});
 run.addEventListener('click',async()=>{let records=ARE.getRecords(),fileMeta=[];run.disabled=true;ARE.notify(status,'Processing files…');
  for(const file of selected){try{
    const ext=file.name.split('.').pop().toLowerCase();fileMeta.push({name:file.name,size:file.size,type:ext});
    if(['xlsx','xls','csv'].includes(ext)){const rows=await window.AREExcel.read(file);records.push(...rows.map(r=>({...r,_source_file:file.name,_source_location:r._source_location||'worksheet'})));continue}
    if(['pdf','png','jpg','jpeg'].includes(ext)){const url=ARE.getWorkerUrl();if(!url)throw new Error('Worker URL is not configured. Return to Settings.');const form=new FormData();form.append('file',file);const response=await fetch(url+'/api/extract/document',{method:'POST',body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||'AI extraction failed');records.push(...(data.records||[]).map(r=>({...r,_source_file:file.name,_source_location:r._source_location||'AI extraction'})));continue}
    throw new Error('Unsupported file type: '+ext);
   }catch(err){console.error(err);ARE.notify(status,`${file.name}: ${err.message}`,'error');}}
  ARE.setRecords(records);ARE.setFiles([...ARE.getFiles(),...fileMeta]);run.disabled=false;if(!status.classList.contains('error'))ARE.notify(status,`Finished. ${records.length} total records are available in Data Review.`,'success');
 });
});
