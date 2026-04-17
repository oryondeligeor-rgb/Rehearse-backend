/**
 * Provider-agnostic S3-compatible cloud storage layer.
 *
 * Works with AWS S3, Cloudflare R2, Backblaze B2 (S3-compatible),
 * and MinIO by toggling the STORAGE_ENDPOINT env var.
 *
 * Required env vars (all prefixed STORAGE_):
 *   STORAGE_BUCKET            bucket name
 *   STORAGE_REGION            region ("auto" is fine for R2)
 *   STORAGE_ACCESS_KEY_ID     access key / key ID
 *   STORAGE_SECRET_ACCESS_KEY secret access key
 *
 * Optional:
 *   STORAGE_ENDPOINT          custom S3-compatible endpoint URL
 *                             (omit for native AWS S3)
 *   STORAGE_PUBLIC_BASE_URL   CDN or public URL prefix for building
 *                             asset URLs (e.g. "https://cdn.example.com")
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.STORAGE_BUCKET;
const REGION = process.env.STORAGE_REGION ?? 'us-east-1';
const ENDPOINT = process.env.STORAGE_ENDPOINT;
const ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY;
const PUBLIC_BASE_URL = process.env.STORAGE_PUBLIC_BASE_URL;

/**
 * Returns true only when all required storage env vars are set.
 * Use this to gate uploads in the import script.
 */
export function isStorageConfigured(): boolean {
  return !!(BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

/** Returns a human-readable list of which vars are missing. */
export function missingStorageVars(): string[] {
  const missing: string[] = [];
  if (!BUCKET) missing.push('STORAGE_BUCKET');
  if (!ACCESS_KEY_ID) missing.push('STORAGE_ACCESS_KEY_ID');
  if (!SECRET_ACCESS_KEY) missing.push('STORAGE_SECRET_ACCESS_KEY');
  return missing;
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
      credentials: {
        accessKeyId: ACCESS_KEY_ID!,
        secretAccessKey: SECRET_ACCESS_KEY!,
      },
      // forcePathStyle is required for non-AWS endpoints (R2, B2, MinIO)
      forcePathStyle: !!ENDPOINT,
    });
  }
  return _client;
}

export interface UploadOptions {
  key: string;
  body: string | Buffer;
  contentType: string;
}

/**
 * Upload an object to the configured bucket.
 * Throws if storage is not configured or the upload fails.
 */
export async function uploadObject(opts: UploadOptions): Promise<void> {
  if (!isStorageConfigured()) {
    throw new Error(
      `Storage not configured. Missing: ${missingStorageVars().join(', ')}`
    );
  }
  const cmd = new PutObjectCommand({
    Bucket: BUCKET!,
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
  });
  await getClient().send(cmd);
}

/**
 * Derive the public asset URL for a stored object key.
 * Resolution order:
 *   1. STORAGE_PUBLIC_BASE_URL/<key>   (explicit CDN / custom domain)
 *   2. STORAGE_ENDPOINT/<bucket>/<key>  (custom S3-compatible endpoint)
 *   3. https://<bucket>.s3.<region>.amazonaws.com/<key>  (native AWS S3)
 */
export function buildAssetUrl(objectKey: string): string {
  if (PUBLIC_BASE_URL) {
    return `${PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey}`;
  }
  if (ENDPOINT) {
    return `${ENDPOINT.replace(/\/$/, '')}/${BUCKET}/${objectKey}`;
  }
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${objectKey}`;
}
