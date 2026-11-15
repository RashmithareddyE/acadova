const os = require('node:os');
const path = require('node:path');
const { createWorker, OEM, PSM } = require('tesseract.js');
const sharp = require('sharp');
const ExcelJS = require('exceljs');

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_OCR_IMAGE_PIXELS = 16_000_000;
const MAX_OCR_IMAGE_SIDE = 4000;
const MAX_OCR_UPSCALE = 3;
const SUPPORTED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/plain', 'text/csv', 'text/tab-separated-values', 'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const IMAGE_EXTENSIONS = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const trainedData = path.join(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0_best_int');
let workerPromise;
let ocrQueue = Promise.resolve();

function sniffType(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return XLSX_TYPE;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function imageDimensions(buffer, type) {
  if (type === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1]; offset += 2;
      if ([0xd8, 0xd9, 0x01].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = buffer.readUInt16BE(offset);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }
  if (type === 'image/webp' && buffer.length >= 30) {
    const chunk = buffer.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function validateContent(buffer, declaredType, fileName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw Object.assign(new Error('Choose a non-empty file to import.'), { statusCode: 400 });
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('Files must be 25 MB or smaller.'), { statusCode: 413 });
  if (!SUPPORTED_TYPES.has(declaredType)) throw Object.assign(new Error('Upload a PDF, JPG, PNG, WebP, CSV, TSV, or plain-text timetable.'), { statusCode: 415 });
  const actualType = sniffType(buffer);
  if (actualType) {
    if (declaredType !== 'application/octet-stream' && actualType !== declaredType) throw Object.assign(new Error('The file content does not match its declared type.'), { statusCode: 415 });
    if (IMAGE_EXTENSIONS[actualType] && !fileName) throw Object.assign(new Error('Include the image filename so its extension can be verified.'), { statusCode: 400 });
    if (IMAGE_EXTENSIONS[actualType] && !IMAGE_EXTENSIONS[actualType].includes(path.extname(fileName).toLowerCase())) throw Object.assign(new Error('The image file extension does not match its content.'), { statusCode: 415 });
    if (IMAGE_EXTENSIONS[actualType]) {
      const dimensions = imageDimensions(buffer, actualType);
      if (!dimensions || !dimensions.width || !dimensions.height) throw Object.assign(new Error('The image dimensions could not be read. Re-export the image and try again.'), { statusCode: 415 });
      if (dimensions.width > 12000 || dimensions.height > 12000 || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) throw Object.assign(new Error('Images must be 12,000 pixels or smaller per side and no more than 40 megapixels.'), { statusCode: 413 });
    }
    if (actualType === XLSX_TYPE && path.extname(fileName).toLowerCase() !== '.xlsx') {
      throw Object.assign(new Error('The spreadsheet file extension does not match its content.'), { statusCode: 415 });
    }
    return actualType;
  }
  if (declaredType.startsWith('image/') || declaredType === 'application/pdf' || declaredType === XLSX_TYPE) throw Object.assign(new Error('The uploaded file is not a valid image, PDF, or XLSX spreadsheet.'), { statusCode: 415 });
  if (buffer.includes(0)) throw Object.assign(new Error('This file does not look like CSV or plain text.'), { statusCode: 415 });
  return declaredType === 'application/octet-stream' ? 'text/plain' : declaredType;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      langPath: trainedData, gzip: true, cachePath: path.join(os.tmpdir(), 'acadova-tesseract-cache'), cacheMethod: 'write',
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      return worker;
    }).catch(() => {
      workerPromise = undefined;
      throw Object.assign(new Error('Local OCR could not start. Reinstall backend dependencies so the bundled English trained data is available.'), { statusCode: 503 });
    });
  }
  return workerPromise;
}

function withOcrQueue(operation) {
  const result = ocrQueue.then(operation, operation);
  ocrQueue = result.catch(() => {});
  return result;
}

async function preprocessImageCandidates(buffer) {
  const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions could not be read for OCR preprocessing.');
  const swapsDimensions = [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapsDimensions ? metadata.height : metadata.width;
  const height = swapsDimensions ? metadata.width : metadata.height;
  const isLowRes = Math.min(width, height) < 600;
  const scale = isLowRes ? 2.2 : 1;
  const targetWidth = Math.max(1, Math.floor(width * scale));
  const targetHeight = Math.max(1, Math.floor(height * scale));

  const pipeline = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2, m1: 1, m2: 2 });

  const enhanced = isLowRes
    ? await pipeline.png().toBuffer()
    : await pipeline.jpeg({ quality: 92 }).toBuffer();
  const thresholded = await sharp(enhanced)
    .threshold(165)
    .png()
    .toBuffer();
  return {
    enhanced,
    thresholded,
    scaleX: targetWidth / width,
    scaleY: targetHeight / height,
    isLowRes,
  };
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}

const WEEKDAY_ALIASES = ['monday', 'mon', 'man', 'tuesday', 'tue', 'tues', 'wednesday', 'wed', 'thursday', 'thu', 'thur', 'thurs', 'friday', 'fri', 'saturday', 'sat', 'sa', 'sunday', 'sun'];

function weekdayLike(token) {
  const normalized = String(token || '').toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1|!l]/g, 'i')
    .replace(/5/g, 's')
    .replace(/[^a-z]/g, '');
  if (!normalized || normalized.length < 3) return false;
  return WEEKDAY_ALIASES.includes(normalized) || WEEKDAY_ALIASES.some((alias) => (
    alias.length >= 3 && editDistance(normalized, alias) <= 1
  ));
}

function scoreOcrResult(result) {
  const words = Array.isArray(result.words) ? result.words : [];
  const text = String(result.text || '');
  const highConfWords = words.filter((word) => Number(word.confidence) >= 50 && /^[a-z][a-z0-9'-]{2,}$/i.test(word.text));
  const weekdayCount = new Set(words
    .map((word) => String(word.text || '').replace(/[^a-z0-9|!]/gi, ''))
    .filter(weekdayLike)).size;
  const timeCount = (text.match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d|[.][0-5]\d)\s*(?:am|pm)?\b|\b(?:1[0-2]|0?[1-9])\s*(?:am|pm)\b/gi) || []).length;
  const academicKeywords = (text.match(/\b(semester|sem|department|college|engineering|lab|laboratory|tutorial|room|prof|dr|class|table|timetable|remedial|proctor|subject|code)\b/gi) || []).length;
  const garbageSymbols = (text.match(/[|=_+~\[\]\\*^`#]/g) || []).length;
  const averageConfidence = highConfWords.length
    ? highConfWords.reduce((sum, word) => sum + word.confidence, 0) / highConfWords.length
    : 0;

  const score = (highConfWords.length * 2)
    + (weekdayCount * 30)
    + (timeCount * 12)
    + (academicKeywords * 10)
    + (averageConfidence / 5)
    - (garbageSymbols * 0.5);

  return {
    score,
    meaningfulWords: highConfWords.length,
    weekdayCount,
    timeCount,
    averageConfidence,
  };
}

function selectBestOcrResult(results) {
  return results.reduce((best, candidate) => (
    !best || candidate.quality.score > best.quality.score ? candidate : best
  ), null);
}

async function recognizeTimetableImage(buffer, worker) {
  const { enhanced, thresholded, scaleX, scaleY, isLowRes } = await preprocessImageCandidates(buffer);
  const candidates = isLowRes
    ? [
        { image: enhanced, mode: PSM.AUTO, scaleX, scaleY },
        { image: thresholded, mode: PSM.SPARSE_TEXT, scaleX, scaleY },
      ]
    : [
        { image: buffer, mode: PSM.AUTO, scaleX: 1, scaleY: 1 },
        { image: enhanced, mode: PSM.AUTO, scaleX, scaleY },
        { image: enhanced, mode: PSM.SPARSE_TEXT, scaleX, scaleY },
        { image: thresholded, mode: PSM.SPARSE_TEXT, scaleX, scaleY },
      ];
  const results = [];
  for (const candidate of candidates) {
    await worker.setParameters({ tessedit_pageseg_mode: candidate.mode, preserve_interword_spaces: '1' });
    const recognized = await worker.recognize(candidate.image, {}, { blocks: true });
    const result = {
      text: recognized.data.text.trim(),
      words: collectWords(recognized.data.blocks || []),
    };
    results.push({ ...result, scaleX: candidate.scaleX, scaleY: candidate.scaleY, quality: scoreOcrResult(result) });
  }
  const best = selectBestOcrResult(results);
  const normalizeCoordinates = (word, scaleX, scaleY) => ({
    ...word,
    bbox: {
      x0: word.bbox.x0 / scaleX,
      y0: word.bbox.y0 / scaleY,
      x1: word.bbox.x1 / scaleX,
      y1: word.bbox.y1 / scaleY,
    },
  });
  const words = best?.words.map((word) => normalizeCoordinates(word, best.scaleX, best.scaleY)) || [];
  const firstDayY = Math.min(...words
    .filter((word) => weekdayLike(word.text))
    .map((word) => word.bbox.y0));
  if (Number.isFinite(firstDayY)) {
    for (const candidate of results) {
      if (candidate === best) continue;
      for (const source of candidate.words) {
        const word = normalizeCoordinates(source, candidate.scaleX, candidate.scaleY);
        const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
        if (centerY >= firstDayY || !/\d/.test(word.text) || (Number(word.confidence) || 0) < 55) continue;
        const overlaps = words.map((current, index) => {
          const width = Math.max(0, Math.min(current.bbox.x1, word.bbox.x1) - Math.max(current.bbox.x0, word.bbox.x0));
          const height = Math.max(0, Math.min(current.bbox.y1, word.bbox.y1) - Math.max(current.bbox.y0, word.bbox.y0));
          const smallerArea = Math.min(
            (current.bbox.x1 - current.bbox.x0) * (current.bbox.y1 - current.bbox.y0),
            (word.bbox.x1 - word.bbox.x0) * (word.bbox.y1 - word.bbox.y0)
          );
          return smallerArea > 0 && width * height / smallerArea > 0.25 ? index : -1;
        }).filter((index) => index >= 0);
        if (!overlaps.length) words.push(word);
        else {
          const weakest = overlaps.reduce((bestIndex, index) => (
            (Number(words[index].confidence) || 0) < (Number(words[bestIndex].confidence) || 0) ? index : bestIndex
          ), overlaps[0]);
          if ((Number(word.confidence) || 0) > (Number(words[weakest].confidence) || 0) + 5) {
            words.splice(weakest, 1, word);
          }
        }
      }
    }
  }
  return best && {
    text: best.text,
    words,
  };
}

async function loadPdfDocument(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
}

function pdfTextWords(items, viewport, pageOffset) {
  const words = [];
  const text = [];
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    text.push(`${item.str}${item.hasEOL ? '\n' : ' '}`);
    const tokens = [...item.str.matchAll(/\S+/g)];
    if (!tokens.length) continue;
    const transform = item.transform || [];
    const baseline = viewport.convertToViewportPoint(Number(transform[4]) || 0, Number(transform[5]) || 0);
    const height = Math.max(8, Math.abs(Number(item.height) || Math.hypot(Number(transform[2]) || 0, Number(transform[3]) || 0)));
    const width = Math.max(0, Number(item.width) || 0);
    for (const token of tokens) {
      const start = token.index / item.str.length;
      const end = (token.index + token[0].length) / item.str.length;
      words.push({
        text: token[0],
        confidence: 100,
        bbox: {
          x0: baseline[0] + width * start,
          y0: baseline[1] - height + pageOffset,
          x1: baseline[0] + width * end,
          y1: baseline[1] + pageOffset,
        },
      });
    }
  }
  return { words, text: text.join('').trim() };
}

async function extractPageImagesOrMasks(page) {
  const ops = await page.getOperatorList();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const OPS = pdfjs.OPS;
  const imageBuffers = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.paintImageMaskXObject) {
      const meta = ops.argsArray[i][0];
      const maskName = typeof meta === 'string' ? meta : meta?.data;
      if (!maskName) continue;
      const mask = await new Promise((resolve) => page.objs.get(maskName, resolve));
      if (mask && mask.data && mask.width > 250 && mask.height > 80) {
        const width = mask.width;
        const height = mask.height;
        const bytesPerRow = Math.ceil(width / 8);
        const gray = Buffer.alloc(width * height);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const byteIdx = y * bytesPerRow + (x >> 3);
            const bit = (mask.data[byteIdx] >> (7 - (x & 7))) & 1;
            gray[y * width + x] = bit ? 0 : 255;
          }
        }
        const pngBuf = await sharp(gray, { raw: { width, height, channels: 1 } }).png().toBuffer();
        imageBuffers.push(pngBuf);
      }
    }
  }

  if (imageBuffers.length) return imageBuffers;

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const imgName = ops.argsArray[i][0];
      if (!imgName) continue;
      const img = await new Promise((resolve) => page.objs.get(imgName, resolve));
      if (img && img.data && img.width > 250 && img.height > 80) {
        const channels = img.kind === 1 ? 1 : (img.kind === 2 ? 3 : 4);
        const pngBuf = await sharp(img.data, {
          raw: { width: img.width, height: img.height, channels }
        }).png().toBuffer();
        imageBuffers.push(pngBuf);
      }
    }
  }

  return imageBuffers;
}

async function renderPdfPage(page, dependencies = {}) {
  if (dependencies.renderPage) return dependencies.renderPage(page);
  const { createCanvas } = require('@napi-rs/canvas');
  const initialViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    2,
    MAX_OCR_IMAGE_SIDE / Math.max(initialViewport.width, initialViewport.height),
    Math.sqrt(MAX_OCR_IMAGE_PIXELS / (initialViewport.width * initialViewport.height))
  );
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function extractPdf(buffer, dependencies = {}) {
  const loadDocument = dependencies.loadDocument || loadPdfDocument;
  let document;
  try {
    document = await loadDocument(buffer);
  } catch (error) {
    throw Object.assign(new Error(`The PDF could not be opened: ${error.message}`), { statusCode: 422 });
  }
  if (!document.numPages) throw Object.assign(new Error('The PDF contains no pages.'), { statusCode: 422 });
  if (document.numPages > 10) throw Object.assign(new Error('PDFs must contain 10 pages or fewer. Split the timetable into smaller files and try again.'), { statusCode: 413 });

  const words = [];
  const text = [];
  let pageOffset = 0;
  let usedOcr = false;
  let usedDigitalText = false;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const positioned = pdfTextWords((await page.getTextContent()).items || [], viewport, pageOffset);
    if (positioned.words.length) {
      words.push(...positioned.words);
      text.push(positioned.text);
      usedDigitalText = true;
    } else {
      let pageImages = [];
      try {
        pageImages = await extractPageImagesOrMasks(page);
      } catch {}

      if (!pageImages.length) {
        try {
          const image = await renderPdfPage(page, dependencies);
          if (image) pageImages.push(image);
        } catch {}
      }

      const recognize = dependencies.recognizeTimetableImage || recognizeTimetableImage;
      const worker = dependencies.worker || await getWorker();

      for (const image of pageImages) {
        const recognized = await recognize(image, worker);
        if (recognized?.words?.length) {
          words.push(...recognized.words.map((word) => ({
            ...word,
            bbox: { ...word.bbox, y0: word.bbox.y0 + pageOffset, y1: word.bbox.y1 + pageOffset },
          })));
        }
        if (recognized?.text) text.push(recognized.text);
      }
      usedOcr = true;
    }
    pageOffset += viewport.height + 40;
  }
  const resultText = text.filter(Boolean).join('\n').trim();
  if (!resultText && !words.length) {
    throw Object.assign(new Error('No readable timetable text was found in the PDF. Try a clearer scan or enter the classes in the manual preview.'), { statusCode: 422 });
  }
  return {
    text: resultText,
    words,
    sourceType: 'application/pdf',
    method: usedOcr ? (usedDigitalText ? 'pdf-text+local-ocr' : 'pdf-local-ocr') : 'pdf-text',
  };
}

function spreadsheetCellText(cell, header = '') {
  const value = cell.value;
  if (typeof value === 'number' && /(?:start|end|time|from|until|to)/i.test(header) && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  return String(cell.text ?? (value == null ? '' : value)).trim();
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function extractSpreadsheet(buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
    if (!worksheet) throw new Error('The spreadsheet has no non-empty worksheet.');
    if (worksheet.actualRowCount > 2000 || worksheet.columnCount > 50) {
      throw Object.assign(new Error('The timetable spreadsheet must contain no more than 2,000 rows and 50 columns.'), { statusCode: 413 });
    }
    const header = worksheet.getRow(1).values.map((value) => String(value || '').toLowerCase());
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        values.push(spreadsheetCellText(row.getCell(column), header[column] || ''));
      }
      rows.push(values);
    });
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    if (!csv.trim()) throw new Error('The spreadsheet contains no timetable data.');
    return { text: csv, sourceType: 'text/csv', method: 'xlsx-spreadsheet' };
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    throw Object.assign(new Error(`The XLSX spreadsheet could not be read: ${error.message}`), { statusCode: 422 });
  }
}

async function extractText(buffer, declaredType, fileName = '', options = {}) {
  const type = validateContent(buffer, declaredType, fileName);
  if (type === XLSX_TYPE) return extractSpreadsheet(buffer);
  if (type.startsWith('text/')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '').trim();
    if (!text) throw Object.assign(new Error('The text file is empty.'), { statusCode: 422 });
    return { text, sourceType: type, method: 'text' };
  }
  if (type === 'application/pdf') {
    return extractPdf(buffer);
  }
  try {
    const result = await withOcrQueue(async () => {
      const worker = await getWorker();
      if (options.timetableOcr) return recognizeTimetableImage(buffer, worker);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      const recognized = await worker.recognize(buffer, {}, { blocks: true });
      return { text: recognized.data.text.trim(), words: collectWords(recognized.data.blocks || []) };
    });
    const text = result.text;
    if (!text) throw Object.assign(new Error('No readable text was found in this image. Try a clearer photo or a text-based file.'), { statusCode: 422 });
    return { ...result, sourceType: type, method: 'tesseract.js-local-ocr', dimensions: imageDimensions(buffer, type) };
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    throw Object.assign(new Error('Local image OCR could not read this file. Try a clearer JPG, PNG, or WebP image.'), { statusCode: 422 });
  }
}

function collectWords(blocks) {
  const words = [];
  for (const block of blocks) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) for (const word of line.words || []) {
    if (word.text?.trim() && word.bbox) words.push({ text: word.text.trim(), confidence: word.confidence, bbox: word.bbox });
  }
  return words;
}

async function shutdownOcrWorker() {
  const active = workerPromise;
  workerPromise = undefined;
  if (active) {
    try { await (await active).terminate(); } catch {}
  }
}

module.exports = {
  MAX_BYTES, MAX_IMAGE_PIXELS, sniffType, imageDimensions, validateContent,
  extractText, extractPdf, extractSpreadsheet, scoreOcrResult, selectBestOcrResult,
  preprocessImageCandidates, shutdownOcrWorker,
};
