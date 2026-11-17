document.addEventListener('DOMContentLoaded',()=>{
 document.getElementById('export-btn').addEventListener('click',async()=>{
  const status=document.getElementById('review-status'),records=window.AREValidation?.getRecords()||ARE.getRecords();
  if(!records.length){ARE.notify(status,'There are no records to export.','error');return}
  try{
   const response=await fetch('assets/templates/asset-register-template.xlsx');if(!response.ok)throw new Error('Template file could not be loaded');
   const buffer=await response.arrayBuffer();const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
   let ws=wb.getWorksheet('Asset Register')||wb.worksheets[0];if(!ws)ws=wb.addWorksheet('Asset Register');
   const fields=['tag_number','equipment_name','equipment_type','manufacturer','model_number','serial_number','year_built','design_pressure','design_temperature','operating_pressure','operating_temperature','material','capacity','location'];
   const headers=['Tag Number','Equipment Name','Equipment Type','Manufacturer','Model Number','Serial Number','Year Built','Design Pressure','Design Temperature','Operating Pressure','Operating Temperature','Material','Capacity','Location'];
   ws.spliceRows(1,ws.rowCount);ws.addRow(headers);records.forEach(r=>ws.addRow(fields.map(f=>r[f]??'')));
   ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173653'}};ws.views=[{state:'frozen',ySplit:1}];ws.columns=headers.map((h,i)=>({header:h,width:Math.max(16,h.length+3)}));
   const blob=new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DTP_Asset_Register_Export.xlsx';a.click();URL.revokeObjectURL(a.href);ARE.notify(status,'Excel export created. Please verify it against source documents.','success');
  }catch(e){console.error(e);ARE.notify(status,'Export failed: '+e.message,'error')}
 });
});
