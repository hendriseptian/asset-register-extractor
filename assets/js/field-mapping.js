document.addEventListener('DOMContentLoaded',()=>{
  const schema=window.ARE_PSV_SCHEMA,host=document.getElementById('mapping-table'),status=document.getElementById('mapping-status');
  if(!schema||!host)return;
  const saved=ARE.getFieldMapping();
  const groups=[...new Set(schema.fields.map(f=>f.group))];
  host.innerHTML=groups.map(group=>{
    const fields=schema.fields.filter(f=>f.group===group);
    return `<section class="mapping-group"><h3>${ARE.escape(group)}</h3><div class="table-wrap"><table class="mapping-table"><thead><tr><th>Template column</th><th>Template field</th><th>Default recognition aliases</th><th>Your client-specific alias (optional)</th></tr></thead><tbody>${fields.map(f=>`<tr><td><b>${f.column}</b></td><td>${ARE.escape(f.label)}</td><td class="alias-list">${ARE.escape((f.aliases||[]).join(', ')||'Generated automatically')}</td><td><input data-field="${f.key}" value="${ARE.escape(saved[f.key]||'')}" placeholder="Add alternative client names, separated by commas" ${f.auto?'disabled':''}></td></tr>`).join('')}</tbody></table></div></section>`;
  }).join('')+`<div class="notice">Template layout: 59 physical columns (A–BG). AI4 is an existing formula and AO/AQ are blank spacer columns; these are preserved and are not treated as extracted fields.</div>`;
  document.getElementById('save-mapping').addEventListener('click',()=>{
    const map={};host.querySelectorAll('input[data-field]').forEach(el=>{if(el.value.trim())map[el.dataset.field]=el.value.trim()});
    ARE.setFieldMapping(map);ARE.notify(status,'Field mapping preferences saved in this browser. Gemini will use these as additional hints during extraction.','success');
  });
  document.getElementById('reset-mapping')?.addEventListener('click',()=>{ARE.setFieldMapping({});host.querySelectorAll('input[data-field]').forEach(el=>el.value='');ARE.notify(status,'Custom aliases cleared. Default template aliases remain active.','success')});
});
