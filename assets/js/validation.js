document.addEventListener('DOMContentLoaded',()=>{
  const schema=window.ARE_PSV_SCHEMA,fields=schema.fields.filter(f=>!f.auto),records=ARE.getRecords();
  const host=document.getElementById('review-table'),summary=document.getElementById('review-summary'),status=document.getElementById('review-status');
  const esc=ARE.escape;
  const render=()=>{
    const tags=records.map(r=>String(r.tag_psv||'').trim().toLowerCase()).filter(Boolean);
    const duplicates=tags.filter((v,i)=>tags.indexOf(v)!==i);
    const missingTags=records.filter(r=>!String(r.tag_psv||'').trim()).length;
    const lowConfidence=records.filter(r=>Number(r._confidence??1)<0.7).length;
    const emptyCells=records.reduce((n,r)=>n+fields.filter(f=>r[f.key]===null||r[f.key]===undefined||String(r[f.key]).trim()==='').length,0);
    summary.innerHTML=`<span class="summary-chip">${records.length} records</span><span class="summary-chip">${missingTags} missing Tag PSV</span><span class="summary-chip">${duplicates.length} duplicate tag(s)</span><span class="summary-chip">${lowConfidence} low-confidence record(s)</span><span class="summary-chip">${emptyCells} empty field(s)</span>`;
    if(!records.length){host.innerHTML='<p class="muted">No records yet. Upload client files from New Extraction.</p>';return}
    const headers=fields.map(f=>`<th title="Column ${f.column}">${esc(f.column)} · ${esc(f.label)}</th>`).join('');
    const rows=records.map((r,i)=>{
      const duplicate=String(r.tag_psv||'').trim()&&tags.filter(t=>t===String(r.tag_psv||'').trim().toLowerCase()).length>1;
      const review=!String(r.tag_psv||'').trim()||Number(r._confidence??1)<0.7||duplicate;
      return `<tr class="${review?'needs-review':''}"><td>${i+1}</td>${fields.map(f=>`<td><input aria-label="Record ${i+1} ${esc(f.label)}" data-row="${i}" data-field="${f.key}" value="${esc(r[f.key]??'')}" title="${esc(f.label)} · ${esc(f.column)}"></td>`).join('')}<td>${esc(r._confidence===undefined?'—':Math.round(Number(r._confidence)*100)+'%')}</td><td>${esc(r._source_file||'')}</td><td>${esc(r._source_location||'')}</td></tr>`;
    }).join('');
    host.innerHTML=`<div class="review-help">Edit any extracted value directly in the table. Scroll horizontally to review all mapped template fields. Red-tinted rows need additional verification.</div><table class="review-table"><thead><tr><th>#</th>${headers}<th>AI confidence</th><th>Source file</th><th>Source location</th></tr></thead><tbody>${rows}</tbody></table>`;
    host.querySelectorAll('input[data-row]').forEach(input=>input.addEventListener('change',()=>{records[Number(input.dataset.row)][input.dataset.field]=input.value;ARE.setRecords(records);renderSummaryOnly()}));
  };
  function renderSummaryOnly(){
    const tags=records.map(r=>String(r.tag_psv||'').trim().toLowerCase()).filter(Boolean),duplicates=tags.filter((v,i)=>tags.indexOf(v)!==i);
    const missingTags=records.filter(r=>!String(r.tag_psv||'').trim()).length,low=records.filter(r=>Number(r._confidence??1)<0.7).length;
    const empty=records.reduce((n,r)=>n+fields.filter(f=>r[f.key]===null||r[f.key]===undefined||String(r[f.key]).trim()==='').length,0);
    summary.innerHTML=`<span class="summary-chip">${records.length} records</span><span class="summary-chip">${missingTags} missing Tag PSV</span><span class="summary-chip">${duplicates.length} duplicate tag(s)</span><span class="summary-chip">${low} low-confidence record(s)</span><span class="summary-chip">${empty} empty field(s)</span>`;
  }
  window.AREValidation={getRecords:()=>records,fields};
  render();
});
