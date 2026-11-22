/* Exports reviewed records into the current 39-column DTP PSV Asset Register workbook. */
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
    if (!rows.length) { notify('There are no records to export.', 'error'); return; }
    button.disabled = true;
    button.textContent = 'Preparing Excel…';
    try {
      const response = await fetch(schema.templateFile, { cache: 'no-store' });
      if (!response.ok) throw new Error('The latest DTP_PSV_Asset_Register.xlsx template could not be found. Make sure the GitHub Pages deployment has completed.');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const worksheet = workbook.getWorksheet(schema.worksheet) || workbook.worksheets[0];
      if (!worksheet) throw new Error(`Worksheet ${schema.worksheet} was not found.`);
      if (worksheet.columnCount !== schema.totalTemplateColumns) {
        throw new Error(`Template structure mismatch: found ${worksheet.columnCount} columns; expected ${schema.totalTemplateColumns} (A:AM). Export cancelled.`);
      }
      const originalMerges = [...worksheet.model.merges].sort();
      if (Number.isInteger(schema.expectedMergedRanges) && originalMerges.length !== schema.expectedMergedRanges) {
        throw new Error(`The template's merged-cell structure has changed: found ${originalMerges.length}; expected ${schema.expectedMergedRanges}. Export cancelled.`);
      }
      if (worksheet.getRow(schema.firstDataRow).number !== schema.firstDataRow) {
        throw new Error('The first data row is invalid.');
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
        throw new Error('Merged header cells have changed. Export cancelled.');
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
      notify(`Excel file downloaded successfully: ${rows.length} record(s) written starting at row ${firstDataRow}. The latest 39-column template (A:AM) with 4 header rows was used; all merged headers and template formatting have been preserved. This format does not include pressure-conversion columns.${missingTags ? ` Warning: ${missingTags} record(s) are missing a Tag PSV.` : ''} Verify all data against the source documents before use.`, 'success');
    } catch (error) {
      console.error(error);
      notify(`Export failed: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Export DTP Excel';
    }
  });
});