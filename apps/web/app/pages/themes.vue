<script setup lang="ts">
import { useRuntimeConfig } from "#imports";

import { launchThemeDetails, launchThemes } from "@markdown-mint/themes";

const config = useRuntimeConfig();
const baseURL = String(config.app.baseURL ?? "/");
const themeCards = launchThemes.map((manifest) => ({
  details: launchThemeDetails.find((details) => details.id === manifest.id),
  manifest,
}));
</script>

<template>
  <main class="theme-gallery-page">
    <section class="gallery-hero">
      <a class="back-link" :href="baseURL">← MarkdownMint</a>
      <p class="eyebrow">Theme library</p>
      <h1>Three visual languages for finished Markdown.</h1>
      <p class="gallery-lede">
        Each launch theme consumes the same compiled document, declares its capabilities, and ships
        with an HTML preview and a renderer-backed PDF sample path.
      </p>
    </section>

    <section class="theme-gallery" aria-labelledby="gallery-title">
      <div class="section-heading">
        <p class="eyebrow">The launch set</p>
        <h2 id="gallery-title">Choose the document's natural rhythm.</h2>
      </div>
      <div class="theme-gallery-grid">
        <article v-for="theme in themeCards" :key="theme.manifest.id" class="gallery-card">
          <div class="paper-preview" :data-tone="theme.manifest.id" aria-hidden="true">
            <span class="preview-kicker">MarkdownMint</span>
            <span class="preview-title">{{ theme.manifest.name }}</span>
            <span class="preview-rule" />
            <span class="preview-line preview-line--long" />
            <span class="preview-line" />
            <span class="preview-line preview-line--short" />
          </div>
          <div class="gallery-card-copy">
            <div class="gallery-card-heading">
              <div>
                <p class="eyebrow">{{ theme.manifest.category }}</p>
                <h3>{{ theme.manifest.name }}</h3>
              </div>
              <span class="gallery-version">v{{ theme.manifest.version }}</span>
            </div>
            <p>{{ theme.details?.tagline || theme.manifest.description }}</p>
            <div class="tag-list">
              <span v-for="item in theme.details?.bestFor" :key="item">{{ item }}</span>
            </div>
            <a
              class="button button--quiet gallery-cta"
              :href="`${baseURL}themes/${theme.manifest.id}`"
            >
              View theme details <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      </div>
    </section>

    <footer>
      <span>MarkdownMint</span>
      <a class="footer-link" :href="baseURL">Start an export</a>
    </footer>
  </main>
</template>
