import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

export interface CompiledMarkdown {
  html: string;
  messages: string[];
}

/**
 * Compile trusted Markdown into a semantic HTML fragment.
 *
 * Raw HTML is intentionally not passed through. The v0.1 compiler milestone
 * will add the complete normalization and sanitization pipeline.
 */
export async function compileMarkdown(markdown: string): Promise<CompiledMarkdown> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);

  return {
    html: String(file),
    messages: file.messages.map((message) => message.message),
  };
}
