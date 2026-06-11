import { mkdir, readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..', '..');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const urlArg = argValue('--url');
const manifestPath = argValue('--manifest');
const outputDir = argValue('--out', path.join(root, 'data', 'research', 'fetches'));

async function urlsFromManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, 'utf8'));
  return (manifest.sources ?? [])
    .filter((source) => source.portal_type === 'html' || source.parser_spec_required)
    .flatMap((source) => [source.source_url, ...(source.known_paths ?? [])])
    .filter(Boolean);
}

async function main() {
  const urls = urlArg ? [urlArg] : manifestPath ? await urlsFromManifest(manifestPath) : [];
  if (urls.length === 0) throw new Error('Use --url=... or --manifest=...');

  await mkdir(outputDir, { recursive: true });
  const reports = [];
  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ParkingUSA URL/PDF research fetcher (local development)',
        Accept: '*/*',
      },
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const contentType = response.headers.get('content-type') ?? 'unknown';
    const ext = contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'bin';
    const fileBase = sha256.slice(0, 16);
    const bodyPath = path.join(outputDir, `${fileBase}.${ext}`);
    const metadataPath = path.join(outputDir, `${fileBase}.metadata.json`);
    await writeFile(bodyPath, buffer);
    const metadata = {
      fetched_at: new Date().toISOString(),
      url,
      status: response.status,
      status_text: response.statusText,
      content_type: contentType,
      byte_length: buffer.length,
      sha256,
      body_path: path.relative(root, bodyPath),
    };
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    reports.push({ url, status: response.status, metadata: path.relative(root, metadataPath), sha256 });
  }
  console.log(JSON.stringify({ fetched: reports.length, reports }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
