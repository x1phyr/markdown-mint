import type { Locale } from "./export-types";

export type WorkflowCopy = {
  accent: string;
  attachImages: string;
  attachImagesBrowse: string;
  attachImagesFormats: string;
  attachImagesHint: string;
  attachedImages: string;
  back: string;
  browse: string;
  cancel: string;
  clearAttachedImages: string;
  clearDraft: string;
  configure: string;
  configureHint: string;
  continue: string;
  draftNotSaved: string;
  draftSaved: string;
  drop: string;
  error: string;
  exportAnother: string;
  generate: string;
  generateHint: string;
  generating: string;
  heroKicker: string;
  heroLead: string;
  heroTitle: string;
  importHint: string;
  importTitle: string;
  language: string;
  loadSample: string;
  margin: string;
  noDocument: string;
  noRenderer: string;
  orientation: string;
  pageNumber: string;
  pageSize: string;
  paste: string;
  preview: string;
  regenerate: string;
  removeAttachedImage: string;
  reset: string;
  result: string;
  resultHint: string;
  saveHint: string;
  selectTheme: string;
  selectThemeHint: string;
  startExport: string;
  subtitle: string;
  tableOfContents: string;
  theme: string;
  themeHint: string;
  title: string;
  toc: string;
  upload: string;
  words: string;
  headings: string;
  images: string;
  codeBlocks: string;
};

export function workflowCopy(locale: Locale): WorkflowCopy {
  if (locale === "en") {
    return {
      accent: "Accent",
      attachImages: "Attach local images",
      attachImagesBrowse: "Choose images",
      attachImagesFormats: "PNG, JPEG, GIF, WebP, or SVG · up to 8 MiB each",
      attachImagesHint:
        "If the Markdown references files like ./photo.png, attach those images here so export can embed them.",
      attachedImages: "Attached images",
      back: "Back",
      browse: "Choose a .md file",
      cancel: "Cancel export",
      clearAttachedImages: "Clear all",
      clearDraft: "Clear local draft",
      configure: "Configure",
      configureHint: "Set document metadata, page geometry, and output options.",
      continue: "Continue",
      draftNotSaved: "Draft is not saved yet",
      draftSaved: "Draft saved",
      drop: "Drop Markdown here",
      error: "Something needs attention",
      exportAnother: "Export another format",
      generate: "Generate",
      generateHint: "The renderer compiles and packages the selected format in an isolated job.",
      generating: "Generating artifact",
      heroKicker: "Markdown publishing studio",
      heroLead:
        "Bring finished Markdown to the last mile: a considered theme, predictable pages, and a file you can share.",
      heroTitle: "Documents worth handing over.",
      importHint:
        "Upload, drop, paste, or load the sample. Attach local images when the Markdown references them.",
      importTitle: "1. Import Markdown",
      language: "Language",
      loadSample: "Load sample",
      margin: "Margins",
      noDocument: "No document loaded",
      noRenderer:
        "The renderer is not reachable. Start apps/renderer or configure NUXT_PUBLIC_RENDERER_URL.",
      orientation: "Orientation",
      pageNumber: "Page numbers",
      pageSize: "Page size",
      paste: "Paste Markdown",
      preview: "Theme preview",
      regenerate: "Retry export",
      removeAttachedImage: "Remove",
      reset: "Start over",
      result: "Result",
      resultHint: "Your artifact is ready. Download it or switch format and export again.",
      saveHint: "Drafts stay in this browser and are never sent until you generate.",
      selectTheme: "Select a theme",
      selectThemeHint:
        "All launch themes consume the same compiled document and support HTML and PDF.",
      startExport: "Generate artifact",
      subtitle: "Subtitle",
      tableOfContents: "Table of contents",
      theme: "Theme",
      themeHint: "Choose the visual language before setting the final page details.",
      title: "Title",
      toc: "TOC",
      upload: "Import",
      words: "words",
      headings: "headings",
      images: "images",
      codeBlocks: "code blocks",
    };
  }

  return {
    accent: "强调色",
    attachImages: "附加本地图片",
    attachImagesBrowse: "选择图片",
    attachImagesFormats: "支持 PNG、JPEG、GIF、WebP、SVG，单张不超过 8 MiB",
    attachImagesHint:
      "若 Markdown 引用了 ./photo.png 这类本地路径，请在此附加对应图片，导出时才能嵌入。",
    attachedImages: "已附加图片",
    back: "返回",
    browse: "选择 .md 文件",
    cancel: "取消生成",
    clearAttachedImages: "全部清除",
    clearDraft: "清除本地草稿",
    configure: "配置",
    configureHint: "设置文档信息、页面尺寸和输出选项。",
    continue: "下一步",
    draftNotSaved: "草稿尚未保存",
    draftSaved: "草稿已保存",
    drop: "将 Markdown 拖到这里",
    error: "需要处理的问题",
    exportAnother: "导出另一种格式",
    generate: "生成",
    generateHint: "渲染器会在隔离任务中编译并打包选定格式。",
    generating: "正在生成产物",
    heroKicker: "Markdown 出版工作台",
    heroLead:
      "把写好的 Markdown 推到最后一公里：选择合适的主题，生成稳定的页面，并得到可以交付的文件。",
    heroTitle: "值得交付的文档。",
    importHint: "上传、拖放、粘贴或载入示例。若 Markdown 引用本地图片，请一并附加。",
    importTitle: "1. 导入 Markdown",
    language: "语言",
    loadSample: "载入示例",
    margin: "页边距",
    noDocument: "还没有导入文档",
    noRenderer: "无法连接渲染器。请启动 apps/renderer，或配置 NUXT_PUBLIC_RENDERER_URL。",
    orientation: "方向",
    pageNumber: "页码",
    pageSize: "页面尺寸",
    paste: "粘贴 Markdown",
    preview: "主题预览",
    regenerate: "重试生成",
    removeAttachedImage: "移除",
    reset: "重新开始",
    result: "结果",
    resultHint: "产物已经准备好。你可以下载，或切换格式后重新生成。",
    saveHint: "草稿只保存在当前浏览器中，点击生成前不会发送。",
    selectTheme: "选择主题",
    selectThemeHint: "三套首发主题消费同一份编译文档，并同时支持 HTML 与 PDF。",
    startExport: "生成文档",
    subtitle: "副标题",
    tableOfContents: "目录",
    theme: "主题",
    themeHint: "先选择视觉语言，再设置最终页面细节。",
    title: "标题",
    toc: "目录",
    upload: "导入",
    words: "字词",
    headings: "标题",
    images: "图片",
    codeBlocks: "代码块",
  };
}
