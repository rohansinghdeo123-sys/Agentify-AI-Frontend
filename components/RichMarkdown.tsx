"use client";

import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// The tutor model emits inline math as \( ... \) and display math as \[ ... \],
// but remark-math only understands $ ... $ and $$ ... $$. Translate the
// delimiters so KaTeX renders them instead of leaking raw LaTeX into the chat.
function normalizeMathDelimiters(text: string): string {
  return text
    .replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, (_m, body: string) => `\n\n$$\n${body}\n$$\n\n`)
    .replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, (_m, body: string) => `$${body}$`);
}

const components: Components = {
  // Open links safely in a new tab.
  a: ({ node, ...props }) => {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
  // Let wide tables scroll instead of blowing out the chat column.
  table: ({ node, ...props }) => {
    void node;
    return (
      <div className="study-markdown-table">
        <table {...props} />
      </div>
    );
  },
};

type RichMarkdownProps = {
  content: string;
  streaming?: boolean;
  className?: string;
};

/**
 * Full markdown rendering for tutor answers: GitHub-flavored markdown (tables,
 * lists, code), LaTeX math via KaTeX, and a blinking cursor while streaming.
 */
function RichMarkdown({ content, streaming = false, className }: RichMarkdownProps) {
  const text = normalizeMathDelimiters(String(content || ""));
  return (
    <div className={`study-markdown${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
      {streaming ? <span className="study-stream-cursor" aria-hidden="true" /> : null}
    </div>
  );
}

export default memo(RichMarkdown);
