import {
  readFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const DEPLOYMENT_KEYS = [
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "ADMIN_PASSWORD_HASH",
  "COOKIE_SECURE",
  "NEXT_PUBLIC_SITE_URL",
];

export class DeploymentConfigError extends Error {}

// Read dotenv values as data. Never execute a configuration file or expand variables.
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end === 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) {
        throw new DeploymentConfigError(
          "环境文件包含不完整的引号值；请重新输入该值。",
        );
      }
      value = value.slice(1, end);
      if (quote === '"') value = value.replace(/\\([\\"])/g, "$1");
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    if (/[\r\n\0]/.test(value))
      throw new DeploymentConfigError("环境值不得包含换行或空字符。");
    values[match[1]] = value;
  }
  return values;
}

export function readEnv(path, { optional = false } = {}) {
  try {
    return parseEnv(readFileSync(path, "utf8"));
  } catch (error) {
    if (optional && error.code === "ENOENT") return {};
    if (error instanceof DeploymentConfigError) throw error;
    throw new DeploymentConfigError("无法读取环境文件；请检查文件路径与权限。");
  }
}

function serializeValue(value) {
  if (/[\r\n\0]/.test(value))
    throw new DeploymentConfigError("环境值不得包含换行或空字符。");
  return /^[A-Za-z0-9_:/.,@+?%=-]*$/.test(value)
    ? value
    : '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function writeDeploymentEnv(
  path,
  values,
  localPath = resolve(".env.local"),
) {
  if (resolve(path) === resolve(localPath)) {
    throw new DeploymentConfigError(
      "部署配置必须使用独立文件，不能覆盖 .env.local。",
    );
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const text = Object.entries(values)
      .map(([key, value]) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
          throw new DeploymentConfigError("无效的环境变量名称。");
        return `${key}=${serializeValue(String(value))}\n`;
      })
      .join("");
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function validateTursoConfig(values) {
  let url;
  try {
    url = new URL(values.TURSO_DATABASE_URL || "");
  } catch {
    throw new DeploymentConfigError(
      "请填写兼容 libSQL 的 TURSO_DATABASE_URL。",
    );
  }
  if (
    !["libsql:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  ) {
    throw new DeploymentConfigError(
      "Turso 地址须为 libsql:// 或 https:// 数据库地址，不含凭据、路径或查询参数。",
    );
  }
  if (!values.TURSO_AUTH_TOKEN || /\s|\$/.test(values.TURSO_AUTH_TOKEN)) {
    throw new DeploymentConfigError(
      "请填写有效的 Turso 读写 token（不可包含空白或变量占位符）。",
    );
  }
}

export function validateDeploymentConfig(
  values,
  { allowAutoSite = false } = {},
) {
  validateTursoConfig(values);
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(values.ADMIN_PASSWORD_HASH || "")) {
    throw new DeploymentConfigError(
      "缺少有效 ADMIN_PASSWORD_HASH；请先运行 npm run admin:setup，再运行 deploy:config sync-admin。",
    );
  }
  if (values.COOKIE_SECURE !== "true")
    throw new DeploymentConfigError("Vercel 部署须设置 COOKIE_SECURE=true。");
  if (!values.NEXT_PUBLIC_SITE_URL && allowAutoSite) return;
  let site;
  try {
    site = new URL(values.NEXT_PUBLIC_SITE_URL || "");
  } catch {
    throw new DeploymentConfigError(
      "请填写实际部署的 HTTPS 站点地址，或初次部署使用 --allow-auto-site。",
    );
  }
  if (
    site.protocol !== "https:" ||
    !site.hostname ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== "/"
  ) {
    throw new DeploymentConfigError(
      "NEXT_PUBLIC_SITE_URL 须为实际 HTTPS 站点根地址。",
    );
  }
}

export function syncAdminHash({
  envPath = resolve(".env.deploy.local"),
  localPath = resolve(".env.local"),
} = {}) {
  const values = readEnv(envPath, { optional: true });
  const local = readEnv(localPath, { optional: true });
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(local.ADMIN_PASSWORD_HASH || "")) {
    throw new DeploymentConfigError(
      "本地尚无后台密码 hash；请先运行 npm run admin:setup。此操作会重设密码，请先记录新密码。",
    );
  }
  values.ADMIN_PASSWORD_HASH = local.ADMIN_PASSWORD_HASH;
  values.COOKIE_SECURE = "true";
  // DATABASE_PATH is local-only. It must never accompany a cloud deployment.
  delete values.DATABASE_PATH;
  writeDeploymentEnv(envPath, values, localPath);
  return values;
}

export function clipboardEnvironment(values, { allowAutoSite = false } = {}) {
  validateDeploymentConfig(values, { allowAutoSite });
  return DEPLOYMENT_KEYS.filter((key) => values[key])
    .map((key) => `${key}=${values[key]}\n`)
    .join("");
}

export function parseConfigArgs(args) {
  const options = {
    command: args[0] || "validate",
    envPath: resolve(".env.deploy.local"),
    localPath: resolve(".env.local"),
    allowAutoSite: false,
  };
  if (
    !["sync-admin", "validate", "clipboard", "clear-clipboard"].includes(
      options.command,
    )
  )
    throw new DeploymentConfigError(
      "用法：deploy:config sync-admin|validate|clipboard|clear-clipboard [--env 文件] [--local-env 文件] [--allow-auto-site]",
    );
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--allow-auto-site") options.allowAutoSite = true;
    else if (["--env", "--local-env"].includes(arg) && args[index + 1])
      options[arg === "--env" ? "envPath" : "localPath"] = resolve(
        args[++index],
      );
    else throw new DeploymentConfigError("未知或缺少部署配置参数。");
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseConfigArgs(args);
  if (options.command === "sync-admin") {
    syncAdminHash(options);
    console.log(
      "已在专用部署文件中保存 2 项配置（后台 hash、HTTPS cookie）；本地服务配置未改动。",
    );
    return;
  }
  if (options.command === "clear-clipboard") {
    const result = spawnSync("pbcopy", [], {
      input: "",
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (result.status !== 0)
      throw new DeploymentConfigError(
        "无法清空剪贴板；请手动复制一段普通文本覆盖。",
      );
    console.log("已清空剪贴板。");
    return;
  }
  const values = readEnv(options.envPath);
  validateDeploymentConfig(values, options);
  if (options.command === "clipboard") {
    const result = spawnSync("pbcopy", [], {
      input: clipboardEnvironment(values, options),
      stdio: ["pipe", "ignore", "ignore"],
    });
    if (result.status !== 0)
      throw new DeploymentConfigError(
        "此系统没有可用 pbcopy；请在本机编辑器打开专用部署文件后手动粘贴。",
      );
    console.log(
      `已将 ${DEPLOYMENT_KEYS.filter((key) => values[key]).length} 项 Vercel 配置复制到剪贴板；粘贴后请运行 deploy:config clear-clipboard。`,
    );
  } else
    console.log(
      `部署配置检查通过：${DEPLOYMENT_KEYS.filter((key) => values[key]).length} 项；未显示任何凭据。`,
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof DeploymentConfigError
        ? error.message
        : "部署配置处理失败；未输出内部错误或凭据。",
    );
    process.exitCode = 1;
  }
}
