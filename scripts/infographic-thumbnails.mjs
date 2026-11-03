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
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export function sourceRelativePath(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = new URL(value, ORIGIN); } catch (_) { return null; }
  if (parsed.origin !== ORIGIN || parsed.search || parsed.hash) return null;
  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); } catch (_) { return null; }
  const prefix = pathname.startsWith('/infographics/') ? 'infographics/' : (pathname.startsWith('/img/ext/') ? 'img/ext/' : null);
  if (!prefix) return null;
  const relative = prefix + pathname.slice(('/' + prefix).length);
  const parts = relative.split('/');
  if (!relative || parts.some(part => !part || part === '.' || part === '..')) return null;
  if (!IMAGE_EXTENSIONS.has(path.posix.extname(relative).toLowerCase())) return null;
  return relative;
}

export function thumbnailRelativePath(value) {
  const relative = sourceRelativePath(value);
  return relative ? path.posix.join('infographic-thumbs', relative + '.webp') : null;
}

export function collectApprovedInfographics(eventInfo, data) {
  const urls = new Set();
  const add = value => { if (sourceRelativePath(value)) urls.add(value); };
  const records = value => Array.isArray(value) ? value : (value && typeof value === 'object' ? Object.values(value) : []);
  for (const source of [eventInfo && eventInfo.events, data && data.events]) {
    for (const record of records(source)) {
      if (!record || typeof record !== 'object') continue;
      for (const image of Array.isArray(record.infographics) ? record.infographics : []) {
        if (image && typeof image === 'object') add(image.url);
      }
      add(record.infographicUrl);
      add(record.infographic);
    }
  }
  return [...urls].sort();
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
    source, '-auto-orient', '-thumbnail', '160x160>', '-strip',
    '-quality', '68', '-define', 'webp:method=6', destination
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

async function fetchOriginal(relative, tempRoot, fetchImpl) {
  const encodedPath = relative.split('/').map(encodeURIComponent).join('/');
  const url = new URL('/' + encodedPath, ORIGIN);
  const response = await fetchImpl(url, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 go-field-notes-thumbnail-generator'
    },
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (response.url && new URL(response.url).origin !== ORIGIN) throw new Error('image response left the approved origin');

  const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/octet-stream'].includes(contentType)) {
    throw new Error('unexpected content type ' + contentType);
  }
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (response.headers?.get?.('content-length') && Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
    throw new Error('source image exceeds the 20 MB safety limit');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('source image size is outside the 20 MB safety limit');
  if (!isSupportedImage(bytes)) throw new Error('source response is not a JPEG, PNG or WebP image');

  const source = path.resolve(tempRoot, ...relative.split('/'));
  if (!source.startsWith(tempRoot + path.sep)) throw new Error('unsafe temporary source path');
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, bytes);
  return source;
}

export async function generateThumbnails({
  root = ROOT,
  convert = convertImage,
  log = console.log,
  sourceMode = 'local',
  skipExisting = false,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!['local', 'remote'].includes(sourceMode)) throw new Error('sourceMode must be local or remote');
  const publicRoot = path.resolve(root, 'public');
  const thumbnailRoot = path.resolve(publicRoot, 'infographic-thumbs');
  const eventInfo = await readJson(path.join(publicRoot, 'event-info.json'));
  const data = await readJson(path.join(publicRoot, 'data.json'));
  const urls = collectApprovedInfographics(eventInfo, data);
  await fs.mkdir(thumbnailRoot, { recursive: true });

  const tempRoot = sourceMode === 'remote' ? await fs.mkdtemp(path.join(os.tmpdir(), 'gofn-infographic-thumbnails-')) : null;
  let generated = 0, unchanged = 0, missing = 0, failed = 0;
  try {
    for (const url of urls) {
      const relative = sourceRelativePath(url);
      if (!relative) continue;
      const source = path.resolve(publicRoot, ...relative.split('/'));
      const destination = path.resolve(publicRoot, thumbnailRelativePath(url));
      if (!source.startsWith(publicRoot + path.sep) || !destination.startsWith(thumbnailRoot + path.sep)) {
        failed++;
        log('Unsafe infographic thumbnail path skipped: ' + url);
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

      let sourcePath = source;
      if (sourceMode === 'remote') {
        try {
          sourcePath = await fetchOriginal(relative, tempRoot, fetchImpl);
          if (!sourcePath) { missing++; continue; }
        } catch (error) {
          failed++;
          log('Infographic source fetch failed for ' + url + ': ' + (error && error.message || 'fetch failed'));
          continue;
        }
      } else {
        try { await fs.access(sourcePath); }
        catch (error) {
          if (error && error.code === 'ENOENT') { missing++; continue; }
          throw error;
        }
      }

      await fs.mkdir(path.dirname(destination), { recursive: true });
      const temporary = destination + '.tmp-' + process.pid + '.webp';
      try {
        await convert(sourcePath, temporary);
        const bytes = await fs.readFile(temporary);
        if (!isWebp(bytes)) throw new Error('converter did not produce a WebP image');
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
          throw new Error('ImageMagick convert is unavailable while generating ' + url);
        }
        failed++;
        log('Infographic thumbnail skipped for ' + url + ': ' + (error && error.message || 'conversion failed'));
      }
    }

    const summary = { referenced: urls.length, generated, unchanged, missing, failed };
    log('Infographic card thumbnails: ' + JSON.stringify(summary));
    return summary;
  } finally {
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateThumbnails({ sourceMode: process.argv.includes('--remote') ? 'remote' : 'local', skipExisting: process.argv.includes('--skip-existing') }).catch(error => {
    console.error(error && error.message || error);
    process.exitCode = 1;
  });
}
