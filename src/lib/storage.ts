import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// S3-compatible object storage client. Points at MinIO in dev/self-hosted
// deployments, or a real S3 bucket in af-south-1 (Cape Town) in production
// for data residency.
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "af-south-1",
  forcePathStyle: true, // required for MinIO
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || process.env.S3_ACCESS_KEY || "",
    secretAccessKey:
      process.env.MINIO_ROOT_PASSWORD || process.env.S3_SECRET_KEY || "",
  },
});

const BUCKET = process.env.S3_BUCKET || "blendsign-documents";

export async function presignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

export async function presignedDownloadUrl(key: string) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 300 });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const res = await s3.send(command);
  const chunks: Uint8Array[] = [];
  // @ts-expect-error - Body is a stream in Node runtime
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function putObjectBuffer(
  key: string,
  buffer: Buffer,
  contentType = "application/pdf"
) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export { BUCKET };
