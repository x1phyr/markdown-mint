const baseURL = process.env.NUXT_APP_BASE_URL ?? "/";

export default defineNuxtConfig({
  app: {
    baseURL,
    head: {
      htmlAttrs: { lang: "zh-CN" },
      link: [{ href: `${baseURL}favicon.svg`, rel: "icon", type: "image/svg+xml" }],
      meta: [
        {
          content:
            "MarkdownMint turns finished Markdown into carefully designed PDF and HTML documents.",
          name: "description",
        },
      ],
      title: "MarkdownMint — Beautiful documents from Markdown",
    },
  },
  compatibilityDate: "2026-08-03",
  css: ["~/assets/css/main.css"],
  devtools: { enabled: true },
  runtimeConfig: {
    public: {
      rendererUrl: process.env.NUXT_PUBLIC_RENDERER_URL ?? "http://127.0.0.1:4310",
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
});
