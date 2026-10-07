import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const password =
  process.env.ALPS_ADMIN_PASSWORD ?? randomBytes(16).toString("base64url");
if (password.length < 1 || password.length > 256) {
  console.error("密码不能为空，且不能超过 256 个字符。");
  process.exit(1);
}
const salt = randomBytes(16);
const key = await promisify(scrypt)(password, salt, 64, {
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024,
});
const path = resolve(".env.local");
let env = "";
try {
  env = readFileSync(path, "utf8");
} catch {}
env = env.replace(/^ADMIN_PASSWORD_HASH=.*\n?/gm, "");
if (env && !env.endsWith("\n")) env += "\n";
writeFileSync(
  path,
  env + `ADMIN_PASSWORD_HASH=${salt.toString("hex")}:${key.toString("hex")}\n`,
  { mode: 0o600 },
);
chmodSync(path, 0o600);
mkdirSync(resolve("data"), { recursive: true });
writeFileSync(
  resolve("data/admin-access.txt"),
  `Alps 后台初始访问凭据\n\n地址：http://127.0.0.1:3000/admin\n密码：${password}\n\n此文件仅供本机交接，不会加入 Git。确认记录密码后可删除此文件。\n这份凭据仅用于尚未设置后台密码的新数据库。首次登录后，请在后台账号安全中修改密码；忘记现有密码请运行 npm run admin:reset。\n重新生成初始化凭据不会覆盖数据库中已经设置的密码；首次配置运行中的本地服务时需重启。\n`,
  { mode: 0o600 },
);
chmodSync(resolve("data/admin-access.txt"), 0o600);
console.log(
  "后台初始化凭据已生成，仅用于新数据库。凭据保存在 data/admin-access.txt（仅本机，Git 已忽略）。",
);
console.log(
  "已有数据库请在后台账号安全中修改密码，或运行 npm run admin:reset 恢复访问。",
);
console.log("如果开发服务正在运行，环境变量更新后请重启。");
