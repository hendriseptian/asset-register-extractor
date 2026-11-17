document.addEventListener('DOMContentLoaded',()=>{
 const fields=['tag_number','equipment_name','equipment_type','manufacturer','model_number','serial_number','year_built','design_pressure','design_temperature','operating_pressure','operating_temperature','material','capacity','location'];
 const labels=['Tag Number','Equipment Name','Equipment Type','Manufacturer','Model Number','Serial Number','Year Built','Design Pressure','Design Temperature','Operating Pressure','Operating Temperature','Material','Capacity','Location'];
 let records=ARE.getRecords();const host=document.getElementById('review-table'),summary=document.getElementById('review-summary');
 const render=()=>{const counts={missing:records.filter(r=>!r.tag_number).length};summary.innerHTML=`<span class="summary-chip">${records.length} records</span><span class="summary-chip">${counts.missing} missing Tag Number</span>`;
 host.innerHTML=records.length?`<table><thead><tr><th>#</th>${labels.map(x=>`<th>${x}</th>`).join('')}<th>Source</th><th>Source location</th></tr></thead><tbody>${records.map((r,i)=>`<tr><td>${i+1}</td>${fields.map(f=>`<td><input data-row="${i}" data-field="${f}" value="${ARE.escape(r[f]??'')}"></td>`).join('')}<td>${ARE.escape(r._source_file||'')}</td><td>${ARE.escape(r._source_location||'')}</td></tr>`).join('')}</tbody></table>`:'<p class="muted">No records yet. Upload documents from New Extraction.</p>';
 host.querySelectorAll('input[data-row]').forEach(inp=>inp.addEventListener('change',()=>{records[+inp.dataset.row][inp.dataset.field]=inp.value;ARE.setRecords(records);}));
 };render();window.AREValidation={getRecords:()=>records};
});
