<script setup lang="ts">
import { useRoute, useRuntimeConfig, useState } from "#imports";
import { computed } from "vue";

import { launchThemeDetails, launchThemes } from "@markdown-mint/themes";

import type { Locale } from "../../utils/export-types";
import { localizedHref, parseLocale } from "../../utils/locale";
import { localizeTheme, themeGalleryCopy } from "../../utils/theme-i18n";

const config = useRuntimeConfig();
const route = useRoute();
const baseURL = String(config.app.baseURL ?? "/");
const locale = useState<Locale>("app-locale", () => parseLocale(route.query.lang) ?? "zh-CN");
const copy = computed(() => themeGalleryCopy(locale.value));
const homeHref = computed(() => localizedHref(baseURL, "", locale.value));
const themeCards = computed(() =>
  launchThemes.map((manifest) => {
    const details = launchThemeDetails.find((item) => item.id === manifest.id);
    return {
      href: localizedHref(baseURL, `themes/${manifest.id}`, locale.value),
      manifest,
      text: localizeTheme(manifest.id, locale.value, {
        bestFor: details?.bestFor ?? [],
        category: manifest.category,
        contentCoverage: details?.contentCoverage ?? [],
        description: manifest.description,
        designPrinciples: details?.designPrinciples ?? [],
        tagline: details?.tagline ?? manifest.description,
      }),
    };
  }),
);
</script>

<template>
  <main class="theme-gallery-page">
    <section class="gallery-hero">
      <a class="back-link" :href="homeHref">{{ copy.back }}</a>
      <p class="eyebrow">{{ copy.eyebrow }}</p>
      <h1>{{ copy.hero }}</h1>
      <p class="gallery-lede">{{ copy.lead }}</p>
    </section>

    <section class="theme-gallery" aria-labelledby="gallery-title">
      <div class="section-heading">
        <p class="eyebrow">{{ copy.set }}</p>
        <h2 id="gallery-title">{{ copy.choose }}</h2>
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
                <p class="eyebrow">{{ theme.text.category }}</p>
                <h3>{{ theme.manifest.name }}</h3>
              </div>
              <span class="gallery-version">v{{ theme.manifest.version }}</span>
            </div>
            <p>{{ theme.text.tagline }}</p>
            <div class="tag-list">
              <span v-for="item in theme.text.bestFor" :key="item">{{ item }}</span>
            </div>
            <a class="button button--quiet gallery-cta" :href="theme.href">
              {{ copy.view }} <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      </div>
    </section>

    <footer>
      <span>MarkdownMint</span>
      <a class="footer-link" :href="homeHref">{{ copy.footer }}</a>
    </footer>
  </main>
</template>
