/**
 * scripts/import-assets.ts
 *
 * Fetches, validates, and uploads a plain-text copy of every pre-loaded
 * public-domain script to the configured S3-compatible bucket, then records
 * asset metadata back on the Script row.
 *
 * Usage:
 *   # dry-run — validates content, prints plan, no uploads or DB writes
 *   npx tsx scripts/import-assets.ts --dry-run
 *
 *   # full run (requires STORAGE_* env vars)
 *   npx tsx scripts/import-assets.ts
 *
 *   # re-process scripts that were already uploaded
 *   npx tsx scripts/import-assets.ts --force
 *
 * Flags:
 *   --dry-run   Fetch + validate each script but skip upload and DB update.
 *               Works even when storage is not configured.
 *   --force     Re-upload scripts that already have assetValidatedAt set.
 *
 * Text source:
 *   Plain-text files are fetched from the Gutenberg content cache:
 *     https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt
 *   The ebook ID is derived from the sourceUrl already stored on the Script row.
 *
 * Bucket key format:  scripts/gutenberg-<ebookId>.txt
 */

import 'dotenv/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import {
  isStorageConfigured,
  missingStorageVars,
  uploadObject,
  buildAssetUrl,
} from '../src/lib/storage';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Minimum bytes a fetched file must contain to be considered valid.
const MIN_CONTENT_BYTES = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract numeric Gutenberg ebook ID from a Gutenberg URL, e.g. "1513". */
function extractEbookId(sourceUrl: string): string | null {
  const match = sourceUrl.match(/gutenberg\.org\/(?:ebooks|files)\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Build the Gutenberg plain-text cache URL for a given ebook ID.
 * The cache endpoint is the most stable and does not require crawling HTML.
 */
function gutenbergTextUrl(ebookId: string): string {
  return `https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`;
}

/** Fetch plain text from a URL with a timeout. Returns raw text string. */
async function fetchText(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Result {
  title: string;
  status: 'uploaded' | 'dry-run' | 'skipped' | 'failed';
  note: string;
}

async function main(): Promise<void> {
  console.log('=== Rehearse: import-assets ===');
  console.log(`Mode   : ${DRY_RUN ? 'DRY RUN (no uploads)' : 'LIVE'}`);
  console.log(`Force  : ${FORCE ? 'yes (re-process already-uploaded scripts)' : 'no'}`);
  console.log('');

  // Guard: in live mode storage must be configured.
  if (!DRY_RUN && !isStorageConfigured()) {
    const missing = missingStorageVars();
    console.error('ERROR: Storage is not configured. Cannot upload without credentials.\n');
    console.error('Missing environment variables:');
    missing.forEach((v) => console.error(`  ${v}`));
    console.error('\nSet these in your .env file — see .env.example for documentation.');
    console.error('To validate content without uploading, re-run with --dry-run.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Storage configured:', isStorageConfigured() ? 'yes' : 'no (dry-run only)');
  } else {
    console.log('Storage bucket    :', process.env.STORAGE_BUCKET);
    console.log('Storage endpoint  :', process.env.STORAGE_ENDPOINT ?? '(AWS S3 default)');
  }
  console.log('');

  const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:./dev.db' });
  const prisma = new PrismaClient({ adapter });
  const scripts = await prisma.script.findMany({ orderBy: { title: 'asc' } });
  console.log(`Found ${scripts.length} scripts in the database.\n`);

  const results: Result[] = [];

  for (const script of scripts) {
    // Skip scripts without a Gutenberg sourceUrl.
    if (!script.sourceUrl) {
      results.push({ title: script.title, status: 'skipped', note: 'no sourceUrl' });
      continue;
    }

    const ebookId = extractEbookId(script.sourceUrl);
    if (!ebookId) {
      results.push({
        title: script.title,
        status: 'skipped',
        note: `sourceUrl "${script.sourceUrl}" is not a recognised Gutenberg URL`,
      });
      continue;
    }

    // Skip already-processed scripts unless --force.
    if (script.assetValidatedAt && !FORCE) {
      results.push({
        title: script.title,
        status: 'skipped',
        note: `already uploaded at ${script.assetValidatedAt.toISOString()} (use --force to re-process)`,
      });
      continue;
    }

    const textUrl = gutenbergTextUrl(ebookId);
    const objectKey = `scripts/gutenberg-${ebookId}.txt`;

    try {
      // Fetch
      process.stdout.write(`[${script.title}] fetching ${textUrl} … `);
      const text = await fetchText(textUrl);
      const byteSize = Buffer.byteLength(text, 'utf8');

      // Validate
      if (byteSize < MIN_CONTENT_BYTES) {
        throw new Error(`content too short (${byteSize} bytes — minimum is ${MIN_CONTENT_BYTES})`);
      }
      // Sanity check: the file should look like plain text, not binary/HTML.
      if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
        throw new Error('response is HTML, not plain text — Gutenberg may have redirected');
      }

      process.stdout.write(`${byteSize.toLocaleString()} bytes\n`);

      const mimeType = 'text/plain; charset=utf-8';

      if (DRY_RUN) {
        console.log(
          `  [DRY RUN] would upload → ${objectKey} (${byteSize.toLocaleString()} bytes)`
        );
        results.push({ title: script.title, status: 'dry-run', note: `${byteSize} bytes, key: ${objectKey}` });
        continue;
      }

      // Upload
      await uploadObject({ key: objectKey, body: text, contentType: mimeType });
      const assetUrl = buildAssetUrl(objectKey);

      // Record metadata on the Script row.
      await prisma.script.update({
        where: { id: script.id },
        data: {
          assetUrl,
          assetObjectKey: objectKey,
          assetFormat: 'plain-text',
          assetMimeType: mimeType,
          assetByteSize: byteSize,
          assetSourceUrl: textUrl,
          assetValidatedAt: new Date(),
        },
      });

      console.log(`  → uploaded: ${assetUrl}`);
      results.push({ title: script.title, status: 'uploaded', note: assetUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [FAIL] ${msg}`);
      results.push({ title: script.title, status: 'failed', note: msg });
    }
  }

  await prisma.$disconnect();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const counts = {
    uploaded: results.filter((r) => r.status === 'uploaded').length,
    'dry-run': results.filter((r) => r.status === 'dry-run').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };

  console.log('\n=== Summary ===');
  if (DRY_RUN) {
    console.log(`  Would upload : ${counts['dry-run']}`);
  } else {
    console.log(`  Uploaded     : ${counts.uploaded}`);
  }
  console.log(`  Skipped      : ${counts.skipped}`);
  console.log(`  Failed       : ${counts.failed}`);

  if (counts.failed > 0) {
    console.log('\nFailed scripts:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`  - ${r.title}: ${r.note}`));
  }

  if (!DRY_RUN && !isStorageConfigured()) {
    // Should never reach here due to the guard above, but belt-and-suspenders.
    console.log('\nBLOCKER: Storage credentials are required for live uploads.');
    console.log('See REMAINING_BLOCKERS below.');
  }

  console.log('\n=== REMAINING BLOCKERS for full completion ===');
  console.log(
    '1. Cloud storage credentials must be configured in .env (see .env.example):'
  );
  console.log('     STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY_ID,');
  console.log('     STORAGE_SECRET_ACCESS_KEY');
  console.log(
    '   Optionally: STORAGE_ENDPOINT (for R2/B2/MinIO), STORAGE_PUBLIC_BASE_URL'
  );
  console.log(
    '2. Once creds are set, run:  npx tsx scripts/import-assets.ts'
  );
  console.log(
    '3. Verify uploads in your bucket; Script rows will have assetUrl + assetValidatedAt set.'
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
