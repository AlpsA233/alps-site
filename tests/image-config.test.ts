import assert from "node:assert/strict";
import test, { before } from "node:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const modulePath = "../scripts/media-config.mjs";
const deploymentModulePath = "../scripts/deployment-config.mjs";
let config: any;
let deploymentConfig: any;
before(async () => {
  config = await import(modulePath);
  deploymentConfig = await import(deploymentModulePath);
});

const fakeConfig = {
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "fixture-access-never-real",
  R2_SECRET_ACCESS_KEY: "fixture-secret-never-real_+/=.0123",
  R2_BUCKET: "fixture-media-bucket",
  MEDIA_PUBLIC_BASE_URL: "https://fixture-media.example.invalid",
};

function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "alps-media-config-"));
  return {
    directory,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("media validation matches application identifiers and rejects unsafe dotenv values and origins", () => {
  const validated = config.validateMediaConfig({
    ...fakeConfig,
    MEDIA_PUBLIC_BASE_URL: `${fakeConfig.MEDIA_PUBLIC_BASE_URL}/`,
  });
  assert.equal(
    validated.MEDIA_PUBLIC_BASE_URL,
    fakeConfig.MEDIA_PUBLIC_BASE_URL,
  );
  assert.equal(config.MEDIA_KEYS.length, 5);
  for (const patch of [
    { R2_ACCOUNT_ID: "a".repeat(31) },
    { R2_ACCOUNT_ID: "g".repeat(32) },
    { R2_BUCKET: "ab" },
    { R2_BUCKET: "A-invalid" },
    { R2_BUCKET: "-invalid" },
    { R2_BUCKET: "invalid-" },
    { R2_BUCKET: "a".repeat(64) },
    { R2_ACCESS_KEY_ID: "space invalid" },
    { R2_ACCESS_KEY_ID: "a".repeat(129) },
    { R2_SECRET_ACCESS_KEY: "$EXPAND_ME" },
    { R2_SECRET_ACCESS_KEY: "$(touch something)" },
    { R2_SECRET_ACCESS_KEY: "`execute`" },
    { R2_SECRET_ACCESS_KEY: 'a"b' },
    { R2_SECRET_ACCESS_KEY: "a\nb" },
    { R2_SECRET_ACCESS_KEY: "a".repeat(1025) },
    { MEDIA_PUBLIC_BASE_URL: "http://fixture.example.invalid" },
    { MEDIA_PUBLIC_BASE_URL: "https://user:private@fixture.example.invalid" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.invalid:443" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.invalid/path" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.invalid?private=1" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.invalid#fragment" },
    { MEDIA_PUBLIC_BASE_URL: "https://fixture.example.invalid/?" },
    { MEDIA_PUBLIC_BASE_URL: "https://127.0.0.1" },
    { MEDIA_PUBLIC_BASE_URL: "https://sub.localhost" },
  ]) {
    assert.throws(() =>
      config.validateMediaConfig({ ...fakeConfig, ...patch }),
    );
  }
});

test("local merge preserves unrelated bytes, newline style, comments, and duplicate managed declarations", () => {
  const value = fixture();
  try {
    const path = resolve(value.directory, ".env.local");
    const unchanged = Buffer.concat([
      Buffer.from(
        "# existing note\r\nDATABASE_PATH=custom.sqlite\r\nUNRELATED=",
      ),
      Buffer.from([0xff, 0xfe]),
      Buffer.from("\r\nADMIN_PASSWORD_HASH='fixture-other-value' # retain\r\n"),
    ]);
    const original = Buffer.concat([
      unchanged,
      Buffer.from(
        "  export R2_BUCKET = old-bucket  # bucket note\r\nR2_BUCKET=duplicate\r\n# final note without newline",
      ),
    ]);
    writeFileSync(path, original, { mode: 0o644 });
    config.applyLocalMedia(fakeConfig, path);
    const merged = readFileSync(path);
    assert.deepEqual(merged.subarray(0, unchanged.length), unchanged);
    const tail = merged.subarray(unchanged.length).toString("utf8");
    assert.ok(
      tail.startsWith(
        `  export R2_BUCKET = ${fakeConfig.R2_BUCKET}  # bucket note\r\nR2_BUCKET=${fakeConfig.R2_BUCKET}\r\n# final note without newline\r\n`,
      ),
    );
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(tail.replaceAll("\r\n", "").includes("\n"), false);
    const parsed = deploymentConfig.readEnv(path);
    for (const key of config.MEDIA_KEYS)
      assert.equal(parsed[key], fakeConfig[key as keyof typeof fakeConfig]);
    assert.equal(readdirSync(value.directory).length, 1);
    const first = readFileSync(path);
    config.applyLocalMedia(fakeConfig, path);
    assert.deepEqual(readFileSync(path), first);
  } finally {
    value.close();
  }
});

test("dotenv is parsed only as data and generated environment contains exactly five validated keys", () => {
  const value = fixture();
  try {
    const marker = resolve(value.directory, "must-not-exist");
    const path = resolve(value.directory, "input.env");
    writeFileSync(
      path,
      `UNRELATED='$(touch ${marker})'\n${config.mediaEnvironment(fakeConfig)}`,
    );
    const parsed = deploymentConfig.readEnv(path);
    assert.equal(parsed.UNRELATED, `$(touch ${marker})`);
    assert.equal(existsSync(marker), false);
    const environment = config.mediaEnvironment({
      ...parsed,
      OTHER: "do-not-copy",
    });
    assert.deepEqual(
      Object.keys(deploymentConfig.parseEnv(environment)),
      config.MEDIA_KEYS,
    );
    assert.equal(environment.includes("OTHER"), false);
    const localPath = resolve(value.directory, "local.env");
    config.applyLocalMedia(parsed, localPath);
    assert.equal(statSync(localPath).mode & 0o777, 0o600);
    assert.equal(existsSync(marker), false);
  } finally {
    value.close();
  }
});

test("worker configuration needs only account and bucket and cannot include upload credentials", () => {
  const value = fixture();
  try {
    const path = resolve(value.directory, "cloudflare", "wrangler.local.jsonc");
    config.writeWorkerConfig(
      {
        R2_ACCOUNT_ID: fakeConfig.R2_ACCOUNT_ID,
        R2_BUCKET: fakeConfig.R2_BUCKET,
        R2_ACCESS_KEY_ID: "do-not-include-access",
        R2_SECRET_ACCESS_KEY: "$(do-not-include-secret)",
      },
      path,
      "fixture-worker",
    );
    const text = readFileSync(path, "utf8");
    const worker = JSON.parse(text);
    assert.equal(worker.name, "fixture-worker");
    assert.equal(worker.main, "media-worker.mjs");
    assert.equal(worker.account_id, fakeConfig.R2_ACCOUNT_ID);
    assert.equal(worker.compatibility_date, "2026-10-08");
    assert.equal(worker.workers_dev, true);
    assert.deepEqual(worker.cache, { enabled: true });
    assert.deepEqual(worker.r2_buckets, [
      { binding: "MEDIA_BUCKET", bucket_name: fakeConfig.R2_BUCKET },
    ]);
    assert.equal(text.includes("do-not-include"), false);
    assert.equal(text.includes("ACCESS_KEY"), false);
    assert.equal(text.includes("MEDIA_PUBLIC_BASE_URL"), false);
    assert.throws(() =>
      config.writeWorkerConfig(fakeConfig, path, "Invalid Name"),
    );
  } finally {
    value.close();
  }
});

test("connection check sends only bounded read requests and requires the expected ready worker", async () => {
  let destroyed = false;
  let sends = 0;
  let fetches = 0;
  const result = await config.checkMediaConnection(fakeConfig, {
    createS3Client: (options: any) => {
      assert.equal(options.maxAttempts, 1);
      assert.equal(
        options.endpoint,
        `https://${fakeConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      );
      return {
        send: async (command: any, options: any) => {
          sends++;
          assert.ok(command instanceof ListObjectsV2Command);
          assert.deepEqual(command.input, {
            Bucket: fakeConfig.R2_BUCKET,
            Prefix: "media/",
            MaxKeys: 1,
          });
          assert.ok(options.abortSignal instanceof AbortSignal);
          return { Contents: [] };
        },
        destroy: () => {
          destroyed = true;
        },
      };
    },
    fetch: async (url: string, options: RequestInit) => {
      fetches++;
      assert.equal(url, `${fakeConfig.MEDIA_PUBLIC_BASE_URL}/health`);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.body, undefined);
      return Response.json({ service: "alps-media", ready: true });
    },
  });
  assert.deepEqual(result, { storage: true, worker: true });
  assert.equal(sends, 1);
  assert.equal(fetches, 1);
  assert.equal(destroyed, true);
});

test("failed cloud diagnostics are replaced with static messages, including malicious error payloads", async () => {
  const sensitive = `${fakeConfig.R2_ACCESS_KEY_ID} ${fakeConfig.R2_SECRET_ACCESS_KEY} ${fakeConfig.MEDIA_PUBLIC_BASE_URL}`;
  const assertSanitized = (error: any) => {
    assert.ok(error instanceof config.MediaConfigError);
    for (const secret of Object.values(fakeConfig))
      assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes(sensitive), false);
    return true;
  };
  await assert.rejects(
    config.checkMediaConnection(fakeConfig, {
      createS3Client: () => ({
        send: async () => {
          throw new Error(sensitive);
        },
        destroy: () => {},
      }),
      fetch: async () => {
        assert.fail("storage failure must not proceed");
      },
    }),
    assertSanitized,
  );
  for (const fetch of [
    async () => {
      throw new Error(sensitive);
    },
    async () => Response.json({ service: "alps-media", ready: false }),
    async () => Response.json({ service: "unrelated", ready: true }),
    async () => new Response(sensitive, { status: 503 }),
    async () => new Response(sensitive, { status: 200 }),
  ]) {
    await assert.rejects(
      config.checkMediaConnection(fakeConfig, {
        createS3Client: () => ({ send: async () => ({}), destroy: () => {} }),
        fetch,
      }),
      assertSanitized,
    );
  }
});

test("clipboard uses native tools with private stdin and never routes content to stdout", () => {
  const calls: any[] = [];
  const text = config.mediaEnvironment(fakeConfig);
  config.copyMediaClipboard(text, {
    platform: "linux",
    spawn: (command: string, args: string[], options: any) => {
      calls.push({ command, args, options });
      return command === "wl-copy"
        ? { status: null, error: new Error("missing") }
        : { status: 0 };
    },
  });
  assert.deepEqual(
    calls.map((call) => call.command),
    ["wl-copy", "xclip"],
  );
  for (const call of calls) {
    assert.equal(call.options.input, text);
    assert.deepEqual(call.options.stdio, ["pipe", "ignore", "ignore"]);
    assert.equal(call.options.shell, false);
  }
  for (const [platform, expected] of [
    ["darwin", "pbcopy"],
    ["win32", "clip"],
  ]) {
    config.copyMediaClipboard("", {
      platform,
      spawn: (command: string, _args: string[], options: any) => {
        assert.equal(command, expected);
        assert.equal(options.input, "");
        return { status: 0 };
      },
    });
  }
  assert.throws(
    () =>
      config.copyMediaClipboard(text, {
        platform: "linux",
        spawn: () => ({
          status: 1,
          error: new Error(fakeConfig.R2_SECRET_ACCESS_KEY),
        }),
      }),
    /本地编辑器/,
  );
});

test("CLI rejects staging/local collisions and reports fake configuration without credentials", () => {
  const value = fixture();
  try {
    const envPath = resolve(value.directory, "media.env");
    const localPath = resolve(value.directory, "local.env");
    writeFileSync(envPath, config.mediaEnvironment(fakeConfig));
    assert.throws(
      () =>
        config.parseMediaConfigArgs([
          "local",
          "--env",
          envPath,
          "--local-env",
          envPath,
        ]),
      /不同路径/,
    );
    assert.throws(() => config.parseMediaConfigArgs(["validate", "--env"]));
    const args = [
      "--import",
      "tsx",
      resolve("scripts/media-config.mjs"),
      "validate",
      "--env",
      envPath,
      "--local-env",
      localPath,
    ];
    const output = execFileSync(process.execPath, args, { encoding: "utf8" });
    assert.match(output, /检查通过.*5 项/);
    for (const secret of Object.values(fakeConfig))
      assert.equal(output.includes(secret), false);
    writeFileSync(
      envPath,
      config
        .mediaEnvironment(fakeConfig)
        .replace(fakeConfig.R2_SECRET_ACCESS_KEY, "$UNEXPANDED"),
    );
    const invalid = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
    assert.equal(invalid.stderr.includes("$UNEXPANDED"), false);
    for (const secret of Object.values(fakeConfig))
      assert.equal(invalid.stderr.includes(secret), false);
    assert.equal(existsSync(localPath), false);
  } finally {
    value.close();
  }
});
