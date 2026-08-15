<script setup lang="ts">
/* eslint-disable vue/html-closing-bracket-newline, vue/html-indent, vue/html-self-closing */
import { useRoute, useRuntimeConfig, useState } from "#imports";
import { computed, onBeforeUnmount, ref } from "vue";

import { createThemePreviewHtml } from "@markdown-mint/theme-runtime";
import {
  launchPreviewBodyHtml,
  launchPreviewMarkdown,
  launchThemeBundles,
  launchThemeDetails,
  launchThemes,
} from "@markdown-mint/themes";

import { stateLabel, type Locale } from "../../utils/export-types";
import { localizedHref, parseLocale } from "../../utils/locale";
import { localizeTheme, themeDetailCopy } from "../../utils/theme-i18n";

interface SampleJob {
  artifact?: {
    fileName: string;
    sha256: string;
    sizeBytes: number;
    thumbnail?: { fileName: string; mediaType: "image/png"; sha256: string; sizeBytes: number };
  };
  downloads?: { artifactUrl?: string; thumbnailUrl?: string };
  error?: { code: string; message: string };
  id: string;
  state: string;
}

const route = useRoute();
const config = useRuntimeConfig();
const baseURL = String(config.app.baseURL ?? "/");
const rendererUrl = String(config.public.rendererUrl ?? "http://127.0.0.1:4310").replace(
  /\/+$/u,
  "",
);
const themeId = String(route.params.id);
const locale = useState<Locale>("app-locale", () => parseLocale(route.query.lang) ?? "zh-CN");
const manifest = launchThemes.find((theme) => theme.id === themeId);
const bundle = launchThemeBundles.find((theme) => theme.manifest.id === themeId);
const details = launchThemeDetails.find((theme) => theme.id === themeId);
const copy = computed(() => themeDetailCopy(locale.value));
const themesHref = computed(() => localizedHref(baseURL, "themes", locale.value));
const homeHref = computed(() => localizedHref(baseURL, "", locale.value));
const useThemeHref = computed(() =>
  localizedHref(baseURL, "", locale.value, { theme: manifest?.id ?? themeId }),
);
const localizedDetails = computed(() =>
  localizeTheme(themeId, locale.value, {
    bestFor: details?.bestFor ?? [],
    category: manifest?.category ?? "",
    contentCoverage: details?.contentCoverage ?? [],
    description: manifest?.description ?? "",
    designPrinciples: details?.designPrinciples ?? [],
    tagline: details?.tagline ?? manifest?.description ?? "",
  }),
);
const preview = computed(() =>
  bundle
    ? createThemePreviewHtml(bundle, {
        bodyHtml: launchPreviewBodyHtml,
        language: locale.value,
        title: `${manifest?.name ?? "Theme"} preview`,
      })
    : undefined,
);

const sampleJob = ref<SampleJob | null>(null);
const sampleBusy = ref(false);
const sampleError = ref("");
const sampleThumbnailUrl = ref("");

function endpoint(path: string): string {
  if (/^https?:\/\//u.test(path)) return path;
  return `${rendererUrl}${path}`;
}

function sampleDownloadEndpoint(nextJob: SampleJob, kind: "artifact" | "thumbnail"): string {
  const path =
    kind === "artifact" ? nextJob.downloads?.artifactUrl : nextJob.downloads?.thumbnailUrl;
  return endpoint(path ?? `/v1/exports/${nextJob.id}/${kind}`);
}

function clearSampleThumbnail(): void {
  if (sampleThumbnailUrl.value) URL.revokeObjectURL(sampleThumbnailUrl.value);
  sampleThumbnailUrl.value = "";
}

async function loadSampleThumbnail(nextJob: SampleJob): Promise<void> {
  clearSampleThumbnail();
  if (!nextJob.artifact?.thumbnail) return;
  try {
    const response = await fetch(sampleDownloadEndpoint(nextJob, "thumbnail"));
    if (response.ok) sampleThumbnailUrl.value = URL.createObjectURL(await response.blob());
  } catch {
    // The download button remains useful when the progressive preview is unavailable.
  }
}

function requestBody() {
  return {
    appearance: {
      accentColor: manifest?.defaults.accentColor,
      codeTheme: manifest?.defaults.codeTheme ?? "github-light",
      density: manifest?.defaults.density ?? "normal",
      themeId,
    },
    document: {
      author: "MarkdownMint",
      language: locale.value,
      title: `${manifest?.name ?? "Theme"} sample`,
    },
    features: { cover: true, footer: true, header: false, pageNumber: true, toc: true },
    output: { format: "pdf" },
    page: { margin: "normal", orientation: "portrait", size: "A4" },
    source: { assets: [], markdown: launchPreviewMarkdown },
  };
}

async function createPdfSample(): Promise<void> {
  if (!manifest) return;
  sampleBusy.value = true;
  sampleError.value = "";
  clearSampleThumbnail();
  try {
    const response = await fetch(endpoint("/v1/exports"), {
      body: JSON.stringify(requestBody()),
      headers: {
        "content-type": "application/json",
        "idempotency-key": `theme-sample-${themeId}-${Date.now()}`,
      },
      method: "POST",
    });
    if (!response.ok) throw new Error("submit");
    sampleJob.value = (await response.json()) as SampleJob;
    await pollSample(sampleJob.value.id);
  } catch {
    sampleError.value = copy.value.rendererError;
    sampleBusy.value = false;
  }
}

async function pollSample(jobId: string): Promise<void> {
  while (true) {
    const response = await fetch(endpoint(`/v1/exports/${jobId}`));
    if (!response.ok) throw new Error("poll");
    sampleJob.value = (await response.json()) as SampleJob;
    if (["cancelled", "expired", "failed", "succeeded"].includes(sampleJob.value.state)) {
      sampleBusy.value = false;
      if (sampleJob.value.state === "succeeded") await loadSampleThumbnail(sampleJob.value);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
}

async function downloadPdfSample(): Promise<void> {
  if (!sampleJob.value?.artifact) return;
  const response = await fetch(sampleDownloadEndpoint(sampleJob.value, "artifact"));
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sampleJob.value.artifact.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const capabilities = computed(() => {
  if (!manifest) return [];
  return Object.entries(manifest.capabilities)
    .filter(([, supported]) => supported)
    .map(([name]) => name);
});

onBeforeUnmount(clearSampleThumbnail);
</script>

<template>
  <main v-if="manifest && details && preview" class="theme-detail-page">
    <section class="detail-hero">
      <a class="back-link" :href="themesHref">{{ copy.back }}</a>
      <div class="detail-heading">
        <div>
          <p class="eyebrow">{{ localizedDetails.category }} · v{{ manifest.version }}</p>
          <h1>{{ manifest.name }}</h1>
          <p class="gallery-lede">{{ localizedDetails.tagline }}</p>
        </div>
        <a class="button button--primary" :href="useThemeHref"
          >{{ copy.use }} <span aria-hidden="true">→</span></a
        >
      </div>
    </section>

    <section class="detail-grid">
      <article class="detail-card detail-card--preview">
        <div class="detail-card-heading">
          <div>
            <p class="eyebrow">{{ copy.htmlSample }}</p>
            <h2>{{ copy.htmlHeading }}</h2>
          </div>
          <span class="sample-badge">{{ copy.noScripts }}</span>
        </div>
        <iframe
          class="theme-iframe"
          :title="`${manifest.name} HTML preview`"
          :srcdoc="preview.html"
        ></iframe>
      </article>

      <aside class="detail-card">
        <p class="eyebrow">{{ copy.contract }}</p>
        <h2>
          {{
            locale === "en"
              ? `Built for ${localizedDetails.bestFor[0]}.`
              : `专为${localizedDetails.bestFor[0]}而设计。`
          }}
        </h2>
        <p>{{ localizedDetails.description }}</p>
        <h3>{{ copy.strengths }}</h3>
        <ul class="detail-list">
          <li v-for="item in localizedDetails.designPrinciples" :key="item">{{ item }}</li>
        </ul>
        <h3>{{ copy.coverage }}</h3>
        <div class="tag-list">
          <span v-for="item in localizedDetails.contentCoverage" :key="item">{{ item }}</span>
        </div>
        <h3>{{ copy.capabilities }}</h3>
        <div class="capability-list">
          <span v-for="capability in capabilities" :key="capability">✓ {{ capability }}</span>
        </div>
      </aside>
    </section>

    <section class="sample-panel">
      <div>
        <p class="eyebrow">{{ copy.printSample }}</p>
        <h2>{{ copy.printHeading }}</h2>
        <p>{{ copy.printLead }}</p>
        <p v-if="sampleError" class="sample-error" role="alert">{{ sampleError }}</p>
      </div>
      <div class="sample-actions">
        <figure
          v-if="sampleThumbnailUrl && sampleJob?.artifact?.thumbnail"
          class="artifact-preview"
        >
          <img class="artifact-thumbnail" :src="sampleThumbnailUrl" :alt="copy.firstPage" />
          <figcaption>{{ copy.firstPage }}</figcaption>
        </figure>
        <button
          class="button button--primary"
          type="button"
          :disabled="sampleBusy"
          @click="createPdfSample"
        >
          {{
            sampleBusy
              ? `${copy.generating} · ${stateLabel(sampleJob?.state || "queued", locale)}`
              : copy.generate
          }}
        </button>
        <button
          v-if="sampleJob?.state === 'succeeded'"
          class="button button--quiet"
          type="button"
          @click="downloadPdfSample"
        >
          {{ copy.download }} {{ sampleJob.artifact?.fileName }}
        </button>
      </div>
    </section>

    <footer>
      <span>MarkdownMint</span>
      <a class="footer-link" :href="homeHref">{{ copy.startExport }}</a>
    </footer>
  </main>
  <main v-else class="theme-detail-page">
    <a class="back-link" :href="themesHref">{{ copy.back }}</a>
    <h1>{{ copy.notFound }}</h1>
  </main>
</template>
