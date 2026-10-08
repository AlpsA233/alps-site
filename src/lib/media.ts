import "server-only";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_OUTPUT_BYTES,
  MAX_IMAGE_PIXELS,
  normalizeMediaPublicBase,
  type ImageMimeType,
  type MediaPurpose,
  type UploadedImage,
} from "./media-policy";

export const MEDIA_UPLOAD_MAX_ATTEMPTS = 30;
export const MEDIA_UPLOAD_WINDOW_MS = 10 * 60 * 1000;

type MediaEnvironment = Readonly<Record<string, string | undefined>>;
type MediaConfiguration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
};

export class MediaUploadError extends Error {
  constructor(
    public readonly status: 400 | 413 | 503,
    message: string,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

function mediaConfiguration(env: MediaEnvironment): MediaConfiguration | null {
  const accountId = env.R2_ACCOUNT_ID?.trim() || "";
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const bucket = env.R2_BUCKET?.trim() || "";
  const publicBase = normalizeMediaPublicBase(env.MEDIA_PUBLIC_BASE_URL);
  if (
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !/^[a-z0-9_-]{1,128}$/i.test(accessKeyId) ||
    !secretAccessKey ||
    secretAccessKey.length > 1024 ||
    /[\s\u0000-\u001f\u007f]/.test(secretAccessKey) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !publicBase
  )
    return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

export function isMediaConfigured(
  env: MediaEnvironment = process.env,
): boolean {
  return mediaConfiguration(env) !== null;
}

export function getMediaPublicBase(
  env: MediaEnvironment = process.env,
): string {
  return mediaConfiguration(env)?.publicBase || "";
}

export async function claimMediaUploadAttempt(
  database: Pick<Client, "execute">,
  now = Date.now(),
): Promise<boolean> {
  const result = await database.execute({
    sql: `INSERT INTO media_upload_attempts (id,count,started_at) VALUES (1,1,$now)
      ON CONFLICT(id) DO UPDATE SET
        count=CASE
          WHEN excluded.started_at-media_upload_attempts.started_at >= $window THEN 1
          ELSE media_upload_attempts.count+1 END,
        started_at=CASE
          WHEN excluded.started_at-media_upload_attempts.started_at >= $window THEN excluded.started_at
          ELSE media_upload_attempts.started_at END
      WHERE excluded.started_at-media_upload_attempts.started_at >= $window
        OR media_upload_attempts.count < $maximum
      RETURNING count`,
    args: {
      now,
      window: MEDIA_UPLOAD_WINDOW_MS,
      maximum: MEDIA_UPLOAD_MAX_ATTEMPTS,
    },
  });
  return result.rows.length === 1;
}

export async function readImageBody(request: Request): Promise<Buffer> {
  const declaredSize = request.headers.get("content-length");
  if (declaredSize !== null) {
    if (!/^\d+$/.test(declaredSize))
      throw new MediaUploadError(400, "图片请求无效，请重新上传。");
    if (Number(declaredSize) > MAX_IMAGE_INPUT_BYTES)
      throw new MediaUploadError(413, "图片不能超过 4 MiB，请先缩小图片。");
  }
  if (!request.body) throw new MediaUploadError(400, "请选择需要上传的图片。");
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_INPUT_BYTES) {
        await reader.cancel().catch(() => {});
        throw new MediaUploadError(413, "图片不能超过 4 MiB，请先缩小图片。");
      }
      chunks.push(Buffer.from(value));
    }
    if (size === 0) throw new MediaUploadError(400, "请选择需要上传的图片。");
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError(400, "图片读取失败，请重新上传。");
  } finally {
    reader.releaseLock();
  }
}

function inspectImageHeader(input: Buffer): {
  mime: ImageMimeType | null;
  animated: boolean;
} {
  if (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    let animated = false;
    for (let offset = 8; offset + 12 <= input.length;) {
      const length = input.readUInt32BE(offset);
      const type = input.toString("ascii", offset + 4, offset + 8);
      if (type === "acTL") animated = true;
      if (length > input.length - offset - 12) break;
      offset += length + 12;
    }
    return { mime: "image/png", animated };
  }
  if (input[0] === 255 && input[1] === 216 && input[2] === 255)
    return { mime: "image/jpeg", animated: false };
  if (
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP"
  ) {
    let animated = false;
    for (let offset = 12; offset + 8 <= input.length;) {
      const type = input.toString("ascii", offset, offset + 4);
      const length = input.readUInt32LE(offset + 4);
      if (
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" && length > 0 && (input[offset + 8] & 2) !== 0)
      )
        animated = true;
      if (length > input.length - offset - 8) break;
      offset += length + 8 + (length % 2);
    }
    return { mime: "image/webp", animated };
  }
  if (input.length >= 16 && input.toString("ascii", 4, 8) === "ftyp") {
    const length = input.readUInt32BE(0);
    if (length >= 16 && length <= input.length) {
      const brands = [input.toString("ascii", 8, 12)];
      for (let offset = 16; offset + 4 <= length; offset += 4)
        brands.push(input.toString("ascii", offset, offset + 4));
      if (brands.includes("avif") || brands.includes("avis"))
        return { mime: "image/avif", animated: brands.includes("avis") };
    }
  }
  return { mime: null, animated: false };
}

export async function prepareImage(
  input: Buffer,
  mime: ImageMimeType,
  purpose: MediaPurpose,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (!input.length) throw new MediaUploadError(400, "请选择需要上传的图片。");
  if (input.length > MAX_IMAGE_INPUT_BYTES)
    throw new MediaUploadError(413, "图片不能超过 4 MiB，请先缩小图片。");
  const header = inspectImageHeader(input);
  if (header.mime !== mime)
    throw new MediaUploadError(
      400,
      "图片格式与文件内容不一致，请重新选择图片。",
    );
  if (header.animated)
    throw new MediaUploadError(400, "暂不支持动画图片，请选择静态图片。");
  try {
    const decoder = sharp(input, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: "warning",
    });
    const metadata = await decoder.metadata();
    const decodedMime =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : metadata.format === "heif" && metadata.compression === "av1"
              ? "image/avif"
              : null;
    if (decodedMime !== mime)
      throw new MediaUploadError(
        400,
        "图片格式与文件内容不一致，请重新选择图片。",
      );
    if ((metadata.pages || 1) > 1)
      throw new MediaUploadError(400, "暂不支持动画图片，请选择静态图片。");
    if (!metadata.width || !metadata.height)
      throw new MediaUploadError(400, "无法识别图片，请重新选择图片。");
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS)
      throw new MediaUploadError(413, "图片像素过多，请先缩小图片。");
    const maximum = purpose === "cover" ? 1800 : 2200;
    for (const quality of [82, 70, 58]) {
      const { data, info } = await decoder
        .clone()
        .rotate()
        .resize(maximum, maximum, { fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      // Sharp strips source metadata by default; do not attach EXIF or ICC here.
      if (data.length <= MAX_IMAGE_OUTPUT_BYTES)
        return { data, width: info.width, height: info.height };
    }
    throw new MediaUploadError(413, "图片压缩后仍然过大，请先缩小图片。");
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new MediaUploadError(413, "图片像素过多，请先缩小图片。");
    throw new MediaUploadError(400, "图片损坏或格式不支持，请重新选择图片。");
  }
}

type UploadOptions = {
  environment?: MediaEnvironment;
  putObject?: (command: PutObjectCommand) => Promise<unknown>;
};

export async function uploadMedia(
  input: Buffer,
  mime: ImageMimeType,
  purpose: MediaPurpose,
  options: UploadOptions = {},
): Promise<UploadedImage> {
  const config = mediaConfiguration(options.environment || process.env);
  if (!config)
    throw new MediaUploadError(503, "图片上传尚未配置，请完成对象存储设置。");
  const image = await prepareImage(input, mime, purpose);
  const key = `media/${randomUUID()}.webp`;
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: image.data,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  });
  let client: S3Client | undefined;
  try {
    if (options.putObject) {
      await options.putObject(command);
    } else {
      client = new S3Client({
        region: "auto",
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        maxAttempts: 2,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
      await client.send(command, { abortSignal: AbortSignal.timeout(15_000) });
    }
  } catch {
    throw new MediaUploadError(503, "图片存储暂时不可用，请稍后重试。");
  } finally {
    client?.destroy();
  }
  return {
    url: `${config.publicBase}/${key}`,
    width: image.width,
    height: image.height,
    size: image.data.length,
    format: "webp",
  };
}

type MediaUploadDependencies = {
  isAdmin: () => Promise<boolean>;
  claimAttempt: () => Promise<boolean>;
  isConfigured: () => boolean;
  upload: (
    input: Buffer,
    mime: ImageMimeType,
    purpose: MediaPurpose,
  ) => Promise<UploadedImage>;
};

function response(body: UploadedImage | { error: string }, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function effectiveUploadOrigin(request: Request): string {
  try {
    const url = new URL(request.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const host = request.headers.get("host");
    if (host === null) return url.origin;

    // NextRequest normalizes loopback URLs to localhost, and a Node server's
    // request URL may use its listening address behind a reverse proxy. Host
    // carries the browser's authority; forwarded-host is deliberately ignored.
    const authority =
      /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/i.exec(host);
    if (!authority || (authority[2] && Number(authority[2]) > 65535)) return "";
    const hostname = authority[1].toLowerCase();
    if (
      !hostname.startsWith("[") &&
      (hostname.length > 253 ||
        hostname.split(".").some((label) => label.length > 63) ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.?$/i.test(
          hostname,
        ))
    )
      return "";
    const browserUrl = new URL(`${url.protocol}//${host}`);
    // Reject URL-parser aliases such as abbreviated/hexadecimal IPv4 and
    // malformed IPv6 rather than broadening the set of accepted origins.
    if (browserUrl.hostname !== hostname) return "";
    return browserUrl.origin;
  } catch {
    return "";
  }
}

// The handler seam uses the same Request/Response path in production and tests.
// All request bodies remain unread until origin, session and quota checks pass.
export function createMediaUploadHandler(
  dependencies: MediaUploadDependencies,
) {
  return async function handleMediaUpload(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    if (!origin || origin !== effectiveUploadOrigin(request))
      return response({ error: "上传请求来源无效，请从本站后台重试。" }, 403);
    try {
      if (!(await dependencies.isAdmin()))
        return response({ error: "登录已失效，请重新登录后台。" }, 401);
      if (!(await dependencies.claimAttempt()))
        return response({ error: "上传次数较多，请在 10 分钟后重试。" }, 429);
      if (!dependencies.isConfigured())
        return response(
          { error: "图片上传尚未配置，请完成对象存储设置。" },
          503,
        );
      const purpose = new URL(request.url).searchParams.get("purpose");
      if (purpose !== "cover" && purpose !== "body")
        return response({ error: "请选择有效的图片用途。" }, 400);
      const mime = request.headers.get("content-type")?.toLowerCase().trim();
      if (!IMAGE_MIME_TYPES.includes(mime as ImageMimeType))
        return response(
          { error: "仅支持 JPEG、PNG、WebP 或 AVIF 静态图片。" },
          400,
        );
      const encoding = request.headers.get("content-encoding");
      if (encoding && encoding.toLowerCase() !== "identity")
        return response({ error: "图片请求无效，请直接上传图片文件。" }, 400);
      const input = await readImageBody(request);
      return response(
        await dependencies.upload(input, mime as ImageMimeType, purpose),
        200,
      );
    } catch (error) {
      if (error instanceof MediaUploadError)
        return response({ error: error.message }, error.status);
      return response({ error: "图片上传暂时不可用，请稍后重试。" }, 503);
    }
  };
}
