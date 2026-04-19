import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Renders Paige's chat messages as styled markdown.
 * Supports: bold, italic, headings, ordered/unordered lists,
 * code, blockquotes, links, and GFM tables.
 */
export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div
      className={cn(
        "text-[13px] sm:text-sm leading-relaxed text-foreground break-words",
        // Inline element styling
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic",
        // Headings
        "[&_h1]:text-base [&_h1]:sm:text-lg [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-foreground",
        "[&_h2]:text-sm [&_h2]:sm:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-foreground",
        "[&_h3]:text-[13px] [&_h3]:sm:text-sm [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-foreground",
        // Paragraphs & spacing
        "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        // Lists
        "[&_ul]:my-1.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1",
        "[&_ol]:my-1.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1",
        "[&_li]:leading-relaxed [&_li>p]:my-0",
        "[&_li>ul]:my-1 [&_li>ol]:my-1",
        // Links
        "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:opacity-80",
        // Code
        "[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-[12px] [&_code]:font-mono",
        "[&_pre]:my-2 [&_pre]:p-2.5 [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:overflow-x-auto",
        "[&_pre>code]:bg-transparent [&_pre>code]:p-0",
        // Blockquote
        "[&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-2",
        // Tables (GFM)
        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px] [&_table]:sm:text-[13px]",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        // Horizontal rule
        "[&_hr]:my-3 [&_hr]:border-border",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Force links to open in a new tab safely
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
