<!-- eslint-disable vue/html-closing-bracket-newline, vue/html-indent, vue/html-self-closing -->
<script setup lang="ts">
/* eslint-disable vue/html-closing-bracket-newline, vue/html-indent, vue/html-self-closing */
import { useHead, useRoute, useRuntimeConfig } from "#imports";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import { launchThemeDetails, launchThemes } from "@markdown-mint/themes";

import { summarizeMarkdown, type MarkdownDiagnosticSummary } from "./utils/markdown-summary";

type Locale = "zh-CN" | "en";
type OutputFormat = "html" | "pdf";
type Step = "configure" | "generate" | "import" | "result" | "theme";

interface JobArtifact {
  fileName: string;
  format: OutputFormat;
  mediaType: string;
  pageCount?: number;
  sha256: string;
  sizeBytes: number;
  thumbnail?: {
    fileName: string;
    mediaType: "image/png";
    sha256: string;
    sizeBytes: number;
  };
}

interface JobLog {
  durationMs?: number;
  finishedAt?: number;
  stage: string;
  startedAt: number;
}

interface JobStatus {
  artifact?: JobArtifact;
  attempt: number;
  diagnostics: Array<{ level: string; message: string; rule: string }>;
  error?: { code: string; message: string };
  id: string;
  logs: JobLog[];
  state: string;
  downloads?: {
    artifactUrl?: string;
    expiresAt?: number;
    thumbnailUrl?: string;
  };
}

interface DraftRecord {
  accentColor: string;
  author: string;
  fileName: string;
  id: "active";
  markdown: string;
  margin: "compact" | "normal" | "relaxed";
  orientation: "landscape" | "portrait";
  outputFormat: OutputFormat;
  pageSize: "A4" | "Letter";
  selectedThemeId: string;
  subtitle: string;
  title: string;
  updatedAt: number;
}

const SAMPLE_MARKDOWN = `---
title: MarkdownMint sample document
subtitle: A short export workflow demo
author: MarkdownMint
language: en
---

# A finished Markdown document

Choose a theme, adjust the page settings, and export a standalone artifact.

:::tip{title="Start here"}
The compiler keeps the semantic structure intact while the theme controls the visual language.
:::

## What is included

- GFM tables and lists
- Static code highlighting
- Safe links and rich content diagnostics

| Output | Intended use |
| --- | --- |
| PDF | Print and handoff |
| HTML | Offline sharing |

\`\`\`ts
export const output = "ready";
\`\`\`
`;

const config = useRuntimeConfig();
const route = useRoute();
const rendererUrl = computed(() => String(config.public.rendererUrl ?? "http://127.0.0.1:4310"));
const baseURL = String(config.app.baseURL ?? "/");
const basePath = baseURL.replace(/\/+$/u, "");
const isHome = computed(
  () => route.path === "/" || route.path === basePath || route.path === `${basePath}/`,
);

const locale = ref<Locale>("zh-CN");
useHead(() => ({ htmlAttrs: { lang: locale.value } }));
const step = ref<Step>("import");
const markdown = ref("");
const fileName = ref("");
const isDragging = ref(false);
const importError = ref("");
const selectedThemeId = ref("technical-mint");
const outputFormat = ref<OutputFormat>("pdf");
const pageSize = ref<"A4" | "Letter">("A4");
const orientation = ref<"landscape" | "portrait">("portrait");
const margin = ref<"compact" | "normal" | "relaxed">("normal");
const accentColor = ref("#2f735f");
const isSubmitting = ref(false);
const job = ref<JobStatus | null>(null);
const thumbnailUrl = ref("");
const workflowError = ref("");
const draftSavedAt = ref<number | null>(null);
const hasLoadedDraft = ref(false);
const idempotencyKey = ref("");

const documentForm = reactive({ author: "", subtitle: "", title: "" });
const features = reactive({
  cover: true,
  footer: true,
  header: false,
  pageNumber: true,
  toc: true,
});

const themeOptions = launchThemes.map((manifest) => ({
  details: launchThemeDetails.find((details) => details.id === manifest.id),
  manifest,
}));

const selectedTheme = computed(() => {
  return (
    themeOptions.find((theme) => theme.manifest.id === selectedThemeId.value) ?? themeOptions[0]
  );
});

const selectedThemeDetails = computed(() => selectedTheme.value?.details);
const summary = computed(() => summarizeMarkdown(markdown.value));
const blockingDiagnostics = computed(() =>
  summary.value.diagnostics.filter((diagnostic) => diagnostic.level === "error"),
);
const canContinueImport = computed(
  () => markdown.value.trim().length > 0 && blockingDiagnostics.value.length === 0,
);
const activeStepIndex = computed(() => steps.value.findIndex((item) => item.id === step.value));
const draftStatus = computed(() => {
  if (!draftSavedAt.value) return copy.value.draftNotSaved;
  return `${copy.value.draftSaved} ${new Intl.DateTimeFormat(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(draftSavedAt.value)}`;
});

const copy = computed(() => {
  if (locale.value === "en") {
    return {
      accent: "Accent",
      back: "Back",
      browse: "Choose a .md file",
      cancel: "Cancel export",
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
        "Upload, drop, paste, or load the sample. The browser only creates a lightweight preflight summary.",
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
    back: "返回",
    browse: "选择 .md 文件",
    cancel: "取消生成",
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
    importHint: "上传、拖放、粘贴或载入示例。浏览器只做轻量预检，完整编译在你点击生成后执行。",
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
});

const steps = computed(() => [
  { id: "import" as const, label: copy.value.upload },
  { id: "theme" as const, label: copy.value.theme },
  { id: "configure" as const, label: copy.value.configure },
  { id: "generate" as const, label: copy.value.generate },
  { id: "result" as const, label: copy.value.result },
]);

let pollController: AbortController | undefined;
let draftDb: IDBDatabase | undefined;

function rendererEndpoint(path: string): string {
  if (/^https?:\/\//u.test(path)) return path;
  return `${rendererUrl.value.replace(/\/+$/u, "")}${path}`;
}

function jobDownloadEndpoint(nextJob: JobStatus, kind: "artifact" | "thumbnail"): string {
  const path =
    kind === "artifact" ? nextJob.downloads?.artifactUrl : nextJob.downloads?.thumbnailUrl;
  return rendererEndpoint(path ?? `/v1/exports/${nextJob.id}/${kind}`);
}

function clearThumbnail(): void {
  if (thumbnailUrl.value) URL.revokeObjectURL(thumbnailUrl.value);
  thumbnailUrl.value = "";
}

async function loadThumbnail(nextJob: JobStatus): Promise<void> {
  clearThumbnail();
  if (!nextJob.artifact?.thumbnail) return;
  try {
    const response = await fetch(jobDownloadEndpoint(nextJob, "thumbnail"));
    if (!response.ok) return;
    thumbnailUrl.value = URL.createObjectURL(await response.blob());
  } catch {
    // A thumbnail is a progressive enhancement; the download remains available.
  }
}

function newIdempotencyKey(): string {
  return `web-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function setStep(next: Step): void {
  const nextIndex = steps.value.findIndex((item) => item.id === next);
  if (nextIndex <= activeStepIndex.value + 1) step.value = next;
}

function chooseTheme(themeId: string): void {
  selectedThemeId.value = themeId;
  const theme = themeOptions.find((item) => item.manifest.id === themeId);
  if (theme) accentColor.value = theme.manifest.defaults.accentColor;
}

function resetError(): void {
  importError.value = "";
  workflowError.value = "";
}

async function readMarkdownFile(file: File): Promise<void> {
  resetError();
  if (file.size > 4 * 1024 * 1024) {
    importError.value =
      locale.value === "en" ? "The file is larger than 4 MiB." : "文件超过 4 MiB 大小限制。";
    return;
  }
  markdown.value = await file.text();
  fileName.value = file.name;
  if (!documentForm.title) documentForm.title = file.name.replace(/\.(?:md|markdown)$/iu, "");
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void readMarkdownFile(file);
}

function onDrop(event: DragEvent): void {
  isDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void readMarkdownFile(file);
}

function loadSample(): void {
  resetError();
  markdown.value = SAMPLE_MARKDOWN;
  fileName.value = "markdown-mint-sample.md";
  documentForm.title = "MarkdownMint sample document";
  documentForm.subtitle = "A short export workflow demo";
  documentForm.author = "MarkdownMint";
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("markdown-mint", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb-open-failed"));
  });
}

async function loadDraft(): Promise<void> {
  if (!window.indexedDB) return;
  try {
    draftDb = await openDraftDatabase();
    const request = draftDb.transaction("drafts", "readonly").objectStore("drafts").get("active");
    const draft = await new Promise<DraftRecord | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as DraftRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("indexeddb-read-failed"));
    });
    if (!draft) return;
    markdown.value = draft.markdown;
    fileName.value = draft.fileName;
    selectedThemeId.value = draft.selectedThemeId;
    outputFormat.value = draft.outputFormat;
    pageSize.value = draft.pageSize;
    orientation.value = draft.orientation;
    margin.value = draft.margin;
    accentColor.value = draft.accentColor;
    documentForm.author = draft.author;
    documentForm.subtitle = draft.subtitle;
    documentForm.title = draft.title;
    draftSavedAt.value = draft.updatedAt;
  } catch {
    draftDb = undefined;
  }
}

async function saveDraft(): Promise<void> {
  if (!hasLoadedDraft.value || !draftDb) return;
  const record: DraftRecord = {
    accentColor: accentColor.value,
    author: documentForm.author,
    fileName: fileName.value,
    id: "active",
    markdown: markdown.value,
    margin: margin.value,
    orientation: orientation.value,
    outputFormat: outputFormat.value,
    pageSize: pageSize.value,
    selectedThemeId: selectedThemeId.value,
    subtitle: documentForm.subtitle,
    title: documentForm.title,
    updatedAt: Date.now(),
  };
  try {
    const transaction = draftDb.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb-write-failed"));
    });
    draftSavedAt.value = record.updatedAt;
  } catch {
    // A draft is a convenience; a storage failure must not block exporting.
  }
}

async function clearDraft(): Promise<void> {
  if (!draftDb) return;
  try {
    const transaction = draftDb.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").delete("active");
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
    draftSavedAt.value = null;
  } catch {
    // The visible workflow can continue even if IndexedDB is unavailable.
  }
}

function createExportRequest(): Record<string, unknown> {
  return {
    appearance: {
      accentColor: accentColor.value,
      codeTheme: selectedTheme.value?.manifest.defaults.codeTheme ?? "github-light",
      density: selectedTheme.value?.manifest.defaults.density ?? "normal",
      themeId: selectedThemeId.value,
    },
    document: {
      author: documentForm.author || undefined,
      language: locale.value,
      subtitle: documentForm.subtitle || undefined,
      title: documentForm.title || undefined,
    },
    features: { ...features },
    output: { format: outputFormat.value },
    page: {
      margin: margin.value,
      orientation: orientation.value,
      size: pageSize.value,
    },
    source: { assets: [], markdown: markdown.value },
  };
}

async function submitExport(): Promise<void> {
  resetError();
  if (!canContinueImport.value) {
    workflowError.value = copy.value.noDocument;
    step.value = "import";
    return;
  }
  isSubmitting.value = true;
  step.value = "generate";
  clearThumbnail();
  idempotencyKey.value = newIdempotencyKey();
  try {
    const response = await fetch(rendererEndpoint("/v1/exports"), {
      body: JSON.stringify(createExportRequest()),
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey.value,
      },
      method: "POST",
    });
    if (!response.ok) throw new Error(`submit-${response.status}`);
    job.value = (await response.json()) as JobStatus;
    await pollJob(job.value.id);
  } catch (error) {
    isSubmitting.value = false;
    workflowError.value = error instanceof TypeError ? copy.value.noRenderer : copy.value.error;
  }
}

async function pollJob(jobId: string): Promise<void> {
  pollController?.abort();
  pollController = new AbortController();
  while (true) {
    const response = await fetch(rendererEndpoint(`/v1/exports/${jobId}`), {
      signal: pollController.signal,
    });
    if (!response.ok) throw new Error(`poll-${response.status}`);
    const nextJob = (await response.json()) as JobStatus;
    job.value = nextJob;
    if (["cancelled", "expired", "failed", "succeeded"].includes(nextJob.state)) {
      isSubmitting.value = false;
      step.value = nextJob.state === "succeeded" ? "result" : "generate";
      if (nextJob.state === "succeeded") await loadThumbnail(nextJob);
      else clearThumbnail();
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
}

async function cancelExport(): Promise<void> {
  if (!job.value) return;
  try {
    await fetch(rendererEndpoint(`/v1/exports/${job.value.id}/cancel`), { method: "POST" });
  } catch {
    workflowError.value = copy.value.error;
  }
}

async function retryExport(): Promise<void> {
  if (!job.value) return;
  resetError();
  clearThumbnail();
  isSubmitting.value = true;
  try {
    const response = await fetch(rendererEndpoint(`/v1/exports/${job.value.id}/retry`), {
      method: "POST",
    });
    if (!response.ok) throw new Error(`retry-${response.status}`);
    job.value = (await response.json()) as JobStatus;
    await pollJob(job.value.id);
  } catch {
    isSubmitting.value = false;
    workflowError.value = copy.value.error;
  }
}

async function downloadArtifact(): Promise<void> {
  if (!job.value?.artifact) return;
  try {
    const response = await fetch(jobDownloadEndpoint(job.value, "artifact"));
    if (!response.ok) throw new Error(`artifact-${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = job.value.artifact.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    workflowError.value = copy.value.error;
  }
}

function switchOutput(): void {
  clearThumbnail();
  outputFormat.value = outputFormat.value === "pdf" ? "html" : "pdf";
  step.value = "configure";
}

function startOver(): void {
  clearThumbnail();
  job.value = null;
  workflowError.value = "";
  step.value = "import";
}

function stateLabel(state: string): string {
  const labels: Record<string, string> =
    locale.value === "en"
      ? {
          cancelled: "Cancelled",
          compiling: "Compiling",
          expired: "Expired",
          failed: "Failed",
          packaging: "Packaging",
          queued: "Queued",
          rendering: "Rendering",
          succeeded: "Ready",
        }
      : {
          cancelled: "已取消",
          compiling: "编译中",
          expired: "已过期",
          failed: "失败",
          packaging: "打包中",
          queued: "排队中",
          rendering: "渲染中",
          succeeded: "已完成",
        };
  return labels[state] ?? state;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDiagnostic(diagnostic: MarkdownDiagnosticSummary): string {
  return `${diagnostic.level === "error" ? "×" : "!"} ${diagnostic.message}`;
}

watch(
  [
    markdown,
    fileName,
    selectedThemeId,
    outputFormat,
    pageSize,
    orientation,
    margin,
    accentColor,
    () => JSON.stringify(documentForm),
    () => JSON.stringify(features),
  ],
  () => void saveDraft(),
);

onMounted(async () => {
  await loadDraft();
  hasLoadedDraft.value = true;
});

onBeforeUnmount(() => {
  pollController?.abort();
  clearThumbnail();
  draftDb?.close();
});
</script>

<template>
  <div class="site-shell" :lang="locale">
    <header class="site-header">
      <a class="brand" :href="baseURL" aria-label="MarkdownMint home">
        <span class="brand-mark">M</span>
        <span>MarkdownMint</span>
      </a>
      <div class="header-actions">
        <a class="header-link" :href="`${baseURL}themes`">Themes</a>
        <span class="draft-status" role="status">{{ draftStatus }}</span>
        <button
          class="language-toggle"
          type="button"
          @click="locale = locale === 'zh-CN' ? 'en' : 'zh-CN'"
        >
          {{ locale === "zh-CN" ? "EN" : "中文" }}
        </button>
      </div>
    </header>

    <div v-if="isHome">
      <main>
        <section class="hero hero--compact">
          <p class="eyebrow">{{ copy.heroKicker }}</p>
          <h1>{{ copy.heroTitle }}</h1>
          <p class="lede">{{ copy.heroLead }}</p>
        </section>

        <section class="workflow" aria-label="Markdown export workflow">
          <nav class="stepper" :aria-label="copy.generate">
            <button
              v-for="(item, index) in steps"
              :key="item.id"
              class="stepper-item"
              :class="{ 'is-active': step === item.id, 'is-complete': index < activeStepIndex }"
              type="button"
              :disabled="index > activeStepIndex"
              @click="setStep(item.id)"
            >
              <span class="stepper-index">{{ index + 1 }}</span>
              <span>{{ item.label }}</span>
            </button>
          </nav>

          <div v-if="importError || workflowError" class="alert alert--error" role="alert">
            <strong>{{ copy.error }}</strong>
            <span>{{ importError || workflowError }}</span>
          </div>

          <section v-if="step === 'import'" class="workflow-panel" aria-labelledby="import-title">
            <div class="panel-heading">
              <p class="eyebrow">{{ copy.upload }}</p>
              <h2 id="import-title">{{ copy.importTitle }}</h2>
              <p>{{ copy.importHint }}</p>
            </div>
            <div
              class="import-grid"
              :class="{ 'is-dragging': isDragging }"
              @dragenter.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @dragover.prevent
              @drop.prevent="onDrop"
            >
              <label class="dropzone" for="markdown-file">
                <span class="dropzone-icon" aria-hidden="true">↥</span>
                <strong>{{ copy.drop }}</strong>
                <span>{{ copy.browse }}</span>
                <input
                  id="markdown-file"
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  @change="onFileChange"
                />
              </label>
              <div class="pastebox">
                <label for="markdown-source">{{ copy.paste }}</label>
                <textarea
                  id="markdown-source"
                  v-model="markdown"
                  :placeholder="
                    locale === 'en'
                      ? '# Your document\n\nPaste finished Markdown here.'
                      : '# 你的文档\n\n在这里粘贴写好的 Markdown。'
                  "
                  rows="10"
                />
                <div class="pastebox-footer">
                  <span>{{ fileName || copy.noDocument }}</span>
                  <button class="button button--quiet" type="button" @click="loadSample">
                    {{ copy.loadSample }}
                  </button>
                </div>
              </div>
            </div>

            <div class="summary-card" aria-live="polite">
              <div class="summary-heading">
                <div>
                  <p class="eyebrow">Preflight</p>
                  <h3>{{ copy.preview }}</h3>
                </div>
                <span class="summary-note">{{ copy.saveHint }}</span>
              </div>
              <div class="summary-stats">
                <span
                  ><strong>{{ summary.words }}</strong> {{ copy.words }}</span
                >
                <span
                  ><strong>{{ summary.headings }}</strong> {{ copy.headings }}</span
                >
                <span
                  ><strong>{{ summary.images }}</strong> {{ copy.images }}</span
                >
                <span
                  ><strong>{{ summary.codeBlocks }}</strong> {{ copy.codeBlocks }}</span
                >
              </div>
              <ul v-if="summary.diagnostics.length" class="diagnostic-list">
                <li
                  v-for="diagnostic in summary.diagnostics"
                  :key="formatDiagnostic(diagnostic)"
                  :data-level="diagnostic.level"
                >
                  {{ formatDiagnostic(diagnostic) }}
                </li>
              </ul>
            </div>

            <div class="panel-actions panel-actions--end">
              <button
                class="button button--primary"
                type="button"
                :disabled="!canContinueImport"
                @click="setStep('theme')"
              >
                {{ copy.continue }} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section
            v-else-if="step === 'theme'"
            class="workflow-panel"
            aria-labelledby="theme-title"
          >
            <div class="panel-heading">
              <p class="eyebrow">{{ copy.theme }}</p>
              <h2 id="theme-title">{{ copy.selectTheme }}</h2>
              <p>{{ copy.selectThemeHint }}</p>
            </div>
            <div class="theme-grid theme-grid--workflow">
              <label
                v-for="theme in themeOptions"
                :key="theme.manifest.id"
                class="theme-card theme-card--selectable"
                :class="{ 'is-selected': selectedThemeId === theme.manifest.id }"
              >
                <input
                  v-model="selectedThemeId"
                  class="visually-hidden"
                  type="radio"
                  name="theme"
                  :value="theme.manifest.id"
                  @change="chooseTheme(theme.manifest.id)"
                />
                <div class="paper-preview" :data-tone="theme.manifest.id">
                  <span class="preview-kicker">MarkdownMint</span>
                  <span class="preview-title">{{ theme.manifest.name }}</span>
                  <span class="preview-rule" />
                  <span class="preview-line preview-line--long" />
                  <span class="preview-line" />
                  <span class="preview-line preview-line--short" />
                </div>
                <div class="theme-card-copy">
                  <div class="theme-card-title">
                    <h3>{{ theme.manifest.name }}</h3>
                    <span class="selection-mark" aria-hidden="true">✓</span>
                  </div>
                  <p>{{ theme.details?.tagline || theme.manifest.description }}</p>
                  <div class="tag-list">
                    <span v-for="item in theme.details?.bestFor.slice(0, 2)" :key="item">{{
                      item
                    }}</span>
                  </div>
                </div>
              </label>
            </div>
            <div class="panel-actions">
              <button class="button button--quiet" type="button" @click="setStep('import')">
                ← {{ copy.back }}
              </button>
              <button class="button button--primary" type="button" @click="setStep('configure')">
                {{ copy.continue }} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section
            v-else-if="step === 'configure'"
            class="workflow-panel"
            aria-labelledby="configure-title"
          >
            <div class="panel-heading">
              <p class="eyebrow">{{ copy.configure }}</p>
              <h2 id="configure-title">{{ copy.configure }}</h2>
              <p>{{ copy.configureHint }}</p>
            </div>
            <div class="config-grid">
              <div class="form-card">
                <h3>{{ copy.title }}</h3>
                <label
                  ><span>{{ copy.title }}</span
                  ><input v-model="documentForm.title" type="text" maxlength="300"
                /></label>
                <label
                  ><span>{{ copy.subtitle }}</span
                  ><input v-model="documentForm.subtitle" type="text" maxlength="300"
                /></label>
                <label
                  ><span>{{ locale === "en" ? "Author" : "作者" }}</span
                  ><input v-model="documentForm.author" type="text" maxlength="200"
                /></label>
                <label
                  ><span>{{ copy.accent }}</span
                  ><input v-model="accentColor" type="color"
                /></label>
              </div>
              <div class="form-card">
                <h3>{{ copy.pageSize }}</h3>
                <label
                  ><span>{{ copy.pageSize }}</span
                  ><select v-model="pageSize">
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select></label
                >
                <label
                  ><span>{{ copy.orientation }}</span
                  ><select v-model="orientation">
                    <option value="portrait">{{ locale === "en" ? "Portrait" : "纵向" }}</option>
                    <option value="landscape">{{ locale === "en" ? "Landscape" : "横向" }}</option>
                  </select></label
                >
                <label
                  ><span>{{ copy.margin }}</span
                  ><select v-model="margin">
                    <option value="compact">{{ locale === "en" ? "Compact" : "紧凑" }}</option>
                    <option value="normal">{{ locale === "en" ? "Normal" : "标准" }}</option>
                    <option value="relaxed">{{ locale === "en" ? "Relaxed" : "宽松" }}</option>
                  </select></label
                >
                <label
                  ><span>{{ locale === "en" ? "Output" : "输出格式" }}</span
                  ><select v-model="outputFormat">
                    <option value="pdf">PDF</option>
                    <option value="html">HTML</option>
                  </select></label
                >
              </div>
              <div class="form-card form-card--wide">
                <h3>{{ copy.tableOfContents }}</h3>
                <div class="check-grid">
                  <label
                    ><input v-model="features.cover" type="checkbox" />
                    {{ locale === "en" ? "Cover" : "封面" }}</label
                  >
                  <label><input v-model="features.toc" type="checkbox" /> {{ copy.toc }}</label>
                  <label
                    ><input v-model="features.header" type="checkbox" />
                    {{ locale === "en" ? "Header" : "页眉" }}</label
                  >
                  <label
                    ><input v-model="features.footer" type="checkbox" />
                    {{ locale === "en" ? "Footer" : "页脚" }}</label
                  >
                  <label
                    ><input v-model="features.pageNumber" type="checkbox" />
                    {{ copy.pageNumber }}</label
                  >
                </div>
              </div>
            </div>
            <div class="selected-theme-note">
              <span
                class="selected-theme-swatch"
                :style="{ backgroundColor: accentColor }"
                aria-hidden="true"
              />
              <span
                ><strong>{{ selectedTheme?.manifest.name }}</strong> ·
                {{ selectedThemeDetails?.tagline }}</span
              >
            </div>
            <div class="panel-actions">
              <button class="button button--quiet" type="button" @click="setStep('theme')">
                ← {{ copy.back }}
              </button>
              <button class="button button--primary" type="button" @click="submitExport">
                {{ copy.startExport }} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>

          <section
            v-else-if="step === 'generate'"
            class="workflow-panel workflow-panel--centered"
            aria-labelledby="generate-title"
            aria-live="polite"
          >
            <div class="progress-orb" :data-state="job?.state || 'queued'" aria-hidden="true">
              <span>✦</span>
            </div>
            <p class="eyebrow">{{ copy.generate }}</p>
            <h2 id="generate-title">{{ copy.generating }}</h2>
            <p class="panel-lede">{{ copy.generateHint }}</p>
            <div class="job-status-card">
              <div class="job-status-line">
                <strong>{{ job ? stateLabel(job.state) : stateLabel("queued") }}</strong
                ><span>{{ job?.id || "—" }}</span>
              </div>
              <div class="progress-track">
                <span
                  :style="{
                    width: `${job?.state === 'succeeded' ? 100 : job?.state === 'packaging' ? 88 : job?.state === 'rendering' ? 66 : job?.state === 'compiling' ? 38 : 12}%`,
                  }"
                />
              </div>
              <div v-if="job?.error" class="job-error">
                {{ job.error.message }} ({{ job.error.code }})
              </div>
              <ol v-if="job?.logs.length" class="stage-list">
                <li v-for="log in job.logs" :key="`${log.stage}-${log.startedAt}`">
                  <span>{{ stateLabel(log.stage) }}</span
                  ><small>{{ log.durationMs ? `${log.durationMs} ms` : "…" }}</small>
                </li>
              </ol>
            </div>
            <div class="panel-actions panel-actions--center">
              <button
                v-if="isSubmitting"
                class="button button--quiet"
                type="button"
                @click="cancelExport"
              >
                {{ copy.cancel }}
              </button>
              <button
                v-else-if="job?.state === 'failed' || job?.state === 'cancelled'"
                class="button button--primary"
                type="button"
                @click="retryExport"
              >
                {{ copy.regenerate }}
              </button>
              <button
                v-else
                class="button button--quiet"
                type="button"
                @click="setStep('configure')"
              >
                {{ copy.back }}
              </button>
            </div>
          </section>

          <section
            v-else
            class="workflow-panel workflow-panel--centered"
            aria-labelledby="result-title"
          >
            <div class="result-mark" aria-hidden="true">✓</div>
            <p class="eyebrow">{{ copy.result }}</p>
            <h2 id="result-title">{{ copy.result }}</h2>
            <p class="panel-lede">{{ copy.resultHint }}</p>
            <figure v-if="thumbnailUrl && job?.artifact?.thumbnail" class="artifact-preview">
              <img
                class="artifact-thumbnail"
                :src="thumbnailUrl"
                :alt="locale === 'en' ? 'First page preview' : 'PDF 首页预览'"
              />
              <figcaption>
                {{ locale === "en" ? "First page preview" : "首页预览" }}
              </figcaption>
            </figure>
            <div v-if="job?.artifact" class="artifact-card">
              <div>
                <strong>{{ job.artifact.fileName }}</strong
                ><span
                  >{{ formatBytes(job.artifact.sizeBytes) }}
                  <template v-if="job.artifact.pageCount">
                    · {{ job.artifact.pageCount }}
                    {{ locale === "en" ? "pages" : "页" }}
                  </template>
                  · {{ selectedTheme?.manifest.name }} · SHA256
                  {{ job.artifact.sha256.slice(0, 12) }}…</span
                >
              </div>
              <span class="artifact-format">{{ job.artifact.format.toUpperCase() }}</span>
            </div>
            <div class="panel-actions panel-actions--center">
              <button class="button button--primary" type="button" @click="downloadArtifact">
                {{ locale === "en" ? "Download" : "下载产物" }} <span aria-hidden="true">↓</span>
              </button>
              <button class="button button--quiet" type="button" @click="switchOutput">
                {{ copy.exportAnother }}
              </button>
              <button class="button button--quiet" type="button" @click="startOver">
                {{ copy.reset }}
              </button>
            </div>
          </section>
        </section>
      </main>

      <footer>
        <span>MarkdownMint</span>
        <span>Apache-2.0 · {{ locale === "en" ? "Built in the open" : "开放协作构建" }}</span>
        <button class="footer-link" type="button" @click="clearDraft">{{ copy.clearDraft }}</button>
      </footer>
    </div>
    <NuxtPage v-else />
  </div>
</template>
