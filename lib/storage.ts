import { S3Client, ListBucketsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

let s3Instance: S3Client | null = null;

export function getStorageClient(): S3Client {
  if (s3Instance) return s3Instance;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Faltan S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY.");
  }

  s3Instance = new S3Client({
    endpoint,
    region,
    forcePathStyle: Boolean(endpoint),
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3Instance;
}

export function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET no está configurado.");
  return bucket;
}

export async function checkStorage(): Promise<{
  ok: boolean;
  skipped?: boolean;
  buckets?: string[];
  error?: string;
}> {
  if (!process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    return { ok: false, skipped: true, error: "Credenciales S3 ausentes" };
  }
  try {
    const s3 = getStorageClient();
    const listed = await s3.send(new ListBucketsCommand({}));
    const buckets = (listed.Buckets ?? []).map((b) => b.Name ?? "");

    const bucket = process.env.S3_BUCKET;
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
    }
    return { ok: true, buckets };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publicUrlFor(key: string): string {
  const base = (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, "");
  if (!base) return key;
  return `${base}/${key.replace(/^\//, "")}`;
}
