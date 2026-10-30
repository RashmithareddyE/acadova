const os = require('node:os');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createWorker, OEM, PSM } = require('tesseract.js');
const sharp = require('sharp');
const runFile = promisify(execFile);

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_OCR_IMAGE_PIXELS = 12_000_000;
const MAX_OCR_IMAGE_SIDE = 3600;
const MAX_OCR_UPSCALE = 2;
const SUPPORTED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/plain', 'text/csv', 'text/tab-separated-values', 'application/octet-stream',
]);
const IMAGE_EXTENSIONS = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] };
const trainedData = path.join(__dirname, '../../node_modules/@tesseract.js-data/eng/4.0.0_best_int');
let workerPromise;
let ocrQueue = Promise.resolve();

function sniffType(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
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
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('Files must be 12 MB or smaller.'), { statusCode: 413 });
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
    return actualType;
  }
  if (declaredType.startsWith('image/') || declaredType === 'application/pdf') throw Object.assign(new Error('The uploaded file is not a valid image or PDF.'), { statusCode: 415 });
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
  const scale = Math.min(
    MAX_OCR_UPSCALE,
    MAX_OCR_IMAGE_SIDE / Math.max(width, height),
    Math.sqrt(MAX_OCR_IMAGE_PIXELS / (width * height))
  );
  const targetWidth = Math.max(1, Math.floor(width * scale));
  const targetHeight = Math.max(1, Math.floor(height * scale));
  const enhanced = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 92 })
    .toBuffer();
  const thresholded = await sharp(enhanced)
    .threshold(165)
    .png()
    .toBuffer();
  return {
    enhanced,
    thresholded,
    scaleX: targetWidth / width,
    scaleY: targetHeight / height,
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

const WEEKDAY_ALIASES = ['monday', 'mon', 'tuesday', 'tue', 'tues', 'wednesday', 'wed', 'thursday', 'thu', 'thur', 'thurs', 'friday', 'fri', 'saturday', 'sat', 'sunday', 'sun'];

function weekdayLike(token) {
  const normalized = String(token || '').toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1|!l]/g, 'i')
    .replace(/5/g, 's')
    .replace(/[^a-z]/g, '');
  return normalized && WEEKDAY_ALIASES.some((alias) => (
    editDistance(normalized, alias) <= (alias.length <= 4 ? 1 : 2)
  ));
}

function scoreOcrResult(result) {
  const words = Array.isArray(result.words) ? result.words : [];
  const meaningfulWords = words.filter((word) => /^[a-z][a-z0-9'-]*$/i.test(word.text)).length;
  const weekdayCount = new Set(words
    .map((word) => String(word.text || '').replace(/[^a-z0-9|!]/gi, ''))
    .filter(weekdayLike)).size;
  const timeCount = (String(result.text || '').match(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d|[.][0-5]\d)\s*(?:am|pm)?\b|\b(?:1[0-2]|0?[1-9])\s*(?:am|pm)\b/gi) || []).length;
  const confidenceWords = words.filter((word) => Number.isFinite(word.confidence));
  const averageConfidence = confidenceWords.length
    ? confidenceWords.reduce((sum, word) => sum + word.confidence, 0) / confidenceWords.length
    : 0;
  return {
    score: meaningfulWords + weekdayCount * 15 + timeCount * 4 + averageConfidence / 20,
    meaningfulWords,
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
  const { enhanced, thresholded, scaleX, scaleY } = await preprocessImageCandidates(buffer);
  const candidates = [
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

async function extractText(buffer, declaredType, fileName = '', options = {}) {
  const type = validateContent(buffer, declaredType, fileName);
  if (type.startsWith('text/')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer).replace(/^\uFEFF/, '').trim();
    if (!text) throw Object.assign(new Error('The text file is empty.'), { statusCode: 422 });
    return { text, sourceType: type, method: 'text' };
  }
  if (type === 'application/pdf') {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'acadova-import-'));
    const filePath = path.join(directory, 'source.pdf');
    try {
      await fs.writeFile(filePath, buffer, { mode: 0o600, flag: 'wx' });
      let result;
      try { result = await runFile(process.env.PDFTOTEXT_PATH || 'pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], { encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }); }
      catch (error) {
        if (error.code === 'ENOENT') throw Object.assign(new Error('PDF text extraction is unavailable. Install Poppler (pdftotext) or set PDFTOTEXT_PATH.'), { statusCode: 503 });
        throw Object.assign(new Error('The PDF could not be read. Scanned PDFs need OCR; use an image or CSV/text file.'), { statusCode: 422 });
      }
      const text = result.stdout.trim();
      if (!text) throw Object.assign(new Error('No selectable text was found in this PDF. Scanned PDFs need OCR; try a text-based PDF or CSV for now.'), { statusCode: 422 });
      return { text, sourceType: type, method: 'pdf-text' };
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
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
  extractText, scoreOcrResult, selectBestOcrResult, preprocessImageCandidates, shutdownOcrWorker,
};
