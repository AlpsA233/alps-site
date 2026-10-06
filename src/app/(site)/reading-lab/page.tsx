import type { Metadata } from "next";
import Link from "@/components/motion-link";
import { Markdown } from "@/components/markdown";
import { BrandIcon } from "@/components/brand";
import { markdownShowcase } from "@/lib/markdown-showcase";
import "./reading-lab.css";

export const metadata: Metadata = {
  title: "一张未完成的手稿",
  robots: { index: false, follow: false },
};

export default function ReadingLab() {
  return (
    <main id="main" className="reading-lab">
      <header className="reading-lab__heading">
        <Link href="/writing" className="reading-lab__back">
          <span aria-hidden="true">←</span> 回到文字目录
        </Link>
        <p className="eyebrow">THE READING ROOM / 阅读样张</p>
        <h1>
          一张未完成的<span>手稿。</span>
        </h1>
        <div className="reading-lab__intro">
          <p>
            写下来，也允许改一改。
            <br />
            一小段文字，和几种留下想法的方式。
          </p>
          <span aria-hidden="true">still thinking.</span>
        </div>
      </header>
      <div className="reading-lab__paper">
        <div className="reading-lab__paper-top">
          <span>ALPS / NOTES IN PROGRESS</span>
          <BrandIcon name="writing" size={20} />
        </div>
        <Markdown body={markdownShowcase} variant="journal" />
        <div className="reading-lab__paper-end">
          <span>To be continued...</span>
          <span>01</span>
        </div>
      </div>
      <details className="reading-lab__source">
        <summary>
          看看这张手稿的 Markdown 写法 <span aria-hidden="true">＋</span>
        </summary>
        <p>
          这套样式已用于所有文字文章及后台文章预览。悬停或键盘聚焦可揭示删除标记；点击正文显示约
          5 秒，眼睛按钮或 Escape 可以收起。
        </p>
        <pre>
          <code>{markdownShowcase}</code>
        </pre>
      </details>
    </main>
  );
}
