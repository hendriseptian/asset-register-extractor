/* Exports reviewed records into the original DTP PSV & PV workbook. */
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('export-btn');
  const status = document.getElementById('review-status');
  const schema = window.ARE_PSV_SCHEMA;
  if (!button || !schema) return;

  const records = () => {
    try { return JSON.parse(sessionStorage.getItem('are_records') || '[]'); }
    catch { return []; }
  };
  const notify = (message, type) => {
    if (!status) return;
    status.textContent = message;
    status.className = `notice ${type || ''}`.trim();
    status.hidden = false;
  };

  button.addEventListener('click', async () => {
    const rows = records();
    if (!rows.length) { notify('Tidak ada record untuk diekspor.', 'error'); return; }
    button.disabled = true;
    button.textContent = 'Menyiapkan Excel…';
    try {
      const response = await fetch(schema.templateFile, { cache: 'no-store' });
      if (!response.ok) throw new Error('Template DTP PSV & PV tidak ditemukan pada GitHub Pages.');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(schema.worksheet) || workbook.worksheets[0];
      if (!worksheet) throw new Error(`Worksheet ${schema.worksheet} tidak ditemukan.`);
      if (worksheet.columnCount > schema.totalTemplateColumns) throw new Error('Struktur kolom template berubah. Export dibatalkan agar format tidak rusak.');

      const originalFormula = JSON.stringify(worksheet.getCell('AI4').value);
      const originalMerges = [...worksheet.model.merges];
      const firstDataRow = schema.firstDataRow;
      rows.forEach((record, index) => {
        const targetRow = worksheet.getRow(firstDataRow + index);
        // Row 5 is the original blank spacer; row 6 is the first data row (AI4 references AJ6/AG6).
        schema.fields.forEach((field) => {
          const cell = targetRow.getCell(field.index);
          // Column A (No.) is generated. AI4 is a formula and AO/AQ are reserved blanks.
          cell.value = field.auto ? index + 1 : (record[field.key] == null ? '' : record[field.key]);
        });
        for (let column = 1; column <= schema.totalTemplateColumns; column++) {
          const target = targetRow.getCell(column);
          // The original template has no preformatted body rows; retain its default cell styles.
          target.alignment = { vertical: 'middle', wrapText: true };
        }
        targetRow.height = 24;
      });

      // Assert that the header formula and merged header layout were not altered.
      if (JSON.stringify(worksheet.getCell('AI4').value) !== originalFormula) throw new Error('Formula AI4 berubah. Export dibatalkan.');
      if (JSON.stringify([...worksheet.model.merges]) !== JSON.stringify(originalMerges)) throw new Error('Merged header cells berubah. Export dibatalkan.');
      workbook.calcProperties = { ...(workbook.calcProperties || {}), fullCalcOnLoad: true, forceFullCalc: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      anchor.href = objectUrl;
      anchor.download = `DTP_PSV_PV_Asset_Register_${date}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);

      const missingTags = rows.filter((record) => !String(record.tag_psv || '').trim()).length;
      notify(`Excel berhasil dibuat: ${rows.length} record ditulis mulai baris ${firstDataRow}. Header 4 baris, 36 merged ranges, formula AI4, dan kolom spacer dipertahankan.${missingTags ? ` Perhatian: ${missingTags} record belum memiliki Tag PSV.` : ''} Verifikasi seluruh data terhadap dokumen sumber sebelum digunakan.`, 'success');
    } catch (error) {
      console.error(error);
      notify(`Export gagal: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Export DTP Excel';
    }
  });
});
