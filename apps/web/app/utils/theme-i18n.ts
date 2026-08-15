import type { Locale } from "./export-types";

export interface ThemeText {
  bestFor: readonly string[];
  category: string;
  contentCoverage: readonly string[];
  description: string;
  designPrinciples: readonly string[];
  tagline: string;
}

export interface ThemeTextFallback extends Omit<ThemeText, "category"> {
  category: string;
}

const zhThemeText: Readonly<Record<string, ThemeText>> = {
  "technical-mint": {
    bestFor: ["架构笔记", "API 指南", "工程报告"],
    category: "技术",
    contentCoverage: ["代码", "表格", "图表", "高密度技术章节"],
    description: "适用于技术文档、架构提案和 API 指南。",
    designPrinciples: ["高信息密度", "清晰层级", "克制的薄荷绿强调色"],
    tagline: "为决策、系统与实现细节打造的精准技术界面。",
  },
  "minimal-report": {
    bestFor: ["产品需求文档", "会议材料", "项目总结"],
    category: "商务",
    contentCoverage: ["标题", "列表", "表格", "稳定的打印版式"],
    description: "适用于产品需求文档、项目总结、会议材料和商务报告。",
    designPrinciples: ["克制的对比度", "稳定的间距", "打印优先的清晰度"],
    tagline: "沉静的报告版式，让商务文档易于浏览和打印。",
  },
  "editorial-serif": {
    bestFor: ["文章", "教程", "通讯", "长篇内容"],
    category: "编辑出版",
    contentCoverage: ["长文阅读", "引用", "图片", "公式与脚注"],
    description: "适用于文章、教程、通讯和长篇内容发布。",
    designPrinciples: ["编辑式节奏", "衬线阅读质感", "舒展的页面节奏"],
    tagline: "为教程、文章和观点型文档赋予编辑出版般的阅读节奏。",
  },
};

export function localizeTheme(
  themeId: string,
  locale: Locale,
  fallback: ThemeTextFallback,
): ThemeText {
  return locale === "zh-CN" ? (zhThemeText[themeId] ?? fallback) : fallback;
}

export function themeGalleryCopy(locale: Locale) {
  return locale === "en"
    ? {
        back: "← MarkdownMint",
        choose: "Choose the document's natural rhythm.",
        eyebrow: "Theme library",
        footer: "Start an export",
        hero: "Three visual languages for finished Markdown.",
        lead: "Each launch theme consumes the same compiled document, declares its capabilities, and ships with an HTML preview and a renderer-backed PDF sample path.",
        set: "The launch set",
        view: "View theme details",
      }
    : {
        back: "← 返回 MarkdownMint",
        choose: "选择最适合文档的视觉节奏。",
        eyebrow: "主题库",
        footer: "开始导出",
        hero: "为成稿 Markdown 准备的三种视觉语言。",
        lead: "每套首发主题都消费同一份编译文档，声明自身能力，并提供 HTML 预览和由渲染器生成的 PDF 示例。",
        set: "首发主题",
        view: "查看主题详情",
      };
}

export function themeDetailCopy(locale: Locale) {
  return locale === "en"
    ? {
        back: "← Theme library",
        capabilities: "Declared capabilities",
        contract: "Theme contract",
        coverage: "Content coverage",
        download: "Download",
        firstPage: "First page preview",
        generate: "Generate PDF sample",
        generating: "Generating",
        htmlHeading: "Same fixture, different voice.",
        htmlSample: "Live HTML sample",
        noScripts: "No scripts",
        notFound: "Theme not found",
        printHeading: "Generate the PDF from the same preview source.",
        printLead:
          "The PDF button calls the Renderer API with the shared launch fixture and this theme's manifest defaults.",
        printSample: "Print sample",
        rendererError: "Renderer is not reachable. Start apps/renderer to generate the PDF sample.",
        startExport: "Start an export",
        strengths: "Strengths",
        use: "Use this theme",
      }
    : {
        back: "← 返回主题库",
        capabilities: "已声明的能力",
        contract: "主题约定",
        coverage: "内容覆盖",
        download: "下载",
        firstPage: "首页预览",
        generate: "生成 PDF 示例",
        generating: "正在生成",
        htmlHeading: "同一份内容，不同的表达。",
        htmlSample: "HTML 实时示例",
        noScripts: "不含脚本",
        notFound: "未找到主题",
        printHeading: "用同一份预览源生成 PDF。",
        printLead: "PDF 按钮会使用共享的首发示例和当前主题的默认配置调用渲染器 API。",
        printSample: "打印示例",
        rendererError: "无法连接渲染器。请启动 apps/renderer 后再生成 PDF 示例。",
        startExport: "开始导出",
        strengths: "设计优势",
        use: "使用此主题",
      };
}
