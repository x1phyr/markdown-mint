export type MarkdownDiagnosticLevel = "error" | "warning";

export interface MarkdownDiagnosticSummary {
  level: MarkdownDiagnosticLevel;
  message: string;
}

export interface MarkdownSummary {
  codeBlocks: number;
  diagnostics: MarkdownDiagnosticSummary[];
  headings: number;
  images: number;
  links: number;
  words: number;
}

const HEADING_PATTERN = /^ {0,3}(#{1,6})\s+(.+)$/gmu;
const LINK_PATTERN = /!?(?:\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>]+>)/gu;
const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/gu;
const CODE_BLOCK_PATTERN = /^\s*```/gmu;

export function summarizeMarkdown(markdown: string): MarkdownSummary {
  const headings = [...markdown.matchAll(HEADING_PATTERN)].length;
  const images = [...markdown.matchAll(IMAGE_PATTERN)].length;
  const links = [...markdown.matchAll(LINK_PATTERN)].length - images;
  const codeBlocks = Math.floor([...markdown.matchAll(CODE_BLOCK_PATTERN)].length / 2);
  const words = markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
  const diagnostics: MarkdownDiagnosticSummary[] = [];

  if (!markdown.trim()) {
    diagnostics.push({ level: "error", message: "Markdown 内容不能为空。" });
  }
  if (/<\s*script\b|\bon[a-z]+\s*=/iu.test(markdown)) {
    diagnostics.push({
      level: "warning",
      message: "检测到原始脚本或事件属性；编译器会将其清理并保留诊断。",
    });
  }
  if (/(?:javascript|vbscript|data):/iu.test(markdown)) {
    diagnostics.push({
      level: "warning",
      message: "检测到可能不安全的 URL；导出时会阻止该资源或链接。",
    });
  }
  if (markdown.length > 900_000) {
    diagnostics.push({
      level: "warning",
      message: "文档接近单次导入大小上限，建议拆分后再导出。",
    });
  }

  return { codeBlocks, diagnostics, headings, images, links: Math.max(links, 0), words };
}
