/* DTP PSV & PV extraction and review workflow. */
(function () {
  'use strict';
  const schema = window.ARE_PSV_SCHEMA;
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const readJson = (key, fallback) => {
    try { return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const getRecords = () => readJson('are_records', []);
  const saveRecords = (records) => sessionStorage.setItem('are_records', JSON.stringify(records));

  // Gemini can occasionally return a continuation row with no Tag PSV (for example,
  // a date on the next row). Fold sparse continuation rows into the preceding tagged asset.
  function consolidateContinuationRows(input) {
    const fields = schema.fields.filter((field) => !field.auto);
    const output = [];
    let merged = 0;
    input.forEach((record) => {
      const tag = String(record.tag_psv || '').trim();
      if (tag) { output.push({ ...record }); return; }
      const populated = fields.filter((field) =>
        record[field.key] != null && String(record[field.key]).trim() !== '');
      const previous = output.length ? output[output.length - 1] : null;
      if (previous && String(previous.tag_psv || '').trim() && populated.length <= 2) {
        populated.forEach((field) => {
          const current = previous[field.key];
          if (current == null || String(current).trim() === '') previous[field.key] = record[field.key];
        });
        merged++;
      } else {
        output.push({ ...record });
      }
    });
    return { records: output, merged };
  }
  const getFiles = () => readJson('are_files', []);
  async function hashFile(file) {
    if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung pemeriksaan duplikasi file. Gunakan HTTPS atau browser terbaru.');
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function processedFileEntries() {
    try { return [...getFiles(), ...JSON.parse(localStorage.getItem('are_processed_files') || '[]')]; }
    catch { return getFiles(); }
  }
  const getAliases = () => {
    try { return JSON.parse(localStorage.getItem('are_mapping') || '{}'); }
    catch { return {}; }
  };
  const showNotice = (element, message, type = '') => {
    if (!element) return;
    element.textContent = message;
    element.className = `notice ${type}`.trim();
    element.hidden = false;
  };
  const getWorkerUrl = () => {
    const url = (localStorage.getItem('are_worker_url') || '').trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(url)) throw new Error('Cloudflare Worker URL belum dikonfigurasi. Buka Settings / Worker URL.');
    return url;
  };
  const dataFields = schema.fields.filter((field) => !field.auto);

  // Upload and AI extraction.
  if ($('file-input')) {
    const input = $('file-input');
    const dropZone = $('drop-zone');
    const fileList = $('file-list');
    const extractButton = $('extract-btn');
    const clearButton = $('clear-files');
    const status = $('extract-status');
    let selectedFiles = [];

    function renderFiles() {
      fileList.innerHTML = selectedFiles.map((file, index) => `
        <div class="file-row"><span>${escapeHtml(file.name)} <small class="muted">(${(file.size / 1024).toFixed(1)} KB)</small></span>
        <button type="button" class="text-link" data-remove="${index}">Remove</button></div>`).join('');
      extractButton.disabled = selectedFiles.length === 0;
    }

    function addFiles(files) {
      selectedFiles = selectedFiles.concat(Array.from(files)).filter((file, index, all) =>
        all.findIndex((other) => other.name === file.name && other.size === file.size) === index);
      renderFiles();
    }

    async function sendTableBatch(workerUrl, fileName, sheet, rows) {
      const response = await fetch(`${workerUrl}/api/extract/table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: fileName, sheet_name: sheet.name, headers: sheet.headers, rows, mapping: getAliases() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gemini spreadsheet extraction failed.');
      return (result.records || []).map((record) => ({
        ...record,
        _source_file: fileName,
        _source_location: record._source_location || `${sheet.name} · source rows ${rows[0]?.rowNumber ?? '?'}–${rows[rows.length - 1]?.rowNumber ?? '?'}`
      }));
    }

    function buildHeaders(rows, headerIndex) {
      const current = rows[headerIndex] || [];
      return current.map((_, columnIndex) => {
        const parts = [];
        // Include up to two parent header rows to resolve merged / multi-level headers.
        for (let rowIndex = Math.max(0, headerIndex - 2); rowIndex <= headerIndex; rowIndex++) {
          const value = String(rows[rowIndex]?.[columnIndex] ?? '').trim();
          if (value && !parts.includes(value)) parts.push(value);
        }
        return parts.join(' / ') || `Column ${columnIndex + 1}`;
      });
    }

    async function processSpreadsheet(file, workerUrl) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, cellDates: false });
      const extracted = [];
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1, defval: '', raw: false, blankrows: false
        });
        if (!rows.length) continue;
        let headerIndex = 0;
        let bestScore = -1;
        rows.slice(0, 20).forEach((row, index) => {
          const values = row.map((value) => String(value ?? '').trim()).filter(Boolean);
          const textCount = values.filter((value) => /[A-Za-z]/.test(value)).length;
          const numericCount = values.filter((value) => /^[-+]?\d+(?:[.,]\d+)?(?:\s*[%°A-Za-z/]+)?$/.test(value)).length;
          const score = values.length + textCount * 2 - numericCount * 2 - index * 0.15;
          if (score > bestScore) { bestScore = score; headerIndex = index; }
        });
        const headers = buildHeaders(rows, headerIndex);
        if (!headers.some((header) => !/^Column \d+$/.test(header))) continue;
        const sourceRows = [];
        for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
          const values = headers.map((_, columnIndex) => String(rows[rowIndex]?.[columnIndex] ?? '').trim());
          if (values.some(Boolean)) sourceRows.push({ rowNumber: rowIndex + 1, values });
        }
        // Small batches reduce response truncation and improve row-level extraction accuracy.
        // When a Tag PSV column exists, verify every tagged source row and retry omissions individually.
        const tagColumn = headers.findIndex((header) => /(?:^|\b)(?:tag\s*(?:psv|no|number)?|psv\s*tag|equipment\s*tag|tag\s*number)(?:\b|$)/i.test(header));
        const normalizeTag = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (let offset = 0; offset < sourceRows.length; offset += 5) {
          const batch = sourceRows.slice(offset, offset + 5);
          const batchRecords = await sendTableBatch(workerUrl, file.name, { name: sheetName, headers }, batch);
          extracted.push(...batchRecords);
          if (tagColumn >= 0) {
            const expected = batch.filter((row) => String(row.values[tagColumn] ?? '').trim());
            const returned = new Set(batchRecords.map((record) => normalizeTag(record.tag_psv)).filter(Boolean));
            const missing = expected.filter((row) => !returned.has(normalizeTag(row.values[tagColumn])));
            for (const row of missing) {
              const retryRecords = await sendTableBatch(workerUrl, file.name, { name: sheetName, headers }, [row]);
              const match = retryRecords.find((record) => normalizeTag(record.tag_psv) === normalizeTag(row.values[tagColumn]));
              if (match) extracted.push(match);
              else extracted.push({
                tag_psv: row.values[tagColumn],
                _confidence: 0,
                _source_file: file.name,
                _source_location: `${sheetName} · source row ${row.rowNumber} · NEEDS MANUAL REVIEW: source row was not fully extracted by AI`,
                _extraction_warning: 'Tagged source row was retried individually but AI did not return a complete matching record.'
              });
            }
          }
        }
      }
      return extracted;
    }

    async function processDocument(file, workerUrl) {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(getAliases()));
      const response = await fetch(`${workerUrl}/api/extract/document`, { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gemini document extraction failed.');
      return (result.records || []).map((record) => ({
        ...record,
        _source_file: file.name,
        _source_location: record._source_location || 'Document location not specified by AI — verify against source.'
      }));
    }

    input.addEventListener('change', (event) => addFiles(event.target.files));
    dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', (event) => { event.preventDefault(); dropZone.classList.remove('drag'); addFiles(event.dataTransfer.files); });
    fileList.addEventListener('click', (event) => {
      const index = event.target?.dataset?.remove;
      if (index !== undefined) { selectedFiles.splice(Number(index), 1); renderFiles(); }
    });
    clearButton.addEventListener('click', () => { selectedFiles = []; input.value = ''; renderFiles(); status.hidden = true; });

    extractButton.addEventListener('click', async () => {
      extractButton.disabled = true;
      clearButton.disabled = true;
      const errors = [];
      const newRecords = [];
      const metadata = [];
      try {
        const workerUrl = getWorkerUrl();
        // Duplicate protection is active only while Data Review contains records.
        // Once the review is cleared, allow the same source files to be extracted again.
        const reviewHasData = getRecords().length > 0;
        const knownEntries = reviewHasData ? processedFileEntries() : [];
        const knownHashes = new Set(knownEntries.map((entry) => entry.hash).filter(Boolean));
        const seenHashes = new Set();
        const freshFiles = [];
        const skippedDuplicates = [];
        for (const file of selectedFiles) {
          const hash = await hashFile(file);
          const legacyMatch = knownEntries.some((entry) => !entry.hash && entry.name === file.name && Number(entry.size) === file.size);
          if (knownHashes.has(hash) || legacyMatch || seenHashes.has(hash)) {
            skippedDuplicates.push(file.name);
            continue;
          }
          seenHashes.add(hash);
          freshFiles.push({ file, hash });
        }
        if (!freshFiles.length) {
          showNotice(status, `Tidak ada ekstraksi baru. ${skippedDuplicates.length} file sudah pernah diproses. Preview lama tetap dipertahankan dan kuota AI tidak digunakan.`, 'success');
          return;
        }
        for (let index = 0; index < freshFiles.length; index++) {
          const { file, hash } = freshFiles[index];
          const extension = file.name.split('.').pop().toLowerCase();
          try {
            let records;
            if (['xlsx', 'xls', 'csv'].includes(extension)) records = await processSpreadsheet(file, workerUrl);
            else if (['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(extension)) records = await processDocument(file, workerUrl);
            else throw new Error('Format tidak didukung. Gunakan XLSX, XLS, CSV, PDF, PNG, JPG atau WEBP.');
            newRecords.push(...records);
            metadata.push({ name: file.name, size: file.size, type: extension, hash, processed_at: new Date().toISOString() });
            showNotice(status, `Diproses ${index + 1}/${freshFiles.length}: ${file.name} — ${records.length} record ditemukan.`);
          } catch (error) { errors.push(`${file.name}: ${error.message}`); }
        }
        if (newRecords.length) saveRecords(getRecords().concat(newRecords));
        if (metadata.length) {
          sessionStorage.setItem('are_files', JSON.stringify(getFiles().concat(metadata)));
          const registry = (() => { try { return JSON.parse(localStorage.getItem('are_processed_files') || '[]'); } catch { return []; } })();
          const known = new Set(registry.map((entry) => entry.hash));
          localStorage.setItem('are_processed_files', JSON.stringify(registry.concat(metadata.filter((entry) => !known.has(entry.hash)))));
        }
        const skippedMessage = skippedDuplicates.length ? ` ${skippedDuplicates.length} file duplikat dilewati tanpa memakai kuota AI.` : '';
        if (errors.length) showNotice(status, `Sebagian file gagal diproses:\n${errors.join('\n')}\n${newRecords.length} record baru berhasil diekstrak.${skippedMessage}`, 'error');
        else showNotice(status, `Selesai. ${newRecords.length} record baru berhasil diekstrak.${skippedMessage} Preview sebelumnya tetap dipertahankan. Lanjutkan ke Data Review.`, 'success');
      } catch (error) { showNotice(status, error.message, 'error'); }
      finally { extractButton.disabled = selectedFiles.length === 0; clearButton.disabled = false; }
    });
  }

  // Editable client-specific alias hints.
  if ($('mapping-table')) {
    const host = $('mapping-table');
    const savedAliases = getAliases();
    const groups = [...new Set(schema.fields.map((field) => field.group))];
    host.innerHTML = groups.map((group) => {
      const fields = schema.fields.filter((field) => field.group === group);
      return `<section class="mapping-group"><h3>${escapeHtml(group)}</h3><div class="table-wrap"><table class="mapping-table">
        <thead><tr><th>Excel column</th><th>Template field</th><th>Recognized client terms</th><th>Extra client aliases</th></tr></thead><tbody>
        ${fields.map((field) => `<tr><td><b>${field.column}</b></td><td>${escapeHtml(field.label)}</td><td class="alias-list">${escapeHtml(field.aliases.join(', ') || 'Automatic sequence')}</td>
        <td><input data-field="${field.key}" value="${escapeHtml(savedAliases[field.key] || '')}" placeholder="Additional terms, comma-separated" ${field.auto ? 'disabled' : ''}></td></tr>`).join('')}
        </tbody></table></div></section>`;
    }).join('') + '<div class="notice">40 physical columns A–AN from the latest DTP workbook. Fluid for protected equipment is mapped separately in column AE. Column A (No.) is generated automatically; records start at row 5.</div>';
    $('save-mapping').addEventListener('click', () => {
      const aliases = {};
      host.querySelectorAll('input[data-field]').forEach((inputElement) => {
        if (inputElement.value.trim()) aliases[inputElement.dataset.field] = inputElement.value.trim();
      });
      localStorage.setItem('are_mapping', JSON.stringify(aliases));
      showNotice($('mapping-status'), 'Alias tambahan disimpan. Gemini akan menggunakannya sebagai petunjuk mapping.', 'success');
    });
    $('reset-mapping').addEventListener('click', () => {
      localStorage.removeItem('are_mapping');
      host.querySelectorAll('input[data-field]').forEach((element) => { element.value = ''; });
      showNotice($('mapping-status'), 'Alias tambahan dihapus. Alias bawaan tetap digunakan.', 'success');
    });
  }

  // Review all 38 AI-mapped fields, source references and confidence before export.
  if ($('review-table')) {
    const normalized = consolidateContinuationRows(getRecords());
    const records = normalized.records;
    if (normalized.merged) saveRecords(records);
    const host = $('review-table');
    const summary = $('review-summary');
    const status = $('review-status');
    const renderSummary = () => {
      const tags = records.map((record) => String(record.tag_psv || '').trim().toLowerCase()).filter(Boolean);
      const duplicateCount = tags.filter((tag, index) => tags.indexOf(tag) !== index).length;
      const missingTagCount = records.filter((record) => !String(record.tag_psv || '').trim()).length;
      const lowConfidenceCount = records.filter((record) => Number(record._confidence ?? 0.5) < 0.7).length;
      const emptyCount = records.reduce((total, record) => total + dataFields.filter((field) => record[field.key] == null || String(record[field.key]).trim() === '').length, 0);
      const conflictCount = records.reduce((total, record) => total + (Array.isArray(record._merge_conflicts) ? record._merge_conflicts.length : 0), 0);
      summary.innerHTML = [
        `${records.length} records`, `${missingTagCount} missing Tag PSV`, `${duplicateCount} duplicate tag(s)`,
        `${lowConfidenceCount} low-confidence`, `${emptyCount} empty fields`, `${conflictCount} merge conflict(s)`
      ].map((label) => `<span class="summary-chip">${escapeHtml(label)}</span>`).join('');
    };

    if (!records.length) {
      host.innerHTML = '<p class="muted">Belum ada record. Upload dokumen client melalui menu New Extraction.</p>';
    } else {
      const visibleFields = schema.fields;
      const grouped = [];
      visibleFields.forEach((field) => {
        const group = field.group || 'Other';
        const last = grouped[grouped.length - 1];
        if (last && last.group === group) last.fields.push(field);
        else grouped.push({ group, fields: [field] });
      });
      const groupHeaders = grouped.map((group) =>
        `<th class="group-header" colspan="${group.fields.length}">${escapeHtml(group.group)}</th>`
      ).join('') + '<th class="group-header review-meta-group" colspan="4">Review Metadata</th>';
      const fieldHeaders = visibleFields.map((field) =>
        `<th class="field-header" title="Template column ${field.column}">${field.column} · ${escapeHtml(field.label)}</th>`
      ).join('') + '<th class="field-header">AI Confidence</th><th class="field-header">Source File</th><th class="field-header">Source Location</th><th class="field-header">Merge Conflicts</th>';
      const rows = records.map((record, rowIndex) => {
        const needsReview = Number(record._confidence ?? 0.5) < 0.7 || !String(record.tag_psv || '').trim();
        const cells = visibleFields.map((field) => {
          if (field.auto) return `<td class="auto-number">${rowIndex + 1}</td>`;
          return `<td><input data-row="${rowIndex}" data-field="${field.key}" value="${escapeHtml(record[field.key] ?? '')}" title="${escapeHtml(field.label)} · ${field.column}"></td>`;
        }).join('');
        return `<tr class="${needsReview ? 'needs-review' : ''}">${cells}
          <td>${Math.round(Number(record._confidence ?? 0.5) * 100)}%</td><td>${escapeHtml(record._source_file || '')}</td><td>${escapeHtml(record._source_location || '')}</td><td>${(record._merge_conflicts || []).map((conflict) => escapeHtml(conflict.field + ': kept [' + conflict.kept_value + '] vs [' + conflict.other_value + '] from ' + conflict.source_file)).join('<br>') || '—'}</td></tr>`;
      }).join('');
      host.innerHTML = `<div class="review-help">Edit values directly before export. Preview follows the Excel template's grouped headers and column order (A:AN). Scroll horizontally to inspect all 40 template columns. AI confidence and source references are review metadata, not Excel columns.</div>
        <table class="review-table"><thead><tr class="group-header-row">${groupHeaders}</tr><tr class="field-header-row">${fieldHeaders}</tr></thead><tbody>${rows}</tbody></table>`;
      host.querySelectorAll('input[data-row]').forEach((inputElement) => {
        inputElement.addEventListener('change', () => {
          const record = records[Number(inputElement.dataset.row)];
          record[inputElement.dataset.field] = inputElement.value;
          saveRecords(records);
          renderSummary();
        });
      });
    }
    renderSummary();

    const clearButton = $('clear-review-btn');
    clearButton?.addEventListener('click', () => {
      if (!window.confirm('Kosongkan seluruh hasil ekstraksi dan daftar file pada sesi ini? Field aliases dan Worker URL tidak akan dihapus.')) return;
      sessionStorage.removeItem('are_records');
      sessionStorage.removeItem('are_files');
      location.reload();
    });
  }
})();
