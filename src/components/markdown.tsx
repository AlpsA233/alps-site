import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useId } from "react";
import { BrandIcon } from "@/components/brand";
import { DeletedText } from "@/components/markdown-reveal";
import "./markdown.css";

const link: Components["a"] = ({ children, href, node: _node, ...props }) => (
  <a
    {...props}
    href={href}
    target={/^https?:\/\//.test(href || "") ? "_blank" : undefined}
    rel="noopener noreferrer"
  >
    {children}
  </a>
);

const journalComponents: Components = {
  a: link,
  del: ({ children }) => <DeletedText>{children}</DeletedText>,
  h2: ({ children, node: _node, ...props }) => (
    <h2 {...props}>
      <span className="markdown-section-mark" aria-hidden="true">
        ✳
      </span>
      <span className="markdown-section-title">{children}</span>
    </h2>
  ),
  blockquote: ({ children, node: _node, ...props }) => (
    <blockquote {...props}>
      <span className="markdown-quote-label" aria-hidden="true">
        IN THE MARGIN / 旁注
      </span>
      <div className="markdown-quote-copy">{children}</div>
    </blockquote>
  ),
  hr: () => (
    <div className="markdown-divider" role="separator">
      <span aria-hidden="true">
        <BrandIcon name="ridge" width={53} height={27} />
      </span>
    </div>
  ),
  pre: ({ children, node, ...props }) => {
    const code = node?.children.find(
      (child) => child.type === "element" && child.tagName === "code",
    );
    const classes = code?.type === "element" ? code.properties.className : [];
    const language = Array.isArray(classes)
      ? String(
          classes.find((name) => String(name).startsWith("language-")) || "",
        ).replace(/^language-/, "")
      : "";
    return (
      <figure className="markdown-code">
        <figcaption>
          <span>CODE / 一小段实现</span>
          <span>{language || "TEXT"}</span>
        </figcaption>
        <pre {...props}>{children}</pre>
      </figure>
    );
  },
  table: ({ children, node: _node, ...props }) => (
    <div
      className="markdown-table"
      tabIndex={0}
      role="region"
      aria-label="表格，可横向滚动"
    >
      <table {...props}>{children}</table>
    </div>
  ),
  img: ({ node: _node, alt, ...props }) => (
    <span className="markdown-photo">
      {/* User-authored Markdown also supports remote images and normal img attributes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} alt={alt || ""} loading="lazy" />
      {alt && (
        <span className="markdown-photo-caption" aria-hidden="true">
          {alt}
        </span>
      )}
    </span>
  ),
};

export function Markdown({
  body,
  variant = "plain",
}: {
  body: string;
  variant?: "plain" | "journal";
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const journal = variant === "journal";
  return (
    <div className={`prose${journal ? " prose-journal" : ""}`}>
      <ReactMarkdown
        remarkPlugins={journal ? [[remarkGfm, { singleTilde: false }]] : []}
        remarkRehypeOptions={
          journal
            ? {
                clobberPrefix: `journal-${id}-`,
                footnoteLabel: "页边补记",
                footnoteLabelProperties: {},
                footnoteBackLabel: "返回文中引用",
              }
            : undefined
        }
        components={journal ? journalComponents : { a: link }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
