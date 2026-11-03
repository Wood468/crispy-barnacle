#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://pogo.michaelpuff.com';
const LEEKDUCK_ORIGIN = 'https://cdn.leekduck.com';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1536 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export function sourceDescriptor(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('//')) return null;
  if (!value.startsWith('/') && !value.startsWith('https://')) return null;
  let parsed;
  try { parsed = new URL(value, ORIGIN); } catch (_) { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;

  const prefix = parsed.origin === ORIGIN
    ? '/img/ext/'
    : (parsed.origin === LEEKDUCK_ORIGIN ? '/assets/img/events/' : null);
  if (!prefix) return null;

  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); } catch (_) { return null; }
  if (!pathname.startsWith(prefix)) return null;
  const relative = pathname.slice(prefix.length);
  const parts = relative.split('/');
  if (!relative || parts.some(part => !part || part === '.' || part === '..')) return null;
  if (!IMAGE_EXTENSIONS.has(path.posix.extname(relative).toLowerCase())) return null;

  return {
    url: parsed.href,
    origin: parsed.origin,
    relativePath: parsed.origin === ORIGIN ? 'img/ext/' + relative : null
  };
}

export function sourceHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function thumbnailFilename(id, image) {
  const slug = String(id || '').replace(/^season:/i, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const source = String(image || '');
  return slug && source ? 'season-' + slug + '-' + sourceHash(source) + '.webp' : null;
}

export function thumbnailPath(id, image) {
  const filename = thumbnailFilename(id, image);
  return filename ? '/season-thumbs/' + filename : '';
}

export function collectSeasonPosters(season) {
  const seen = new Set();
  const items = Array.isArray(season && season.items) ? season.items : [];
  return items.map(item => {
    if (!item || typeof item !== 'object') return null;
    const source = sourceDescriptor(item.img);
    const filename = thumbnailFilename(item.id, item.img);
    if (!source || !filename || seen.has(filename)) return null;
    seen.add(filename);
    return { id: item.id, image: item.img, source, filename };
  }).filter(Boolean).sort((a, b) => a.filename.localeCompare(b.filename));
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

async function convertImage(source, destination) {
  await execFileAsync('convert', [
    source, '-auto-orient', '-thumbnail', '640x960>', '-strip',
    '-quality', '74', '-define', 'webp:method=6', destination
  ], { maxBuffer: 20 * 1024 * 1024 });
}

function isWebp(bytes) {
  return bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
}

function isSupportedImage(bytes) {
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return jpeg || png || isWebp(bytes);
}

async function fetchOriginal(source, tempRoot, fetchImpl) {
  const response = await fetchImpl(source.url, {
    headers: {
      accept: 'image/jpeg,image/png,image/webp,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 go-field-notes-season-thumbnail-generator'
    },
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error('HTTP ' + response.status);

  const finalUrl = response.url ? new URL(response.url) : new URL(source.url);
  if (finalUrl.origin !== source.origin) throw new Error('image response left its approved origin');

  const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'].includes(contentType)) {
    throw new Error('unexpected content type ' + contentType);
  }
  const rawLength = response.headers?.get?.('content-length') || '';
  const contentLength = Number(rawLength);
  if (rawLength && Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
    throw new Error('source image exceeds the 20 MB safety limit');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('source image size is outside the 20 MB safety limit');
  if (!isSupportedImage(bytes)) throw new Error('source response is not a JPEG, PNG or WebP image');

  const parsed = new URL(source.url);
  const relative = source.relativePath || path.posix.join('cdn', sourceHash(source.url) + path.posix.extname(parsed.pathname).toLowerCase());
  const file = path.resolve(tempRoot, ...relative.split('/'));
  if (!file.startsWith(tempRoot + path.sep)) throw new Error('unsafe temporary source path');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return file;
}

export async function generateSeasonThumbnails({
  root = ROOT,
  convert = convertImage,
  log = console.log,
  sourceMode = 'local',
  skipExisting = false,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!['local', 'remote'].includes(sourceMode)) throw new Error('sourceMode must be local or remote');
  const publicRoot = path.resolve(root, 'public');
  const thumbnailRoot = path.resolve(publicRoot, 'season-thumbs');
  const season = await readJson(path.join(publicRoot, 'season.json'));
  const posters = collectSeasonPosters(season);
  await fs.mkdir(thumbnailRoot, { recursive: true });

  const tempRoot = sourceMode === 'remote' ? await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-season-thumbnails-')) : null;
  let generated = 0, unchanged = 0, missing = 0, failed = 0;
  try {
    for (const poster of posters) {
      const destination = path.resolve(thumbnailRoot, poster.filename);
      if (!destination.startsWith(thumbnailRoot + path.sep)) {
        failed++;
        log('Unsafe Season thumbnail path skipped: ' + poster.id);
        continue;
      }

      if (skipExisting) {
        try {
          const existing = await fs.readFile(destination);
          if (isWebp(existing)) { unchanged++; continue; }
        } catch (error) {
          if (!error || error.code !== 'ENOENT') throw error;
        }
      }

      let sourcePath;
      if (sourceMode === 'remote') {
        try {
          sourcePath = await fetchOriginal(poster.source, tempRoot, fetchImpl);
          if (!sourcePath) { missing++; continue; }
        } catch (error) {
          failed++;
          log('Season poster fetch failed for ' + poster.id + ': ' + (error && error.message || 'fetch failed'));
          continue;
        }
      } else {
        if (!poster.source.relativePath) { missing++; continue; }
        sourcePath = path.resolve(publicRoot, ...poster.source.relativePath.split('/'));
        if (!sourcePath.startsWith(publicRoot + path.sep)) {
          failed++;
          log('Unsafe Season source path skipped: ' + poster.id);
          continue;
        }
        try { await fs.access(sourcePath); }
        catch (error) {
          if (error && error.code === 'ENOENT') { missing++; continue; }
          throw error;
        }
      }

      const temporary = destination + '.tmp-' + process.pid + '.webp';
      try {
        await convert(sourcePath, temporary);
        const bytes = await fs.readFile(temporary);
        if (!isWebp(bytes)) throw new Error('converter did not produce a WebP image');
        if (bytes.length > MAX_OUTPUT_BYTES) throw new Error('thumbnail exceeds the 1.5 MB output safety limit');
        let same = false;
        try { same = (await fs.readFile(destination)).equals(bytes); }
        catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
        if (same) {
          await fs.unlink(temporary);
          unchanged++;
        } else {
          await fs.rename(temporary, destination);
          generated++;
        }
      } catch (error) {
        await fs.unlink(temporary).catch(() => {});
        if (error && error.code === 'ENOENT') {
          throw new Error('ImageMagick convert is unavailable while generating ' + poster.id);
        }
        failed++;
        log('Season thumbnail skipped for ' + poster.id + ': ' + (error && error.message || 'conversion failed'));
      }
    }

    const summary = { referenced: posters.length, generated, unchanged, missing, failed };
    log('Season/GO Pass detail thumbnails: ' + JSON.stringify(summary));
    return summary;
  } finally {
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateSeasonThumbnails({
    sourceMode: process.argv.includes('--remote') ? 'remote' : 'local',
    skipExisting: process.argv.includes('--skip-existing')
  }).catch(error => {
    console.error(error && error.message || error);
    process.exitCode = 1;
  });
}
