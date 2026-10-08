"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  ImagePlus,
  LoaderCircle,
  Move,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { uploadImage } from "@/lib/media-client";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_PIXELS,
  type UploadedImage,
} from "@/lib/media-policy";
import {
  getCropGeometry,
  getCropOutputSize,
  MAX_CROP_ZOOM,
  moveCropCenter,
  type CropGeometry,
  type CropPoint,
} from "@/lib/image-crop";
import "./cover-upload.css";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const ASPECTS = [
  { label: "3:2", width: 3, height: 2, note: "列表默认" },
  { label: "16:9", width: 16, height: 9, note: "横向" },
  { label: "1:1", width: 1, height: 1, note: "方形" },
  { label: "4:5", width: 4, height: 5, note: "竖向" },
] as const;

type SourceImage = {
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
};
type CropState = { zoom: number; center: CropPoint };
const initialCrop = (): CropState => ({ zoom: 1, center: { x: 0.5, y: 0.5 } });

function abortError() {
  return new DOMException("已取消", "AbortError");
}

async function readSource(
  file: File,
  signal: AbortSignal,
): Promise<SourceImage> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("请选择 JPEG、PNG、WebP 或 AVIF 图片，不支持 SVG 和 GIF。");
  }
  if (!file.size || file.size > MAX_SOURCE_BYTES) {
    throw new Error("请选择不超过 20 MiB 的图片。");
  }
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (signal.aborted) throw abortError();
  const textAt = (start: number, length: number) =>
    String.fromCharCode(...header.slice(start, start + length));
  const matchesFormat =
    (file.type === "image/jpeg" &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff) ||
    (file.type === "image/png" && textAt(0, 8) === "\x89PNG\r\n\x1a\n") ||
    (file.type === "image/webp" &&
      textAt(0, 4) === "RIFF" &&
      textAt(8, 4) === "WEBP") ||
    (file.type === "image/avif" &&
      textAt(4, 4) === "ftyp" &&
      [8, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60].some(
        (offset) => textAt(offset, 4) === "avif",
      ));
  if (!matchesFormat) {
    throw new Error(
      "图片内容与文件格式不匹配，请重新导出为 JPEG、PNG、WebP 或 AVIF。",
    );
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      const cleanup = () => {
        element.onload = null;
        element.onerror = null;
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        cleanup();
        element.src = "";
        reject(abortError());
      };
      element.onload = () => {
        cleanup();
        resolve(element);
      };
      element.onerror = () => {
        cleanup();
        reject(new Error("图片无法读取，请换一张图片或重新导出后重试。"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else element.src = url;
    });
    if (signal.aborted) throw abortError();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
      throw new Error("图片分辨率不能超过 3200 万像素，请缩小原图后重试。");
    }
    return { name: file.name, url, image, width, height };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function exportCrop(
  source: SourceImage,
  geometry: CropGeometry,
  aspect: (typeof ASPECTS)[number],
  signal: AbortSignal,
): Promise<Blob> {
  const output = getCropOutputSize(geometry.source, aspect);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器暂时无法处理图片，请换一个浏览器重试。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const crop = geometry.source;
  context.drawImage(
    source.image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  );
  try {
    for (const quality of [0.92, 0.86, 0.82]) {
      if (signal.aborted) throw abortError();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (signal.aborted) throw abortError();
      if (!blob || blob.type !== "image/webp") {
        throw new Error("浏览器无法导出 WebP 图片，请换一个浏览器重试。");
      }
      if (blob.size && blob.size <= MAX_IMAGE_INPUT_BYTES) return blob;
    }
    throw new Error("裁剪后的图片仍超过 4 MiB，请换一张图片后重试。");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function CoverUpload({
  disabled = false,
  onUploaded,
  onBusyChange,
}: {
  disabled?: boolean;
  onUploaded: (image: UploadedImage) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<SourceImage | null>(null);
  const operationRef = useRef<AbortController | null>(null);
  const revisionRef = useRef(0);
  const mountedRef = useRef(true);
  const busyCallbackRef = useRef(onBusyChange);
  busyCallbackRef.current = onBusyChange;
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [aspectIndex, setAspectIndex] = useState(0);
  const [crop, setCrop] = useState<CropState>(initialCrop);
  const [viewportWidth, setViewportWidth] = useState(600);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const busy = choosing || preparing || source !== null;
  const aspect = ASPECTS[aspectIndex];
  const viewport = {
    width: viewportWidth,
    height: (viewportWidth * aspect.height) / aspect.width,
  };
  const geometry = source
    ? getCropGeometry(source, viewport, crop.zoom, crop.center)
    : null;

  useEffect(() => {
    busyCallbackRef.current?.(busy);
  }, [busy]);

  useEffect(() => {
    mountedRef.current = true;
    const input = fileRef.current;
    const cancelPicker = () => setChoosing(false);
    input?.addEventListener("cancel", cancelPicker);
    return () => {
      mountedRef.current = false;
      revisionRef.current++;
      operationRef.current?.abort();
      if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
      sourceRef.current = null;
      input?.removeEventListener("cancel", cancelPicker);
      busyCallbackRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    if (!source) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    viewportRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [source]);

  useEffect(() => {
    if (!source) return;
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setViewportWidth(width);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [source, aspectIndex]);

  function closeCrop() {
    revisionRef.current++;
    operationRef.current?.abort();
    operationRef.current = null;
    dragRef.current = null;
    if (sourceRef.current) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = null;
    dialogRef.current?.close();
    setSource(null);
    setChoosing(false);
    setPreparing(false);
    setUploading(false);
    setDragging(false);
    setCrop(initialCrop());
    setAspectIndex(0);
    setError("");
    requestAnimationFrame(() => {
      if (mountedRef.current)
        triggerRef.current?.focus({ preventScroll: true });
    });
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setChoosing(false);
    if (!file) return;
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    const revision = ++revisionRef.current;
    setPreparing(true);
    setError("");
    setStatus("");
    try {
      const nextSource = await readSource(file, controller.signal);
      if (!mountedRef.current || revision !== revisionRef.current) {
        URL.revokeObjectURL(nextSource.url);
        return;
      }
      sourceRef.current = nextSource;
      setCrop(initialCrop());
      setAspectIndex(0);
      setSource(nextSource);
    } catch (cause) {
      if (
        mountedRef.current &&
        revision === revisionRef.current &&
        !controller.signal.aborted
      ) {
        setError(
          cause instanceof Error ? cause.message : "图片读取失败，请重试。",
        );
      }
    } finally {
      if (mountedRef.current && revision === revisionRef.current) {
        operationRef.current = null;
        setPreparing(false);
      }
    }
  }

  function adjustCrop(next: CropState, nextAspect = aspect) {
    if (!source) return;
    const bounds = getCropGeometry(
      source,
      {
        width: viewportWidth,
        height: (viewportWidth * nextAspect.height) / nextAspect.width,
      },
      next.zoom,
      next.center,
    );
    setCrop({ zoom: bounds.zoom, center: bounds.center });
    setError("");
  }

  function moveImage(delta: CropPoint) {
    if (!source || uploading) return;
    setCrop((previous) => {
      const bounds = getCropGeometry(
        source,
        viewport,
        previous.zoom,
        previous.center,
      );
      return { zoom: bounds.zoom, center: moveCropCenter(bounds, delta) };
    });
    setError("");
  }

  function pointerStart(event: PointerEvent<HTMLDivElement>) {
    if (uploading || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveImage({ x: event.clientX - drag.x, y: event.clientY - drag.y });
    dragRef.current = { id: drag.id, x: event.clientX, y: event.clientY };
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10;
    const directions: Record<string, CropPoint> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    moveImage(delta);
  }

  async function confirmCrop() {
    if (!source || !geometry || uploading || disabled) return;
    const controller = new AbortController();
    operationRef.current = controller;
    const revision = ++revisionRef.current;
    setUploading(true);
    setError("");
    try {
      const blob = await exportCrop(
        source,
        geometry,
        aspect,
        controller.signal,
      );
      if (controller.signal.aborted || revision !== revisionRef.current) return;
      const uploaded = await uploadImage(blob, "cover", controller.signal);
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        revision !== revisionRef.current
      )
        return;
      onUploaded(uploaded);
      closeCrop();
      setStatus("封面已上传，保存内容后生效。");
    } catch (cause) {
      if (
        mountedRef.current &&
        revision === revisionRef.current &&
        !controller.signal.aborted
      ) {
        setError(
          cause instanceof Error ? cause.message : "上传失败，请稍后重试。",
        );
      }
    } finally {
      if (mountedRef.current && revision === revisionRef.current) {
        operationRef.current = null;
        setUploading(false);
      }
    }
  }

  return (
    <div className="cover-upload">
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_MIME_TYPES.join(",")}
        disabled={disabled || preparing || source !== null}
        onChange={selectFile}
        hidden
        aria-label="选择封面图片"
      />
      <button
        ref={triggerRef}
        type="button"
        className="cover-upload-trigger"
        disabled={disabled || busy}
        onClick={() => {
          setChoosing(true);
          setError("");
          fileRef.current?.click();
        }}
      >
        {preparing ? (
          <LoaderCircle size={17} className="cover-upload-spinner" />
        ) : (
          <ImagePlus size={17} />
        )}
        {preparing ? "正在读取图片…" : "上传并裁剪封面"}
      </button>
      <p className="cover-upload-hint">
        JPEG / PNG / WebP / AVIF · 原图 ≤ 20 MiB
      </p>
      {!source && error && (
        <p className="cover-upload-message cover-upload-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="cover-upload-message cover-upload-success" role="status">
          {status}
        </p>
      )}
      {source && geometry && (
        <dialog
          ref={dialogRef}
          className="cover-crop-dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          onCancel={(event) => {
            event.preventDefault();
            closeCrop();
          }}
        >
          <div className="cover-crop-header">
            <div>
              <p className="cover-crop-eyebrow">COVER STUDIO</p>
              <h2 id={`${id}-title`}>让画面刚刚好</h2>
              <p id={`${id}-description`}>
                选一个比例，拖动画面，把主体留在你喜欢的位置。
              </p>
            </div>
            <button
              type="button"
              className="cover-crop-close"
              onClick={closeCrop}
              aria-label="取消封面裁剪"
            >
              <X size={21} />
            </button>
          </div>
          <div className="cover-crop-body">
            <div className="cover-crop-preview">
              <div
                ref={viewportRef}
                className={`cover-crop-viewport${dragging ? " is-dragging" : ""}`}
                style={{
                  aspectRatio: `${aspect.width} / ${aspect.height}`,
                  maxWidth: `${(460 * aspect.width) / aspect.height}px`,
                }}
                role="group"
                aria-label="封面裁剪预览"
                aria-describedby={`${id}-keyboard`}
                aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
                tabIndex={0}
                onPointerDown={pointerStart}
                onPointerMove={pointerMove}
                onPointerUp={pointerEnd}
                onPointerCancel={pointerEnd}
                onLostPointerCapture={() => {
                  dragRef.current = null;
                  setDragging(false);
                }}
                onKeyDown={moveWithKeyboard}
              >
                {/* The browser-decoded object URL is used for the local, movable crop preview. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={source.url}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  style={{
                    left: geometry.rendered.x,
                    top: geometry.rendered.y,
                    width: geometry.rendered.width,
                    height: geometry.rendered.height,
                  }}
                />
                <span className="cover-crop-grid" aria-hidden="true" />
              </div>
              <p className="cover-crop-interaction" id={`${id}-keyboard`}>
                <Move size={14} aria-hidden="true" />
                拖动或用方向键移动 · Shift 加速
              </p>
              <p className="cover-crop-file" title={source.name}>
                {source.name}
                <span>
                  {source.width} × {source.height}
                </span>
              </p>
            </div>
            <fieldset className="cover-crop-controls" disabled={uploading}>
              <legend className="visually-hidden">裁剪设置</legend>
              <div className="cover-crop-control-heading">
                <span>画面比例</span>
                <span>ASPECT</span>
              </div>
              <div
                className="cover-crop-aspects"
                role="group"
                aria-label="画面比例"
              >
                {ASPECTS.map((option, index) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={index === aspectIndex}
                    onClick={() => {
                      setAspectIndex(index);
                      adjustCrop({ ...crop, center: geometry.center }, option);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.note}</span>
                  </button>
                ))}
              </div>
              <div className="cover-crop-slider cover-crop-zoom">
                <label htmlFor={`${id}-zoom`}>
                  缩放<span>{crop.zoom.toFixed(2)}×</span>
                </label>
                <input
                  id={`${id}-zoom`}
                  type="range"
                  min={1}
                  max={MAX_CROP_ZOOM}
                  step={0.01}
                  value={crop.zoom}
                  onChange={(event) =>
                    adjustCrop({
                      zoom: Number(event.target.value),
                      center: geometry.center,
                    })
                  }
                />
              </div>
              <div className="cover-crop-slider">
                <label htmlFor={`${id}-horizontal`}>
                  水平位置<span>左 / 右</span>
                </label>
                <input
                  id={`${id}-horizontal`}
                  type="range"
                  min={geometry.minCenter.x * 100}
                  max={geometry.maxCenter.x * 100}
                  step={0.01}
                  value={geometry.center.x * 100}
                  disabled={
                    geometry.maxCenter.x - geometry.minCenter.x < 0.0001
                  }
                  onChange={(event) =>
                    adjustCrop({
                      zoom: crop.zoom,
                      center: {
                        ...geometry.center,
                        x: Number(event.target.value) / 100,
                      },
                    })
                  }
                />
              </div>
              <div className="cover-crop-slider">
                <label htmlFor={`${id}-vertical`}>
                  垂直位置<span>上 / 下</span>
                </label>
                <input
                  id={`${id}-vertical`}
                  type="range"
                  min={geometry.minCenter.y * 100}
                  max={geometry.maxCenter.y * 100}
                  step={0.01}
                  value={geometry.center.y * 100}
                  disabled={
                    geometry.maxCenter.y - geometry.minCenter.y < 0.0001
                  }
                  onChange={(event) =>
                    adjustCrop({
                      zoom: crop.zoom,
                      center: {
                        ...geometry.center,
                        y: Number(event.target.value) / 100,
                      },
                    })
                  }
                />
              </div>
              <button
                type="button"
                className="cover-crop-reset"
                onClick={() => {
                  setCrop(initialCrop());
                  setError("");
                }}
              >
                <RotateCcw size={14} />
                重新居中
              </button>
              <p className="cover-crop-note">
                默认 3:2 适合列表；其他位置会按页面版式裁切，主体建议留在中央。
              </p>
            </fieldset>
          </div>
          <div className="cover-crop-footer">
            <div className="cover-crop-feedback" aria-live="polite">
              {error ? (
                <p role="alert" className="cover-upload-error">
                  {error}
                </p>
              ) : (
                <p>
                  {uploading
                    ? "正在处理并上传，请稍候…"
                    : "仅上传裁剪后的图片 · 最长边 1800 px"}
                </p>
              )}
            </div>
            <div className="cover-crop-actions">
              <button
                type="button"
                className="cover-crop-cancel"
                onClick={closeCrop}
              >
                {uploading ? "取消上传" : "取消"}
              </button>
              <button
                type="button"
                className="cover-crop-confirm"
                disabled={uploading || disabled}
                onClick={confirmCrop}
              >
                {uploading ? (
                  <LoaderCircle size={16} className="cover-upload-spinner" />
                ) : (
                  <Upload size={16} />
                )}
                {uploading ? "上传中…" : error ? "重试上传" : "裁剪并使用"}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
