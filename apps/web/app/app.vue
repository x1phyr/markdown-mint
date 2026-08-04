<!-- eslint-disable vue/html-closing-bracket-newline, vue/html-indent, vue/html-self-closing -->
<script setup lang="ts">
/* eslint-disable vue/html-closing-bracket-newline, vue/html-indent, vue/html-self-closing */
import { useHead, useRoute, useRuntimeConfig } from "#imports";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import { launchThemeDetails, launchThemes } from "@markdown-mint/themes";

import { createRendererClient } from "./utils/export-api";
import {
  deleteDraft,
  openDraftDatabase,
  readDraft,
  writeDraft,
  type DraftRecord,
} from "./utils/draft-store";
import {
  formatBytes,
  guessImageMediaType,
  newIdempotencyKey,
  stateLabel,
  toWireAssets,
  type AttachedAsset,
  type JobStatus,
  type Locale,
  type OutputFormat,
  type Step,
} from "./utils/export-types";
import { workflowCopy } from "./utils/i18n";
import {
  listLocalImageRefs,
  normalizeAssetPath,
  resolveAttachedAssetPath,
  unmatchedLocalImageRefs,
} from "./utils/image-assets";
import { summarizeMarkdown, type MarkdownDiagnosticSummary } from "./utils/markdown-summary";

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
const attachedAssets = ref<AttachedAsset[]>([]);
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
const localImageRefs = computed(() => listLocalImageRefs(markdown.value));
const missingImageRefs = computed(() =>
  unmatchedLocalImageRefs(
    localImageRefs.value,
    attachedAssets.value.map((asset) => asset.path),
  ),
);
const matchedAssetPaths = computed(() => new Set(localImageRefs.value));
const blockingDiagnostics = computed(() =>
  summary.value.diagnostics.filter((diagnostic) => diagnostic.level === "error"),
);
const canContinueImport = computed(
  () => markdown.value.trim().length > 0 && blockingDiagnostics.value.length === 0,
);
const activeStepIndex = computed(() => steps.value.findIndex((item) => item.id === step.value));
const copy = computed(() => workflowCopy(locale.value));
const draftStatus = computed(() => {
  if (!draftSavedAt.value) return copy.value.draftNotSaved;
  return `${copy.value.draftSaved} ${new Intl.DateTimeFormat(locale.value, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(draftSavedAt.value)}`;
});

const steps = computed(() => [
  { id: "import" as const, label: copy.value.upload },
  { id: "theme" as const, label: copy.value.theme },
  { id: "configure" as const, label: copy.value.configure },
  { id: "generate" as const, label: copy.value.generate },
  { id: "result" as const, label: copy.value.result },
]);

const renderer = createRendererClient(() => rendererUrl.value);

let pollController: AbortController | undefined;
let draftDb: IDBDatabase | undefined;

function clearThumbnail(): void {
  if (thumbnailUrl.value) URL.revokeObjectURL(thumbnailUrl.value);
  thumbnailUrl.value = "";
}

async function loadThumbnail(nextJob: JobStatus): Promise<void> {
  clearThumbnail();
  if (!nextJob.artifact?.thumbnail) return;
  try {
    const blob = await renderer.fetchBlob(nextJob, "thumbnail");
    thumbnailUrl.value = URL.createObjectURL(blob);
  } catch {
    // A thumbnail is a progressive enhancement; the download remains available.
  }
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

async function readImageFiles(files: FileList | File[]): Promise<void> {
  const next = [...attachedAssets.value];
  for (const file of Array.from(files)) {
    const mediaType = file.type || guessImageMediaType(file.name);
    if (!mediaType?.startsWith("image/")) continue;
    if (file.size > 8 * 1024 * 1024) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unmatched = unmatchedLocalImageRefs(
      listLocalImageRefs(markdown.value),
      next.map((asset) => asset.path),
    );
    const path = resolveAttachedAssetPath(file, unmatched);
    if (!path) continue;
    const existing = next.findIndex((asset) => asset.path === path);
    const asset: AttachedAsset = {
      bytes,
      id:
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      mediaType,
      path,
    };
    if (existing >= 0) next[existing] = { ...asset, id: next[existing]?.id ?? asset.id };
    else next.push(asset);
  }
  attachedAssets.value = next.slice(0, 32);
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void readMarkdownFile(file);
}

function onImageChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files?.length) void readImageFiles(files);
  input.value = "";
}

function removeAttachedAsset(id: string): void {
  attachedAssets.value = attachedAssets.value.filter((asset) => asset.id !== id);
}

function clearAttachedAssets(): void {
  attachedAssets.value = [];
}

function updateAttachedAssetPath(id: string, nextPath: string): void {
  const normalized = normalizeAssetPath(nextPath.trim());
  if (!normalized) return;
  const current = attachedAssets.value.find((asset) => asset.id === id);
  if (!current || current.path === normalized) return;
  if (attachedAssets.value.some((asset) => asset.id !== id && asset.path === normalized)) return;
  attachedAssets.value = attachedAssets.value.map((asset) =>
    asset.id === id ? { ...asset, path: normalized } : asset,
  );
}

function formatAssetSize(bytes: Uint8Array): string {
  const size = bytes.byteLength;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function onDrop(event: DragEvent): void {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  const markdownFile = Array.from(files).find(
    (file) => /\.(?:md|markdown)$/iu.test(file.name) || file.type.includes("markdown"),
  );
  if (markdownFile) void readMarkdownFile(markdownFile);
  void readImageFiles(files);
}

function loadSample(): void {
  resetError();
  markdown.value = SAMPLE_MARKDOWN;
  fileName.value = "markdown-mint-sample.md";
  documentForm.title = "MarkdownMint sample document";
  documentForm.subtitle = "A short export workflow demo";
  documentForm.author = "MarkdownMint";
}

async function loadDraft(): Promise<void> {
  if (!window.indexedDB) return;
  try {
    draftDb = await openDraftDatabase();
    const draft = await readDraft(draftDb);
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
    if (draft.locale === "en" || draft.locale === "zh-CN") locale.value = draft.locale;
    if (draft.features) Object.assign(features, draft.features);
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
    features: { ...features },
    fileName: fileName.value,
    id: "active",
    locale: locale.value,
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
    await writeDraft(draftDb, record);
    draftSavedAt.value = record.updatedAt;
  } catch {
    // A draft is a convenience; a storage failure must not block exporting.
  }
}

async function clearDraft(): Promise<void> {
  if (!draftDb) return;
  try {
    await deleteDraft(draftDb);
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
    source: {
      assets: toWireAssets(attachedAssets.value),
      markdown: markdown.value,
    },
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
    job.value = await renderer.submitExport(createExportRequest(), idempotencyKey.value);
    await pollJob(job.value.id);
  } catch (error) {
    isSubmitting.value = false;
    workflowError.value = error instanceof TypeError ? copy.value.noRenderer : copy.value.error;
  }
}

async function pollJob(jobId: string): Promise<void> {
  pollController?.abort();
  pollController = new AbortController();
  const nextJob = await renderer.pollJob(jobId, pollController.signal, (update) => {
    job.value = update;
  });
  isSubmitting.value = false;
  step.value = nextJob.state === "succeeded" ? "result" : "generate";
  if (nextJob.state === "succeeded") await loadThumbnail(nextJob);
  else clearThumbnail();
}

async function cancelExport(): Promise<void> {
  if (!job.value) return;
  try {
    await renderer.cancelExport(job.value.id);
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
    job.value = await renderer.retryExport(job.value.id);
    await pollJob(job.value.id);
  } catch {
    isSubmitting.value = false;
    workflowError.value = copy.value.error;
  }
}

async function downloadArtifact(): Promise<void> {
  if (!job.value?.artifact) return;
  try {
    const blob = await renderer.fetchBlob(job.value, "artifact");
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

function formatDiagnostic(diagnostic: MarkdownDiagnosticSummary): string {
  return `${diagnostic.level === "error" ? "×" : "!"} ${diagnostic.message}`;
}

function labeledState(state: string): string {
  return stateLabel(state, locale.value);
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
    locale,
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

            <div class="asset-attach">
              <div class="asset-attach-heading">
                <div>
                  <p class="asset-attach-label">{{ copy.attachImages }}</p>
                  <p class="asset-attach-hint">{{ copy.attachImagesHint }}</p>
                </div>
                <button
                  v-if="attachedAssets.length"
                  class="button button--quiet button--compact"
                  type="button"
                  @click="clearAttachedAssets"
                >
                  {{ copy.clearAttachedImages }}
                </button>
              </div>
              <label class="asset-dropzone" for="image-assets">
                <span class="asset-dropzone-icon" aria-hidden="true">⧉</span>
                <span class="asset-dropzone-copy">
                  <strong>{{ copy.attachImagesBrowse }}</strong>
                  <span>{{ copy.attachImagesFormats }}</span>
                </span>
                <input
                  id="image-assets"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.png,.jpg,.jpeg,.gif,.webp,.svg"
                  multiple
                  @change="onImageChange"
                />
              </label>
              <ul
                v-if="missingImageRefs.length"
                class="asset-missing"
                :aria-label="copy.attachImagesMissing"
              >
                <li v-for="refPath in missingImageRefs" :key="refPath">
                  <span>{{ copy.attachImagesMissing }}</span>
                  <code>{{ refPath }}</code>
                </li>
              </ul>
              <ul v-if="attachedAssets.length" class="asset-list" :aria-label="copy.attachedImages">
                <li
                  v-for="asset in attachedAssets"
                  :key="asset.id"
                  class="asset-chip"
                  :class="{ 'is-unmatched': !matchedAssetPaths.has(asset.path) }"
                >
                  <span class="asset-chip-icon" aria-hidden="true">▣</span>
                  <label class="asset-chip-meta">
                    <span class="visually-hidden">{{ copy.attachImagesPath }}</span>
                    <input
                      class="asset-chip-path"
                      type="text"
                      :value="asset.path"
                      spellcheck="false"
                      @change="
                        updateAttachedAssetPath(asset.id, ($event.target as HTMLInputElement).value)
                      "
                    />
                    <span class="asset-chip-size">
                      {{ formatAssetSize(asset.bytes) }}
                      <template v-if="!matchedAssetPaths.has(asset.path)">
                        · {{ copy.attachImagesUnmatched }}
                      </template>
                    </span>
                  </label>
                  <button
                    class="asset-chip-remove"
                    type="button"
                    :aria-label="`${copy.removeAttachedImage} ${asset.path}`"
                    @click="removeAttachedAsset(asset.id)"
                  >
                    ×
                  </button>
                </li>
              </ul>
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
                <strong>{{ job ? labeledState(job.state) : labeledState("queued") }}</strong
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
                  <span>{{ labeledState(log.stage) }}</span
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
