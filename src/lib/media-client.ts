import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_PIXELS,
  isManagedImageAddress,
  type UploadedImage,
} from "./media-policy";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export async function prepareBodyImage(file: File): Promise<Blob> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type))
    throw new Error("请选择 JPEG、PNG、WebP 或 AVIF 图片。");
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error("原图不能超过 20 MiB。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("图片无法读取，请换一张图片。");
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
    )
      throw new Error("图片分辨率过大，请使用不超过 3200 万像素的图片。");
    const scale = Math.min(
      1,
      2200 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器暂时无法处理图片。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= MAX_IMAGE_INPUT_BYTES) return blob;
    }
    throw new Error("图片压缩后仍然过大，请缩小尺寸后重试。");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function uploadImage(
  blob: Blob,
  purpose: "cover" | "body",
  signal?: AbortSignal,
): Promise<UploadedImage> {
  if (!blob.size || blob.size > MAX_IMAGE_INPUT_BYTES)
    throw new Error("上传图片不能超过 4 MiB。");
  if (signal?.aborted) throw new DOMException("已取消上传", "AbortError");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60000);
  try {
    const response = await fetch(`/api/admin/media?purpose=${purpose}`, {
      method: "POST",
      body: blob,
      credentials: "same-origin",
      headers: { "Content-Type": blob.type },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof data?.error === "string" ? data.error : "上传失败，请稍后重试。",
      );
    if (
      !data ||
      typeof data.url !== "string" ||
      !isManagedImageAddress(data.url) ||
      !Number.isInteger(data.width) ||
      data.width < 1 ||
      !Number.isInteger(data.height) ||
      data.height < 1 ||
      !Number.isInteger(data.size) ||
      data.size < 1 ||
      data.format !== "webp"
    )
      throw new Error("图床返回了无效的图片信息，请重试。");
    return data as UploadedImage;
  } catch (error) {
    if (timedOut) throw new Error("图片上传超时，请重试。");
    if (controller.signal.aborted)
      throw new DOMException("已取消上传", "AbortError");
    if (error instanceof TypeError)
      throw new Error("网络连接失败，请检查网络后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
