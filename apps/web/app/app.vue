<script setup lang="ts">
const themes = [
  {
    description: "Clear hierarchy for architecture notes, API guides, and engineering reports.",
    name: "Technical Mint",
    tone: "technical",
  },
  {
    description: "Quiet spacing and restrained typography for PRDs and business reports.",
    name: "Minimal Report",
    tone: "minimal",
  },
  {
    description: "Editorial rhythm for essays, tutorials, and long-form publishing.",
    name: "Editorial Serif",
    tone: "editorial",
  },
] as const;
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="MarkdownMint home">
        <span class="brand-mark">M</span>
        <span>MarkdownMint</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#themes">Themes</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">Markdown publishing studio</p>
        <h1>Turn finished Markdown into documents worth sharing.</h1>
        <p class="lede">
          Choose a carefully designed theme, set the document details, and export a polished PDF or
          standalone HTML file.
        </p>
        <div class="hero-actions" aria-label="Project status">
          <button type="button" disabled>Import Markdown — coming in v0.1</button>
          <a href="#themes">Explore the launch themes</a>
        </div>
      </section>

      <section id="themes" class="theme-section" aria-labelledby="theme-heading">
        <div class="section-heading">
          <p class="eyebrow">Initial theme set</p>
          <h2 id="theme-heading">Designed for the document, not the editor.</h2>
        </div>
        <div class="theme-grid">
          <article v-for="theme in themes" :key="theme.name" class="theme-card">
            <div class="paper-preview" :data-tone="theme.tone" aria-hidden="true">
              <span class="preview-kicker">MarkdownMint</span>
              <span class="preview-title">{{ theme.name }}</span>
              <span class="preview-rule" />
              <span class="preview-line preview-line--long" />
              <span class="preview-line" />
              <span class="preview-line preview-line--short" />
            </div>
            <div>
              <h3>{{ theme.name }}</h3>
              <p>{{ theme.description }}</p>
            </div>
          </article>
        </div>
      </section>
    </main>

    <footer>
      <span>MarkdownMint</span>
      <span>Apache-2.0 · Built in the open</span>
    </footer>
  </div>
</template>
