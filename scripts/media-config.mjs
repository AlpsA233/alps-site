import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { readEnv } from "./deployment-config.mjs";
import { normalizeMediaPublicBase } from "../src/lib/media-policy.ts";

export const MEDIA_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "MEDIA_PUBLIC_BASE_URL",
];

export class MediaConfigError extends Error {}

export function validateMediaConfig(values, { publicOnly = false } = {}) {
  const value = (key) => (typeof values?.[key] === "string" ? values[key] : "");
  const account = value("R2_ACCOUNT_ID");
  const bucket = value("R2_BUCKET");
  if (!/^[a-f0-9]{32}$/i.test(account))
    throw new MediaConfigError("R2_ACCOUNT_ID 须为 32 位十六进制账户 ID。");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
    throw new MediaConfigError(
      "R2_BUCKET 须为 3–63 位小写字母、数字或连字符，首尾不得是连字符。",
    );
  const validated = { R2_ACCOUNT_ID: account, R2_BUCKET: bucket };
  if (publicOnly) return validated;
  const access = value("R2_ACCESS_KEY_ID");
  const secret = value("R2_SECRET_ACCESS_KEY");
  if (!/^[a-z0-9_-]{1,128}$/i.test(access))
    throw new MediaConfigError("请填写有效的 R2_ACCESS_KEY_ID。");
  if (!/^[A-Za-z0-9_+=/.-]{1,1024}$/.test(secret))
    throw new MediaConfigError(
      "请填写有效的 R2_SECRET_ACCESS_KEY，不可包含空白、引号或变量占位符。",
    );
  const publicBase = normalizeMediaPublicBase(value("MEDIA_PUBLIC_BASE_URL"));
  if (!publicBase)
    throw new MediaConfigError(
      "MEDIA_PUBLIC_BASE_URL 须为实际 HTTPS 图床根地址，不含凭据、端口、路径、查询或片段。",
    );
  return {
    ...validated,
    R2_ACCESS_KEY_ID: access,
    R2_SECRET_ACCESS_KEY: secret,
    MEDIA_PUBLIC_BASE_URL: publicBase,
  };
}

export function mediaEnvironment(values) {
  const validated = validateMediaConfig(values);
  return MEDIA_KEYS.map((key) => `${key}=${validated[key]}\n`).join("");
}

function atomicWrite(path, data) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, data, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } catch {
    throw new MediaConfigError("配置文件写入失败，请检查目录与文件权限。");
  } finally {
    rmSync(temporary, { force: true });
  }
}

function splitLines(buffer) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] !== 10 && buffer[index] !== 13) continue;
    const length = buffer[index] === 13 && buffer[index + 1] === 10 ? 2 : 1;
    lines.push({
      content: buffer.subarray(start, index),
      ending: buffer.subarray(index, index + length),
    });
    index += length - 1;
    start = index + 1;
  }
  if (start < buffer.length)
    lines.push({ content: buffer.subarray(start), ending: Buffer.alloc(0) });
  return lines;
}

function commentSuffix(value) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === "\\" && quote === '"') escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (
      character === "#" &&
      (index === 0 || /\s/.test(value[index - 1]))
    ) {
      let start = index;
      while (start > 0 && /[ \t]/.test(value[start - 1])) start--;
      return value.slice(start);
    }
  }
  return "";
}

export function applyLocalMedia(values, path) {
  const validated = validateMediaConfig(values);
  let original;
  try {
    original = readFileSync(path);
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new MediaConfigError("无法读取本地环境文件，请检查路径与权限。");
    original = Buffer.alloc(0);
  }
  const lines = splitLines(original);
  const ending =
    lines.find((line) => line.ending.length)?.ending ?? Buffer.from("\n");
  const seen = new Set();
  const parts = lines.flatMap((line) => {
    const match = line.content
      .toString("utf8")
      .match(
        /^(\uFEFF?[ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)(.*)$/,
      );
    if (!match || !MEDIA_KEYS.includes(match[2]))
      return [line.content, line.ending];
    const key = match[2];
    seen.add(key);
    return [
      Buffer.from(
        `${match[1]}${key}${match[3]}${validated[key]}${commentSuffix(match[4])}`,
      ),
      line.ending,
    ];
  });
  const missing = MEDIA_KEYS.filter((key) => !seen.has(key));
  if (missing.length) {
    if (original.length && !lines.at(-1)?.ending.length) parts.push(ending);
    for (const key of missing)
      parts.push(Buffer.from(`${key}=${validated[key]}`), ending);
  }
  atomicWrite(path, Buffer.concat(parts));
}

function validateWorkerName(name) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name))
    throw new MediaConfigError(
      "Worker 名称须为 1–63 位小写字母、数字或连字符，首尾不得是连字符。",
    );
}

export function writeWorkerConfig(values, path, name = "alps-media") {
  const validated = validateMediaConfig(values, { publicOnly: true });
  validateWorkerName(name);
  const config = {
    $schema:
      "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
    name,
    main: "media-worker.mjs",
    account_id: validated.R2_ACCOUNT_ID,
    compatibility_date: "2026-10-08",
    workers_dev: true,
    cache: { enabled: true },
    r2_buckets: [{ binding: "MEDIA_BUCKET", bucket_name: validated.R2_BUCKET }],
  };
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    throw new MediaConfigError("无法创建 Worker 配置目录，请检查路径与权限。");
  }
  atomicWrite(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export async function checkMediaConnection(values, dependencies = {}) {
  const validated = validateMediaConfig(values);
  let client;
  try {
    client = (
      dependencies.createS3Client ?? ((config) => new S3Client(config))
    )({
      region: "auto",
      endpoint: `https://${validated.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: validated.R2_ACCESS_KEY_ID,
        secretAccessKey: validated.R2_SECRET_ACCESS_KEY,
      },
      maxAttempts: 1,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    await client.send(
      new ListObjectsV2Command({
        Bucket: validated.R2_BUCKET,
        Prefix: "media/",
        MaxKeys: 1,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  } catch {
    throw new MediaConfigError(
      "对象存储连接检查失败；请检查 R2 账户、桶与读取权限。未输出内部错误或凭据。",
    );
  } finally {
    try {
      client?.destroy?.();
    } catch {
      // Cleanup errors must never expose a cloud SDK message or credentials.
    }
  }
  try {
    const response = await (dependencies.fetch ?? globalThis.fetch)(
      `${validated.MEDIA_PUBLIC_BASE_URL}/health`,
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) throw new Error();
    const health = await response.json();
    if (health?.service !== "alps-media" || health?.ready !== true)
      throw new Error();
  } catch {
    throw new MediaConfigError(
      "公开图床健康检查失败；请检查 Worker 地址、部署与 MEDIA_BUCKET 绑定。未输出内部错误或凭据。",
    );
  }
  return { storage: true, worker: true };
}

export function copyMediaClipboard(
  text,
  { platform = process.platform, spawn = spawnSync } = {},
) {
  const commands =
    platform === "darwin"
      ? [["pbcopy", []]]
      : platform === "win32"
        ? [["clip", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
          ];
  for (const [command, args] of commands) {
    try {
      const result = spawn(command, args, {
        input: text,
        stdio: ["pipe", "ignore", "ignore"],
        timeout: 10_000,
        shell: false,
      });
      if (!result.error && result.status === 0) return;
    } catch {
      // Try another native clipboard tool without printing its diagnostic output.
    }
  }
  throw new MediaConfigError(
    "没有可用的系统剪贴板工具；请在本地编辑器打开专用图床配置文件并手动复制。清空时可复制一段普通文本覆盖。",
  );
}

export function parseMediaConfigArgs(args) {
  const options = {
    command: args[0] || "validate",
    envPath: resolve(".env.media.local"),
    localPath: resolve(".env.local"),
    name: "alps-media",
  };
  if (
    ![
      "validate",
      "check",
      "clipboard",
      "clear-clipboard",
      "local",
      "worker-config",
    ].includes(options.command)
  )
    throw new MediaConfigError(
      "用法：media:config validate|check|clipboard|clear-clipboard|local|worker-config [--env 文件] [--local-env 文件] [--name Worker名称]",
    );
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    const value = args[index + 1];
    if (
      !["--env", "--local-env", "--name"].includes(arg) ||
      !value ||
      value.startsWith("--")
    )
      throw new MediaConfigError("未知或缺少图床配置参数。");
    index++;
    if (arg === "--name") options.name = value;
    else options[arg === "--env" ? "envPath" : "localPath"] = resolve(value);
  }
  if (options.envPath === options.localPath)
    throw new MediaConfigError(
      "专用图床配置文件与本地环境文件必须使用不同路径。",
    );
  validateWorkerName(options.name);
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseMediaConfigArgs(args);
  if (options.command === "clear-clipboard") {
    copyMediaClipboard("");
    console.log("已清空系统剪贴板。");
    return;
  }
  let values;
  try {
    values = readEnv(options.envPath);
  } catch {
    throw new MediaConfigError(
      "无法读取图床配置文件，请检查路径、权限与引号格式。",
    );
  }
  if (options.command === "worker-config") {
    writeWorkerConfig(
      values,
      resolve("cloudflare/wrangler.local.jsonc"),
      options.name,
    );
    console.log("已生成 Worker 本地配置，仅包含账户与桶信息，未写入访问密钥。");
    return;
  }
  validateMediaConfig(values);
  if (options.command === "check") {
    await checkMediaConnection(values);
    console.log(
      "对象存储与公开图床只读检查通过；未写入任何图片，未显示任何凭据。",
    );
  } else if (options.command === "clipboard") {
    copyMediaClipboard(mediaEnvironment(values));
    console.log(
      "已将 5 项图床配置复制到系统剪贴板；粘贴后请运行 media:config clear-clipboard。",
    );
  } else if (options.command === "local") {
    applyLocalMedia(values, options.localPath);
    console.log(
      "已合并 5 项图床配置到本地环境文件，并设置仅当前用户读写权限。",
    );
  } else {
    console.log("图床配置检查通过：5 项；未显示任何凭据。");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof MediaConfigError
        ? error.message
        : "图床配置处理失败；未输出内部错误或凭据。",
    );
    process.exitCode = 1;
  }
}
