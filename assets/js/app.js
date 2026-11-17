// Shared browser utilities. No secret API keys belong in frontend code.
(function(){
  const KEY='are_worker_url';
  window.ARE={
    getWorkerUrl:()=>localStorage.getItem(KEY)||'',
    setWorkerUrl:(v)=>localStorage.setItem(KEY,(v||'').trim().replace(/\/$/,'')),
    getRecords:()=>{try{return JSON.parse(sessionStorage.getItem('are_records')||'[]')}catch{return []}},
    setRecords:(v)=>sessionStorage.setItem('are_records',JSON.stringify(v)),
    getFiles:()=>{try{return JSON.parse(sessionStorage.getItem('are_files')||'[]')}catch{return []}},
    setFiles:(v)=>sessionStorage.setItem('are_files',JSON.stringify(v)),
    notify:(el,msg,type='')=>{if(!el)return;el.textContent=msg;el.className='notice '+type;el.hidden=false},
    escape:(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const input=document.getElementById('worker-url'),save=document.getElementById('save-worker');
    if(input){input.value=ARE.getWorkerUrl();save?.addEventListener('click',()=>{const v=input.value.trim();if(!/^https:\/\//i.test(v)){alert('Enter a valid HTTPS Cloudflare Worker URL.');return}ARE.setWorkerUrl(v);location.href='dashboard.html'})}
    const a=document.getElementById('stat-files'),b=document.getElementById('stat-records'),c=document.getElementById('stat-review');
    if(a){const r=ARE.getRecords();a.textContent=ARE.getFiles().length;b.textContent=r.length;c.textContent=r.filter(x=>!x.tag_number||x._needs_review).length}
  });
})();
