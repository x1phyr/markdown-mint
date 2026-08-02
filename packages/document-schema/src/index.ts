import { z } from "zod";

export const documentAssetSchema = z.object({
  bytes: z.instanceof(Uint8Array),
  mediaType: z.string().min(1),
  path: z.string().min(1),
});

export const exportRequestSchema = z.object({
  appearance: z.object({
    accentColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    codeTheme: z.string().min(1).default("github-light"),
    density: z.enum(["compact", "normal", "relaxed"]).default("normal"),
    themeId: z.string().min(1),
  }),
  document: z.object({
    author: z.string().max(200).optional(),
    language: z.enum(["zh-CN", "en"]).default("zh-CN"),
    subtitle: z.string().max(300).optional(),
    title: z.string().max(300).optional(),
  }),
  features: z.object({
    cover: z.boolean().default(true),
    footer: z.boolean().default(true),
    header: z.boolean().default(false),
    pageNumber: z.boolean().default(true),
    toc: z.boolean().default(true),
  }),
  output: z.object({
    format: z.enum(["pdf", "html"]),
  }),
  page: z.object({
    margin: z.enum(["compact", "normal", "relaxed"]).default("normal"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    size: z.enum(["A4", "Letter"]).default("A4"),
  }),
  source: z.object({
    assets: z.array(documentAssetSchema).default([]),
    markdown: z.string().min(1),
  }),
});

export type DocumentAsset = z.infer<typeof documentAssetSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
