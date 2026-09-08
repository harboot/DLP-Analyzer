(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const input = byId('file');
  const status = byId('status');
  const textOutput = byId('text');
  const state = { url: '', zip: null, initialText: '', initialSource: '' };
  const textExtensions = /\.(?:txt|csv|json|xml|html?|md|log|ini|yaml|yml|js|css|rtf)$/i;
  const zipTextExtensions = /\.(?:txt|csv|json|xml|html?|md|log|ini|yaml|yml|js|css|rtf)$/i;

  function show(element, visible = true) { element.classList.toggle('hidden', !visible); }
  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `soft doc-status ${kind}`.trim();
  }
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }
  function extension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : 'none'; }
  function magicType(bytes) {
    const ascii = new TextDecoder('latin1').decode(bytes.slice(0, 16));
    const starts = (...values) => values.every((value, index) => bytes[index] === value);
    if (ascii.startsWith('%PDF-')) return 'PDF';
    if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) return 'ZIP';
    if (starts(0x89, 0x50, 0x4e, 0x47)) return 'PNG';
    if (starts(0xff, 0xd8, 0xff)) return 'JPEG';
    if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'GIF';
    if (ascii.startsWith('BM')) return 'BMP';
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'WebP';
    if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return 'TIFF';
    if (ascii.includes('ftypavif')) return 'AVIF';
    if (ascii.includes('ftypheic') || ascii.includes('ftypheif')) return 'HEIC';
    return 'Unknown';
  }
  function isProbablyText(bytes) {
    if (!bytes.length) return true;
    let suspicious = 0;
    for (const byte of bytes.slice(0, 4096)) if (byte === 0 || (byte < 9 || (byte > 13 && byte < 32))) suspicious++;
    return suspicious / Math.min(bytes.length, 4096) < 0.02;
  }
  function reset() {
    if (state.url) URL.revokeObjectURL(state.url);
    Object.assign(state, { url: '', zip: null, initialText: '', initialSource: '' });
    input.value = '';
    ['metaBox', 'zipBox', 'viewBox', 'zipBrief', 'imgBrief', 'imgWrap', 'text', 'pdfImgGallery', 'pdfEmbedWrap', 'note', 'restoreBtn', 'zipSearchBar'].forEach(id => show(byId(id), false));
    byId('zipList').replaceChildren();
    byId('pdfImgGallery').replaceChildren();
    byId('img').removeAttribute('src');
    byId('pdfEmbed').removeAttribute('src');
    byId('zipSearch').value = '';
    setStatus('Ready.');
  }
  function setText(value, source, remember = false) {
    textOutput.textContent = value || 'No readable text was found.';
    show(textOutput);
    show(byId('imgWrap'), false); show(byId('pdfEmbedWrap'), false); show(byId('pdfImgGallery'), false);
    byId('fromLabel').textContent = `source: ${source}`;
    if (remember) Object.assign(state, { initialText: textOutput.textContent, initialSource: source });
    show(byId('restoreBtn'), Boolean(state.initialText) && (textOutput.textContent !== state.initialText));
  }
  function xmlText(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) return xml;
    doc.querySelectorAll('w\\:tab, tab').forEach(node => node.replaceWith('\t'));
    doc.querySelectorAll('w\\:br, br, a\\:br').forEach(node => node.replaceWith('\n'));
    return doc.documentElement.textContent.replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }
  async function extractOfficeText(zip, names, type) {
    const parts = [];
    for (const name of names) {
      const entry = zip.file(name);
      if (!entry) continue;
      let value = xmlText(await entry.async('text'));
      if (type === 'XLSX' && name === 'xl/sharedStrings.xml') value = value.replace(/\s+/g, ' ');
      if (value) parts.push(`--- ${name} ---\n${value}`);
    }
    return parts.join('\n\n');
  }
  function classifyZip(names) {
    if (names.includes('[Content_Types].xml') && names.some(name => name.startsWith('word/'))) return 'DOCX';
    if (names.some(name => name.startsWith('ppt/'))) return 'PPTX';
    if (names.some(name => name.startsWith('xl/'))) return 'XLSX';
    if (names.includes('content.xml')) return 'OpenDocument';
    return 'ZIP';
  }
  async function previewZip(bytes) {
    if (!window.JSZip) throw new Error('The ZIP reader library could not be loaded. Check your network connection.');
    const zip = await window.JSZip.loadAsync(bytes);
    state.zip = zip;
    const entries = Object.values(zip.files);
    const names = entries.map(entry => entry.name);
    const type = classifyZip(names);
    show(byId('zipBrief')); show(byId('zipBox')); show(byId('zipSearchBar'));
    byId('zipEnc').textContent = `zip-encrypted: ${entries.some(entry => entry._data && entry._data.encrypted) ? 'yes' : 'no'}`;
    byId('zipCount').textContent = `zip-entries: ${entries.length}`;
    byId('zip64').textContent = `zip64: ${bytes.some((byte, index) => byte === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x06 && bytes[index + 3] === 0x06) ? 'yes' : 'no'}`;
    byId('zipType').textContent = `doc-type: ${type}`;
    renderZipList(entries);

    let result = '';
    if (type === 'DOCX') result = await extractOfficeText(zip, names.filter(name => /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)), type);
    else if (type === 'PPTX') result = await extractOfficeText(zip, names.filter(name => /^ppt\/(?:slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml$/.test(name)).sort(), type);
    else if (type === 'XLSX') result = await extractOfficeText(zip, names.filter(name => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(), type);
    else if (type === 'OpenDocument') result = await extractOfficeText(zip, ['content.xml'], type);
    else {
      const first = entries.find(entry => !entry.dir && zipTextExtensions.test(entry.name));
      if (first) result = `--- ${first.name} ---\n${await first.async('text')}`;
    }
    setText(result || 'Select a text entry from the ZIP contents to inspect it.', type, true);
  }
  function renderZipList(entries) {
    const list = byId('zipList');
    list.replaceChildren();
    const header = document.createElement('div');
    header.className = 'ziprow head';
    ['Name', 'Size', 'Type'].forEach(label => { const span = document.createElement('span'); span.textContent = label; header.append(span); });
    list.append(header);
    for (const entry of entries) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'ziprow'; row.disabled = entry.dir;
      const size = entry._data?.uncompressedSize;
      [entry.name, size == null ? '—' : formatBytes(size), entry.dir ? 'Folder' : (extension(entry.name).toUpperCase())].forEach(value => {
        const span = document.createElement('span'); span.textContent = value; row.append(span);
      });
      if (!entry.dir) row.addEventListener('click', async () => {
        try {
          if (zipTextExtensions.test(entry.name) || /\.xml$/i.test(entry.name)) setText(await entry.async('text'), entry.name);
          else setText('This ZIP entry is not a supported text file.', entry.name);
        } catch (error) { setStatus(`Unable to open ZIP entry: ${error.message}`, 'danger'); }
      });
      list.append(row);
    }
  }
  async function searchZip() {
    const query = byId('zipSearch').value.trim().toLocaleLowerCase();
    if (!query || !state.zip) { setStatus('Enter text to search inside the ZIP.', 'warn'); return; }
    setStatus('Searching ZIP text entries…');
    const matches = [];
    for (const entry of Object.values(state.zip.files)) {
      if (entry.dir || (!zipTextExtensions.test(entry.name) && !/\.xml$/i.test(entry.name))) continue;
      try {
        const content = await entry.async('text');
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => { if (line.toLocaleLowerCase().includes(query)) matches.push(`${entry.name}:${index + 1}: ${line.trim()}`); });
      } catch (_) { /* Unsupported or encrypted entries are skipped. */ }
    }
    setText(matches.join('\n') || `No matches found for “${byId('zipSearch').value.trim()}”.`, 'ZIP search results');
    setStatus(`${matches.length.toLocaleString()} matching line${matches.length === 1 ? '' : 's'} found.`, matches.length ? 'ok' : 'warn');
  }
  async function previewPdf(bytes) {
    state.url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    byId('pdfEmbed').src = state.url; show(byId('pdfEmbedWrap'));
    byId('fromLabel').textContent = 'source: browser PDF viewer';
    const pdfjs = globalThis.pdfjsLib;
    if (!pdfjs) { setStatus('PDF opened with the browser viewer; text extraction is unavailable.', 'warn'); return; }
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(`--- Page ${pageNumber} ---\n${content.items.map(item => item.str).join(' ')}`);
    }
    state.initialText = pages.join('\n\n'); state.initialSource = 'PDF text';
    byId('fromLabel').textContent = `source: PDF (${pdf.numPages} pages; browser viewer shown)`;
    setStatus(`PDF loaded: ${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} and text extracted.`, 'ok');
  }
  function previewImage(file) {
    state.url = URL.createObjectURL(file);
    const image = byId('img'); image.src = state.url; show(byId('imgWrap')); show(byId('imgBrief'));
    image.onload = () => { byId('imgDim').textContent = `image: ${image.naturalWidth} × ${image.naturalHeight} px`; };
    byId('fromLabel').textContent = 'source: image preview';
  }
  async function openFile(file) {
    reset();
    if (!file) return;
    setStatus('Reading file…');
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = magicType(bytes);
    show(byId('metaBox')); show(byId('viewBox'));
    byId('fn').textContent = `name: ${file.name}`;
    byId('fs').textContent = `size: ${formatBytes(file.size)}`;
    byId('ft').textContent = `extension: ${extension(file.name)}`;
    byId('fm').textContent = `detected: ${detected}`;
    byId('magic').textContent = `magic: ${Array.from(bytes.slice(0, 32), byte => byte.toString(16).padStart(2, '0')).join(' ') || '(empty)'}`;
    if (detected === 'ZIP') await previewZip(bytes);
    else if (detected === 'PDF') await previewPdf(bytes);
    else if (['PNG', 'JPEG', 'GIF', 'BMP', 'WebP', 'AVIF'].includes(detected) || file.type.startsWith('image/')) previewImage(file);
    else if (textExtensions.test(file.name) || file.type.startsWith('text/') || isProbablyText(bytes)) {
      let content = new TextDecoder('utf-8').decode(bytes);
      if (/\.html?$/i.test(file.name)) content = new DOMParser().parseFromString(content, 'text/html').body.textContent.trim();
      setText(content, detected === 'Unknown' ? 'plain text' : detected, true);
    } else {
      setText('No safe browser preview is available for this binary format.', detected);
      show(byId('note')); byId('note').textContent = 'The file was read locally, but its contents were not sent anywhere.';
    }
    if (detected !== 'PDF') setStatus(`${file.name} loaded.`, 'ok');
  }

  input.addEventListener('change', () => openFile(input.files[0]).catch(error => setStatus(`Unable to display the file: ${error.message}`, 'danger')));
  byId('clearBtn').addEventListener('click', reset);
  byId('zipSearchBtn').addEventListener('click', () => searchZip().catch(error => setStatus(`Search failed: ${error.message}`, 'danger')));
  byId('zipSearch').addEventListener('keydown', event => { if (event.key === 'Enter') byId('zipSearchBtn').click(); });
  byId('restoreBtn').addEventListener('click', () => setText(state.initialText, state.initialSource));
  const dropper = byId('dropper');
  ['dragenter', 'dragover'].forEach(type => dropper.addEventListener(type, event => { event.preventDefault(); dropper.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(type => dropper.addEventListener(type, event => { event.preventDefault(); dropper.classList.remove('drag'); }));
  dropper.addEventListener('drop', event => openFile(event.dataTransfer.files[0]).catch(error => setStatus(`Unable to display the file: ${error.message}`, 'danger')));
})();
