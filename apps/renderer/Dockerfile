FROM node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e

WORKDIR /app

ENV COREPACK_HOME=/usr/local/share/corepack

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/renderer/package.json apps/renderer/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/compiler/package.json packages/compiler/package.json
COPY packages/document-schema/package.json packages/document-schema/package.json
COPY packages/html-exporter/package.json packages/html-exporter/package.json
COPY packages/theme-runtime/package.json packages/theme-runtime/package.json
COPY packages/theme-sdk/package.json packages/theme-sdk/package.json
COPY packages/themes/package.json packages/themes/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/renderer/scripts/runtime-manifest.mjs apps/renderer/scripts/runtime-manifest.mjs

RUN corepack enable \
  && corepack install --global pnpm@11.18.0 \
  && pnpm install --frozen-lockfile

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV HOST=0.0.0.0
ENV HOME=/tmp
ENV TMPDIR=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache
RUN mkdir -p /ms-playwright \
  && pnpm --filter @markdown-mint/renderer exec playwright install --with-deps chromium \
  && apt-get update \
  && apt-get install --no-install-recommends --yes fonts-liberation fonts-wqy-zenhei \
  && mkdir -p /usr/share/markdown-mint/licenses \
  && cp node_modules/playwright/LICENSE /usr/share/markdown-mint/licenses/playwright-LICENSE \
  && cp node_modules/playwright/NOTICE /usr/share/markdown-mint/licenses/playwright-NOTICE \
  && cp node_modules/playwright/ThirdPartyNotices.txt /usr/share/markdown-mint/licenses/playwright-ThirdPartyNotices.txt \
  && cp /usr/share/doc/fonts-liberation/copyright /usr/share/markdown-mint/licenses/fonts-liberation-copyright \
  && cp /usr/share/doc/fonts-wqy-zenhei/copyright /usr/share/markdown-mint/licenses/fonts-wqy-zenhei-copyright \
  && node apps/renderer/scripts/runtime-manifest.mjs --output /usr/share/markdown-mint/runtime-manifest.json \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX /ms-playwright

COPY apps/renderer apps/renderer
COPY packages packages

RUN pnpm --filter @markdown-mint/renderer... build

RUN mkdir -p /var/lib/markdown-mint && chown -R node:node /var/lib/markdown-mint

USER node
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4310/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/renderer/dist/server.js"]
