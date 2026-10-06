"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="not-found">
      <p className="eyebrow">A SMALL PAUSE</p>
      <h1>稍等一下。</h1>
      <p>内容暂时没有加载出来，请再试一次。</p>
      <button className="button button-dark" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
