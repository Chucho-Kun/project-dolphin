function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env y complétala.`);
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  s3: () => ({
    endpoint: optional("S3_ENDPOINT") || undefined,
    region: optional("S3_REGION", "us-east-1"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    publicUrl: optional("S3_PUBLIC_URL"),
  }),
  siteUrl: () => optional("NEXT_PUBLIC_SITE_URL", "http://localhost:3000"),
};
