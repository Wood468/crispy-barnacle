#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://pogo.michaelpuff.com';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function sourceRelativePath(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try { parsed = new URL(value, ORIGIN); } catch (_) { return null; }
  if (parsed.origin !== ORIGIN || parsed.search || parsed.hash) return null;
  let pathname;
  try { pathname = decodeURIComponent(parsed.pathname); } catch (_) { return null; }
  if (!pathname.startsWith('/infographics/')) return null;
  const relative = pathname.slice('/infographics/'.length);
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

export async function generateThumbnails({ root = ROOT, convert = convertImage, log = console.log } = {}) {
  const publicRoot = path.resolve(root, 'public');
  const sourceRoot = path.resolve(publicRoot, 'infographics');
  const thumbnailRoot = path.resolve(publicRoot, 'infographic-thumbs');
  const eventInfo = await readJson(path.join(publicRoot, 'event-info.json'));
  const data = await readJson(path.join(publicRoot, 'data.json'));
  const urls = collectApprovedInfographics(eventInfo, data);
  await fs.mkdir(thumbnailRoot, { recursive: true });

  let generated = 0, unchanged = 0, missing = 0, failed = 0;
  for (const url of urls) {
    const relative = sourceRelativePath(url);
    if (!relative) continue;
    const source = path.resolve(sourceRoot, ...relative.split('/'));
    const destination = path.resolve(publicRoot, thumbnailRelativePath(url));
    if (!source.startsWith(sourceRoot + path.sep) || !destination.startsWith(thumbnailRoot + path.sep)) {
      failed++;
      log('Unsafe infographic thumbnail path skipped: ' + url);
      continue;
    }
    try { await fs.access(source); }
    catch (error) {
      if (error && error.code === 'ENOENT') { missing++; continue; }
      throw error;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = destination + '.tmp-' + process.pid + '.webp';
    try {
      await convert(source, temporary);
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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateThumbnails().catch(error => {
    console.error(error && error.message || error);
    process.exitCode = 1;
  });
}
