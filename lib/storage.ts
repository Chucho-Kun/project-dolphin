import { S3Client, ListBucketsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

let r2Instance: S3Client | null = null;

export function r2Endpoint(): string {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId) throw new Error("R2_ACCOUNT_ID no está configurado.");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getStorageClient(): S3Client {
  if (r2Instance) return r2Instance;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Faltan R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.");
  }

  r2Instance = new S3Client({
    endpoint: r2Endpoint(),
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Instance;
}

export function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET no está configurado.");
  return bucket;
}

export async function checkStorage(): Promise<{
  ok: boolean;
  skipped?: boolean;
  buckets?: string[];
  error?: string;
}> {
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    return { ok: false, skipped: true, error: "Credenciales R2 ausentes" };
  }
  try {
    const s3 = getStorageClient();
    // Los tokens R2 acotados a un bucket no permiten ListBuckets
    // ("Access Denied"). En ese caso se valida directo contra el bucket.
    let buckets: string[] = [];
    try {
      const listed = await s3.send(new ListBucketsCommand({}));
      buckets = (listed.Buckets ?? []).map((b) => b.Name ?? "");
    } catch {
      buckets = [];
    }

    const bucket = process.env.R2_BUCKET;
    if (bucket) {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        return {
          ok: false,
          buckets,
          error: `No se pudo acceder al bucket "${bucket}": ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (buckets.length === 0) buckets = [bucket];
    }
    return { ok: true, buckets };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publicUrlFor(key: string): string {
  const base = (process.env.NEXT_PUBLIC_CDN_URL ?? "").replace(/\/$/, "");
  if (!base) return key;
  return `${base}/${key.replace(/^\//, "")}`;
}
