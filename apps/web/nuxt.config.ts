export default defineNuxtConfig({
  app: {
    head: {
      link: [{ href: "/favicon.svg", rel: "icon", type: "image/svg+xml" }],
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
  typescript: {
    strict: true,
    typeCheck: true,
  },
});
