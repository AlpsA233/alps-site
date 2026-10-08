"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { prepareBodyImage, uploadImage } from "@/lib/media-client";
import {
  hasMarkdownImagePlaceholders,
  insertMarkdownImageMarkers,
  isMarkdownImageType,
  MARKDOWN_IMAGE_LENGTH_ERROR,
  markdownImageAlt,
  markdownImageMarker,
  MAX_MARKDOWN_IMAGES_PER_INSERT,
  removeMarkdownImageMarker,
  replaceMarkdownImageMarker,
  uploadedMarkdownImage,
} from "@/lib/markdown-images";

export type MarkdownImageTask = {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
};

type UploadTask = MarkdownImageTask & {
  file: File;
  alt: string;
  controller?: AbortController;
  markdown?: string;
};

function taskError(error: unknown): string {
  if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) {
    return error.message.slice(0, 200);
  }
  return "图片上传失败，请检查网络后重试。";
}

export function useMarkdownImages({
  body,
  setBody,
  textareaRef,
  enabled,
}: {
  body: string;
  setBody: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  enabled: boolean;
}) {
  const [tasks, setTasks] = useState<MarkdownImageTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const uploads = useRef(new Map<string, UploadTask>());
  const mounted = useRef(false);
  const currentBody = useRef(body);
  const pendingSelection = useRef<{
    body: string;
    position: number;
    textarea: HTMLTextAreaElement;
  } | null>(null);

  function refreshTasks() {
    if (!mounted.current) return;
    setTasks(
      Array.from(uploads.current.values(), ({ id, name, status, error }) => ({
        id,
        name,
        status,
        ...(error ? { error } : {}),
      })),
    );
  }

  function discardTask(task: UploadTask) {
    uploads.current.delete(task.id);
    task.controller?.abort();
  }

  function insertUploadedImage(task: UploadTask) {
    const markdown = task.markdown;
    if (!markdown) return;
    setBody((current) => {
      const result = replaceMarkdownImageMarker(current, task.id, markdown);
      return result.ok ? result.body : current;
    });
    // This also runs reconciliation when replacement was rejected at the limit.
    refreshTasks();
  }

  function startUpload(task: UploadTask) {
    if (task.markdown) {
      insertUploadedImage(task);
      return;
    }
    const controller = new AbortController();
    task.controller = controller;
    void (async () => {
      try {
        const blob = await prepareBodyImage(task.file);
        if (controller.signal.aborted) return;
        const image = await uploadImage(blob, "body", controller.signal);
        if (
          controller.signal.aborted ||
          !mounted.current ||
          uploads.current.get(task.id) !== task ||
          task.controller !== controller
        ) {
          return;
        }
        task.markdown = uploadedMarkdownImage(task.alt, image.url);
        insertUploadedImage(task);
      } catch (failure) {
        if (
          controller.signal.aborted ||
          !mounted.current ||
          uploads.current.get(task.id) !== task ||
          task.controller !== controller
        ) {
          return;
        }
        task.status = "error";
        task.error = taskError(failure);
        task.controller = undefined;
        refreshTasks();
      }
    })();
  }

  useEffect(() => {
    mounted.current = true;
    const activeUploads = uploads.current;
    return () => {
      mounted.current = false;
      pendingSelection.current = null;
      for (const task of activeUploads.values()) task.controller?.abort();
      activeUploads.clear();
    };
  }, []);

  useEffect(() => {
    let changed = false;
    for (const task of uploads.current.values()) {
      if (!body.includes(markdownImageMarker(task.id))) {
        discardTask(task);
        changed = true;
      } else if (task.status === "uploading") {
        if (task.markdown) {
          // A successful replacement removes the marker. If it remains, the
          // latest body exceeded the limit; keep it recoverable without upload.
          task.status = "error";
          task.error = MARKDOWN_IMAGE_LENGTH_ERROR;
          task.controller = undefined;
          changed = true;
        } else if (!task.controller) {
          startUpload(task);
        }
      }
    }
    if (changed) refreshTasks();
    // New tasks and retries must reconcile even when the body was unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, tasks]);

  useLayoutEffect(() => {
    currentBody.current = body;
    const selection = pendingSelection.current;
    if (!selection) return;
    pendingSelection.current = null;
    if (body === selection.body && textareaRef.current === selection.textarea) {
      selection.textarea.setSelectionRange(
        selection.position,
        selection.position,
      );
    }
  }, [body, textareaRef]);

  function addFiles(files: File[], clipboard: boolean) {
    if (!enabled || !files.length) return;
    setError(null);
    if (files.length > MAX_MARKDOWN_IMAGES_PER_INSERT) {
      setError(
        `一次最多插入 ${MAX_MARKDOWN_IMAGES_PER_INSERT} 张图片，请分批选择。`,
      );
      return;
    }
    const textarea = textareaRef.current;
    const observedBody = textarea?.value ?? currentBody.current;
    const newTasks: UploadTask[] = files.map((file) => ({
      id: crypto.randomUUID(),
      name: clipboard ? "粘贴的图片" : file.name || "图片",
      file,
      alt: markdownImageAlt(file.name, clipboard),
      status: "uploading",
    }));
    const ids = newTasks.map(({ id }) => id);
    const insertion = insertMarkdownImageMarkers(
      observedBody,
      ids,
      textarea?.selectionStart,
      textarea?.selectionEnd,
    );
    if (!insertion.ok) {
      setError(insertion.error);
      return;
    }
    for (const task of newTasks) uploads.current.set(task.id, task);
    if (textarea) {
      pendingSelection.current = {
        body: insertion.body,
        position: insertion.selection,
        textarea,
      };
    }
    setBody((current) => {
      if (current === observedBody) return insertion.body;
      // Preserve a pending edit if the controlled value has not rendered yet.
      const result = insertMarkdownImageMarkers(current, ids);
      return result.ok ? result.body : current;
    });
    refreshTasks();
  }

  const onPaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (!enabled) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && isMarkdownImageType(item.type))
      .flatMap((item) => {
        const file = item.getAsFile();
        return file && isMarkdownImageType(file.type) ? [file] : [];
      });
    if (!files.length) return;
    event.preventDefault();
    addFiles(files, true);
  };

  const onPickFiles: ChangeEventHandler<HTMLInputElement> = (event) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!enabled || !files.length) return;
    if (files.some((file) => !isMarkdownImageType(file.type))) {
      setError("请选择 JPEG、PNG、WebP 或 AVIF 图片。");
      return;
    }
    addFiles(files, false);
  };

  function retryTask(id: string) {
    if (!enabled) return;
    const task = uploads.current.get(id);
    if (!task || task.status !== "error") return;
    if (!currentBody.current.includes(markdownImageMarker(id))) {
      discardTask(task);
      refreshTasks();
      return;
    }
    task.status = "uploading";
    task.error = undefined;
    if (task.markdown) insertUploadedImage(task);
    else refreshTasks();
  }

  function removeTask(id: string) {
    const task = uploads.current.get(id);
    if (!task) return;
    discardTask(task);
    setBody((current) => removeMarkdownImageMarker(current, id));
    refreshTasks();
  }

  return {
    onPaste,
    onPickFiles,
    tasks,
    retryTask,
    removeTask,
    busy: tasks.some((task) => task.status === "uploading"),
    hasUnfinished: tasks.length > 0 || hasMarkdownImagePlaceholders(body),
    error,
    clearError: () => setError(null),
  };
}
