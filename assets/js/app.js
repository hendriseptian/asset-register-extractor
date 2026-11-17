// Shared browser utilities. API secrets must remain in Cloudflare Worker secrets.
(function () {
  const KEY = 'are_worker_url';
  const parse = (key, fallback) => {
    try { return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  window.ARE = {
    getWorkerUrl: () => localStorage.getItem(KEY) || '',
    setWorkerUrl: (value) => localStorage.setItem(KEY, (value || '').trim().replace(/\/$/, '')),
    getRecords: () => parse('are_records', []),
    setRecords: (value) => sessionStorage.setItem('are_records', JSON.stringify(value)),
    getFiles: () => parse('are_files', []),
    setFiles: (value) => sessionStorage.setItem('are_files', JSON.stringify(value)),
    getFieldMapping: () => { try { return JSON.parse(localStorage.getItem('are_mapping') || '{}'); } catch { return {}; } },
    setFieldMapping: (value) => localStorage.setItem('are_mapping', JSON.stringify(value)),
    notify: (element, message, type = '') => { if (element) { element.textContent = message; element.className = `notice ${type}`.trim(); element.hidden = false; } },
    escape: (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  };
  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('worker-url');
    const save = document.getElementById('save-worker');
    if (input) {
      input.value = ARE.getWorkerUrl();
      save?.addEventListener('click', () => {
        const value = input.value.trim();
        if (!/^https:\/\//i.test(value)) { alert('Enter a valid HTTPS Cloudflare Worker URL.'); return; }
        ARE.setWorkerUrl(value);
        location.href = 'dashboard.html';
      });
    }
    const filesNode = document.getElementById('stat-files');
    const recordsNode = document.getElementById('stat-records');
    const reviewNode = document.getElementById('stat-review');
    if (filesNode) {
      const records = ARE.getRecords();
      const tags = records.map((record) => String(record.tag_psv || '').trim().toLowerCase()).filter(Boolean);
      const duplicates = tags.filter((tag, index) => tags.indexOf(tag) !== index).length;
      filesNode.textContent = ARE.getFiles().length;
      recordsNode.textContent = records.length;
      reviewNode.textContent = records.filter((record) => !String(record.tag_psv || '').trim() || Number(record._confidence ?? 0.5) < 0.7).length + duplicates;
    }
  });
})();
