import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

const GEOFABRIK_REGIONS = {
  florida: 'https://download.geofabrik.de/north-america/us/florida-latest.osm.pbf',
};

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function requestHead(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(requestHead(new URL(res.headers.location, url).toString()));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HEAD ${url} failed with status ${res.statusCode}`));
        return;
      }
      resolve({
        url,
        contentLength: Number(res.headers['content-length']),
        lastModified: res.headers['last-modified'] ?? null,
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function download(url, outputPath) {
  const tempPath = `${outputPath}.part`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(download(new URL(res.headers.location, url).toString(), outputPath));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${url} failed with status ${res.statusCode}`));
        return;
      }

      const file = createWriteStream(tempPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(async () => {
          try {
            await rename(tempPath, outputPath);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      file.on('error', reject);
    });
    req.on('error', reject);
  }).catch(async (error) => {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup failures after a failed download.
    }
    throw error;
  });
}

async function main() {
  const region = argValue('--region', 'florida');
  const url = argValue('--url', GEOFABRIK_REGIONS[region]);
  if (!url) {
    throw new Error(`Unknown Geofabrik region "${region}". Pass --url=https://... for a custom extract.`);
  }

  const outputPath = path.resolve(
    root,
    argValue('--output', path.join('data', 'osm', `${region}-latest.osm.pbf`))
  );
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  await mkdir(path.dirname(outputPath), { recursive: true });
  const info = await requestHead(url);
  const summary = {
    region,
    url,
    output: path.relative(root, outputPath),
    size: formatBytes(info.contentLength),
    lastModified: info.lastModified,
    dryRun,
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!force && (await exists(outputPath))) {
    const existing = await stat(outputPath);
    console.log(
      JSON.stringify(
        {
          ...summary,
          skipped: true,
          existingSize: formatBytes(existing.size),
          note: 'File already exists. Pass --force to replace it.',
        },
        null,
        2
      )
    );
    return;
  }

  await download(url, outputPath);
  const downloaded = await stat(outputPath);
  console.log(
    JSON.stringify(
      {
        ...summary,
        downloaded: true,
        downloadedSize: formatBytes(downloaded.size),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
