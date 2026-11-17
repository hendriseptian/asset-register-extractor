// Read client spreadsheets into source tables. Gemini performs semantic mapping to the DTP PSV template.
(function(){
  const clean=v=>v===null||v===undefined?'':String(v).trim();
  function headerRowIndex(rows){
    let best=0,bestScore=-1;
    rows.slice(0,15).forEach((row,i)=>{
      const values=row.map(clean).filter(Boolean);
      const textCount=values.filter(v=>/[A-Za-z]/.test(v)).length;
      const score=textCount*2+values.length;
      if(score>bestScore){bestScore=score;best=i;}
    });
    return best;
  }
  function makeHeaders(rows,headerIndex){
    const start=Math.max(0,headerIndex-2);
    return (rows[headerIndex]||[]).map((_,col)=>{
      const parts=[];
      for(let r=start;r<=headerIndex;r++){
        const value=clean(rows[r]?.[col]);
        if(value&&!parts.includes(value))parts.push(value);
      }
      return parts.join(' / ')||`Column ${col+1}`;
    });
  }
  window.AREExcel={async read(file){
    const buffer=await file.arrayBuffer();
    const workbook=XLSX.read(buffer,{type:'array',cellDates:false,raw:false});
    const sheets=[];
    workbook.SheetNames.forEach(name=>{
      const ws=workbook.Sheets[name];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
      if(!rows.length)return;
      const headerIndex=headerRowIndex(rows);
      const headers=makeHeaders(rows,headerIndex);
      const dataRows=[];
      for(let i=headerIndex+1;i<rows.length;i++){
        const values=headers.map((_,col)=>clean(rows[i]?.[col]));
        if(values.some(Boolean))dataRows.push({rowNumber:i+1,values});
      }
      if(dataRows.length)sheets.push({name,headers,rows:dataRows,headerRow:headerIndex+1});
    });
    return sheets;
  }};
})();
