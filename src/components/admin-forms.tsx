"use client";
import { useActionState, useState, type ChangeEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { Markdown } from "@/components/markdown";
import { Eye, EyeOff, Save } from "lucide-react";
import {
  loginAction,
  saveEntryAction,
  saveProfileAction,
  deleteEntryAction,
  type ActionState,
} from "@/lib/actions";
import { contentCoverOptions, type Entry, type Profile } from "@/lib/content";
function Feedback({ state }: { state: ActionState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p role="alert" className="form-message message-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="form-message message-success">
          {state.success}
        </p>
      )}
    </div>
  );
}
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="login-form">
      <label htmlFor="password">后台密码</label>
      <div className="password-field">
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          required
          maxLength={256}
          autoComplete="current-password"
          placeholder="输入你的密码"
        />
        <button
          type="button"
          aria-label={show ? "隐藏密码" : "显示密码"}
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      <Feedback state={state} />
      <button
        disabled={pending}
        className="button button-dark login-submit"
        type="submit"
      >
        {pending ? "正在验证…" : "进入工作台"}
      </button>
      <p className="login-help">只为你保留的创作空间。</p>
    </form>
  );
}
export function EntryForm({
  entry,
  kind,
  created = false,
}: {
  entry?: Entry;
  kind: Entry["kind"];
  created?: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveEntryAction,
    created ? { success: "新内容已创建，可以继续编辑。" } : {},
  );
  const [body, setBody] = useState(entry?.body || "");
  const [preview, setPreview] = useState(false);
  const [fields, setFields] = useState({
    title: entry?.title || "",
    subtitle: entry?.subtitle || "",
    summary: entry?.summary || "",
    slug: entry?.slug || "",
    category: entry?.category || (kind === "project" ? "独立开发" : "开发手记"),
    year: entry?.year || String(new Date().getFullYear()),
    tags: entry?.tags || "",
    status: entry?.status || "draft",
    theme: entry?.theme || "lime",
    coverPath: entry?.coverPath || "",
    coverAlt: entry?.coverAlt || "",
    url: entry?.url || "",
  });
  function field(name: keyof typeof fields) {
    return {
      value: fields[name],
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        const value = event.target.value;
        setFields((previous) => ({ ...previous, [name]: value }));
      },
    };
  }
  return (
    <>
      <form
        action={action}
        className="entry-form"
        onReset={(event) => event.preventDefault()}
      >
        <input type="hidden" name="kind" value={kind} />
        {entry && <input type="hidden" name="id" value={entry.id} />}
        <div className="editor-main">
          <div className="form-panel">
            <label htmlFor="title">标题</label>
            <input
              className="title-input"
              id="title"
              name="title"
              {...field("title")}
              maxLength={100}
              required
              placeholder={
                kind === "project" ? "给作品起一个名字" : "写下这一篇的标题"
              }
            />
            {kind === "project" ? (
              <>
                <label htmlFor="subtitle">副标题</label>
                <input
                  id="subtitle"
                  name="subtitle"
                  {...field("subtitle")}
                  maxLength={140}
                  placeholder="用一句话描述这个作品"
                />
              </>
            ) : (
              <input type="hidden" name="subtitle" value="" />
            )}
            <label htmlFor="summary">摘要</label>
            <textarea
              id="summary"
              name="summary"
              rows={3}
              {...field("summary")}
              maxLength={600}
              required
              placeholder="让读者在列表里快速了解内容"
            />
            <div className="editor-label">
              <label htmlFor="body">
                正文 <span>支持 Markdown</span>
              </label>
              <div className="editor-tabs" role="group" aria-label="正文视图">
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  aria-pressed={!preview}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  aria-pressed={preview}
                >
                  预览
                </button>
              </div>
            </div>
            <textarea
              id="body"
              name="body"
              rows={18}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={50000}
              required
              className={preview ? "visually-hidden" : "markdown-input"}
              placeholder="## 一个新的开始\n\n写下你的故事…"
            />
            {preview && (
              <div className="markdown-preview">
                {body ? (
                  <Markdown
                    body={body}
                    variant={kind === "post" ? "journal" : "plain"}
                  />
                ) : (
                  <p className="muted">写点什么，再来这里看看。</p>
                )}
              </div>
            )}
            {kind === "post" && (
              <p className="markdown-editor-help">
                <code>~~旧想法~~</code> 模糊揭示 · <code>**重点**</code>{" "}
                放大强调
                <Link
                  href="/reading-lab"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看阅读样张 ↗
                </Link>
              </p>
            )}
          </div>
        </div>
        <aside className="editor-aside">
          <div className="form-panel publish-panel">
            <h2>发布设置</h2>
            <label htmlFor="status">状态</label>
            <select name="status" id="status" {...field("status")}>
              <option value="draft">草稿 · 仅后台可见</option>
              <option value="published">已发布 · 前台可见</option>
            </select>
            <label htmlFor="slug">访问路径</label>
            <div className="field-prefix">
              /{kind === "project" ? "work" : "writing"}/
            </div>
            <input
              name="slug"
              id="slug"
              {...field("slug")}
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              placeholder="my-new-story"
            />
            <label htmlFor="category">分类</label>
            <input
              name="category"
              id="category"
              {...field("category")}
              maxLength={40}
              required
            />
            <label htmlFor="year">年份</label>
            <input
              name="year"
              id="year"
              {...field("year")}
              pattern="20[0-9]{2}"
              maxLength={4}
              required
              inputMode="numeric"
            />
            <label htmlFor="tags">标签</label>
            <input
              name="tags"
              id="tags"
              {...field("tags")}
              maxLength={180}
              placeholder="Next.js, 设计, 日常"
            />
            <label htmlFor="coverPath">封面图片</label>
            <select
              id="coverPath"
              name="coverPath"
              value={fields.coverPath}
              onChange={(event) => {
                const path = event.target.value;
                const selected = contentCoverOptions.find(
                  (cover) => cover.path === path,
                );
                setFields((previous) => ({
                  ...previous,
                  coverPath: path,
                  coverAlt: path ? (selected?.alt ?? previous.coverAlt) : "",
                }));
              }}
            >
              <option value="">无封面</option>
              {fields.coverPath &&
                !contentCoverOptions.some(
                  (cover) => cover.path === fields.coverPath,
                ) && (
                  <option value={fields.coverPath}>
                    当前图片 · {fields.coverPath}
                  </option>
                )}
              {contentCoverOptions.map((cover) => (
                <option key={cover.path} value={cover.path}>
                  {cover.label}
                </option>
              ))}
            </select>
            {fields.coverPath && (
              <div className="editor-cover-preview">
                <Image
                  src={fields.coverPath}
                  alt={fields.coverAlt}
                  fill
                  sizes="(max-width: 820px) 90vw, 260px"
                />
              </div>
            )}
            <label htmlFor="coverAlt">图片描述</label>
            <input
              id="coverAlt"
              name="coverAlt"
              {...field("coverAlt")}
              maxLength={180}
              placeholder="简要描述画面，方便读者理解"
            />
            {kind === "project" ? (
              <>
                <label htmlFor="theme">卡片底色</label>
                <select id="theme" name="theme" {...field("theme")}>
                  <option value="lime">酸橙 · Lime</option>
                  <option value="ink">墨黑 · Ink</option>
                  <option value="paper">纸色 · Paper</option>
                </select>
                <label htmlFor="url">外部项目链接（可选）</label>
                <input
                  type="url"
                  id="url"
                  name="url"
                  {...field("url")}
                  maxLength={2000}
                  placeholder="https://…"
                />
              </>
            ) : (
              <>
                <input type="hidden" name="theme" value="paper" />
                <input type="hidden" name="url" value="" />
              </>
            )}
            <Feedback state={state} />
            <button
              type="submit"
              className="button button-dark save-button"
              disabled={pending}
            >
              <Save size={16} />
              {pending ? "保存中…" : "保存内容"}
            </button>
            {entry?.status === "published" && (
              <Link
                className="preview-public"
                href={`/${kind === "project" ? "work" : "writing"}/${entry.slug}`}
                target="_blank"
              >
                查看前台页面
              </Link>
            )}
          </div>
        </aside>
      </form>
      {entry && (
        <form
          action={deleteEntryAction}
          className="delete-form"
          onSubmit={(event) => {
            if (!confirm("确定删除这条内容？删除后无法恢复。"))
              event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={entry.id} />
          <button type="submit" className="delete-button">
            删除这条内容
          </button>
        </form>
      )}
    </>
  );
}
export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(saveProfileAction, {});
  const [fields, setFields] = useState(profile);
  function field(name: keyof Profile) {
    return {
      value: fields[name],
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        const value = event.target.value;
        setFields((previous) => ({ ...previous, [name]: value }));
      },
    };
  }
  return (
    <form
      action={action}
      className="profile-form"
      onReset={(event) => event.preventDefault()}
    >
      <div className="form-panel">
        <h2>基本资料</h2>
        <div className="form-grid">
          <div>
            <label htmlFor="name">名字 / 站名</label>
            <input
              id="name"
              name="name"
              required
              maxLength={40}
              {...field("name")}
            />
          </div>
          <div>
            <label htmlFor="role">身份介绍</label>
            <input
              id="role"
              name="role"
              required
              maxLength={100}
              {...field("role")}
            />
          </div>
        </div>
        <label htmlFor="headline">首页标题</label>
        <textarea
          id="headline"
          name="headline"
          rows={2}
          required
          maxLength={160}
          {...field("headline")}
        />
        <label htmlFor="intro">首页简介</label>
        <textarea
          id="intro"
          name="intro"
          rows={3}
          required
          maxLength={800}
          {...field("intro")}
        />
        <label htmlFor="about">关于我的正文</label>
        <textarea
          id="about"
          name="about"
          rows={10}
          required
          maxLength={8000}
          {...field("about")}
        />
        <div className="form-grid">
          <div>
            <label htmlFor="email">联系邮箱</label>
            <input
              type="email"
              id="email"
              name="email"
              required
              {...field("email")}
            />
          </div>
          <div>
            <label htmlFor="github">GitHub 地址</label>
            <input
              type="url"
              id="github"
              name="github"
              required
              {...field("github")}
            />
          </div>
          <div>
            <label htmlFor="location">所在地点</label>
            <input
              id="location"
              name="location"
              maxLength={60}
              {...field("location")}
            />
          </div>
          <div>
            <label htmlFor="available">合作状态</label>
            <select id="available" name="available" {...field("available")}>
              <option value="yes">欢迎聊聊新想法</option>
              <option value="no">正在专注于手上的事</option>
            </select>
          </div>
        </div>
        <Feedback state={state} />
        <button type="submit" className="button button-dark" disabled={pending}>
          <Save size={16} />
          {pending ? "保存中…" : "保存个人资料"}
        </button>
      </div>
    </form>
  );
}
