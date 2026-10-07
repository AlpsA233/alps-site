import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseConfig } from "../src/lib/database-config.ts";
import { createDatabaseClient } from "../src/lib/database-provider.ts";
import { createSchema } from "../src/lib/database-schema.ts";
import { hashPassword } from "../src/lib/password.ts";
import { resetAdminCredential } from "../src/lib/admin-credentials.ts";
import { readEnv, validateTursoConfig } from "./deployment-config.mjs";

export class AdminResetError extends Error {}

export function parseResetArgs(args) {
  const options = { envPath: resolve(".env.local"), help: false };
  for (let index = 0; index < args.length; index++) {
    if (
      args[index] === "--env" &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    ) {
      options.envPath = resolve(args[++index]);
    } else if (args[index] === "--help" && args.length === 1) {
      options.help = true;
    } else {
      throw new AdminResetError(
        "用法：npm run admin:reset -- [--env 环境文件]。不支持跳过目标确认。",
      );
    }
  }
  return options;
}

function terminalText(value) {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "?");
}

export function describeResetTarget(config) {
  return config.provider === "local"
    ? `本地 SQLite：${terminalText(config.path)}`
    : `远程 Turso：${new URL(config.url).hostname}`;
}

function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 256
  ) {
    throw new AdminResetError("新密码不能为空，且不能超过 256 个字符。");
  }
}

// A separate muted output prevents readline from echoing typed or pasted secrets.
// readline restores the terminal's raw mode when the interface closes.
export async function readTerminalAnswer(
  prompt,
  input,
  output,
  { secret = false } = {},
) {
  if (secret && (!input.isTTY || !output.isTTY)) {
    throw new AdminResetError(
      "隐藏密码输入需要交互终端；自动化请通过 ALPS_ADMIN_PASSWORD 提供新密码。",
    );
  }
  const muted = secret
    ? new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      })
    : null;
  if (muted) {
    muted.isTTY = true;
    muted.columns = output.columns || 80;
  }
  const terminal = Boolean(input.isTTY && output.isTTY);
  const reader = createInterface({ input, output: muted || output, terminal });
  if (secret) output.write(prompt);
  try {
    return await new Promise((accept, reject) => {
      const closed = () =>
        reject(new AdminResetError("输入已取消；后台密码未修改。"));
      reader.once("close", closed);
      reader.once("SIGINT", () => reader.close());
      reader.question(secret ? "" : prompt, (answer) => {
        reader.removeListener("close", closed);
        accept(answer);
      });
    });
  } finally {
    reader.close();
    muted?.destroy();
    if (secret) output.write("\n");
  }
}

export async function main(args = process.argv.slice(2), io = {}) {
  const options = parseResetArgs(args);
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  const environment = io.environment || process.env;
  const ask =
    io.ask ||
    ((prompt, flags) => readTerminalAnswer(prompt, input, output, flags));
  const connect = io.connect || createDatabaseClient;
  if (options.help) {
    output.write(
      "用法：npm run admin:reset -- [--env 环境文件]\n默认 .env.local；线上数据库请明确使用 --env .env.deploy.local。\n密码仅在目标数据库中更新，不修改环境文件，不需要重新部署。\n",
    );
    return { changed: false };
  }

  let config;
  try {
    // Never merge process.env: a shell's Turso credentials must not redirect a local reset.
    const file = readEnv(options.envPath);
    if (file.TURSO_DATABASE_URL || file.TURSO_AUTH_TOKEN)
      validateTursoConfig(file);
    config = resolveDatabaseConfig({ ...file });
  } catch {
    throw new AdminResetError(
      "无法读取有效的目标配置；请检查 --env 文件中的 DATABASE_PATH 或完整 Turso 连接信息。未连接数据库。",
    );
  }

  const supplied = environment.ALPS_ADMIN_PASSWORD;
  if (supplied !== undefined) validatePassword(supplied);
  else if (!input.isTTY || !output.isTTY) {
    throw new AdminResetError(
      "非交互终端不会读取明文密码；请使用交互终端，或通过 ALPS_ADMIN_PASSWORD 提供非空且最多 256 个字符的新密码。未连接数据库。",
    );
  }

  output.write(
    `目标${describeResetTarget(config)}\n将重设此数据库的后台密码，并退出所有已登录设备。\n`,
  );
  const answer = await ask("输入 yes 确认这个目标，其他输入取消：", {
    secret: false,
  });
  if (answer.trim() !== "yes") {
    output.write("已取消；未连接数据库，后台密码未修改。\n");
    return { changed: false };
  }

  let password = supplied;
  if (password === undefined) {
    password = await ask("新密码（非空，最多 256 个字符，输入隐藏）：", {
      secret: true,
    });
    validatePassword(password);
    const confirmation = await ask("再次输入新密码（输入隐藏）：", {
      secret: true,
    });
    if (password !== confirmation) {
      throw new AdminResetError(
        "两次新密码不一致；未连接数据库，后台密码未修改。",
      );
    }
  }
  validatePassword(password);

  let client;
  try {
    const encoded = await hashPassword(password);
    client = await connect(config);
    // Schema initialization intentionally does not import application content or seed records.
    await createSchema(client);
    await resetAdminCredential(client, encoded);
    output.write(
      "后台密码已重设，所有旧登录会话已退出。使用新密码登录即可，无需重启或重新部署。\n",
    );
    return { changed: true };
  } catch {
    throw new AdminResetError(
      "重设未能完成；请检查目标数据库连接、读写权限和可用状态。未输出内部错误或凭据。",
    );
  } finally {
    client?.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof AdminResetError
        ? error.message
        : "后台密码重设失败；未输出内部错误或凭据。",
    );
    process.exitCode = 1;
  }
}
