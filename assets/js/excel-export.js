/* Exports reviewed records into the current 40-column DTP PSV Asset Register workbook. */
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
      if (!response.ok) throw new Error('Template DTP_PSV_Asset_Register.xlsx baru tidak ditemukan. Pastikan deployment GitHub Pages sudah selesai.');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(schema.worksheet) || workbook.worksheets[0];
      if (!worksheet) throw new Error(`Worksheet ${schema.worksheet} tidak ditemukan.`);
      if (worksheet.columnCount !== schema.totalTemplateColumns) {
        throw new Error(`Struktur template tidak sesuai: ditemukan ${worksheet.columnCount} kolom, seharusnya ${schema.totalTemplateColumns} (A:AM). Export dibatalkan.`);
      }
      const originalMerges = [...worksheet.model.merges].sort();
      if (Number.isInteger(schema.expectedMergedRanges) && originalMerges.length !== schema.expectedMergedRanges) {
        throw new Error(`Struktur merged cells template berubah: ditemukan ${originalMerges.length}, seharusnya ${schema.expectedMergedRanges}. Export dibatalkan.`);
      }
      if (worksheet.getRow(schema.firstDataRow).number !== schema.firstDataRow) {
        throw new Error('Baris awal data tidak valid.');
      }
      const firstDataRow = schema.firstDataRow;
      rows.forEach((record, index) => {
        const targetRow = worksheet.getRow(firstDataRow + index);
        schema.fields.forEach((field) => {
          const value = record[field.key];
          const cell = targetRow.getCell(field.index);
          cell.value = field.auto ? index + 1 : (value == null ? '' : value);
          if (!cell.hasStyle) {
            cell.font = { name: 'Arial', size: 10, color: { argb: 'FF202020' } };
            cell.alignment = { vertical: 'center', horizontal: 'left', wrapText: true };
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9E1EA' } } };
          }
        });
        targetRow.height = 22;
      });
      if (JSON.stringify([...worksheet.model.merges].sort()) !== JSON.stringify(originalMerges)) {
        throw new Error('Merged header cells berubah. Export dibatalkan.');
      }
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      anchor.href = objectUrl;
      anchor.download = `DTP_PSV_Asset_Register_${date}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      const missingTags = rows.filter((record) => !String(record.tag_psv || '').trim()).length;
      notify(`Excel berhasil diunduh: ${rows.length} record ditulis mulai baris ${firstDataRow}. Template baru 40 kolom (A:AN), 4 baris header; seluruh merged headers dan formatting template dipertahankan. Tidak ada kolom konversi tekanan pada format ini.${missingTags ? ` Perhatian: ${missingTags} record belum memiliki Tag PSV.` : ''} Verifikasi seluruh data terhadap dokumen sumber sebelum digunakan.`, 'success');
    } catch (error) {
      console.error(error);
      notify(`Export gagal: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Export DTP Excel';
    }
  });
});