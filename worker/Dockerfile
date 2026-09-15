# The worker image — graphile-worker behind the LISTEN/NOTIFY boot probe, plus
# headless Chromium, poppler and libwebp for the PDF page images, the designer
# runtime and the one font set for M6's renders. 04 §7, 11 §1, DEC-017,
# DEC-031, DEC-034, DEC-046, DEC-048, DEC-058.
# Build from the REPO ROOT:
#
#   docker build -f worker/Dockerfile -t kareem-worker .
#   docker run --rm -e DATABASE_URL=postgres://…:5432/postgres kareem-worker            # run
#   docker run --rm -e DATABASE_URL=postgres://…:5432/postgres kareem-worker \
#       node worker/dist/index.js --probe-only                                          # probe
#
# Host-agnostic on purpose (OQ-027): the production host is chosen at Launch
# with PR C, and whatever it is must give this container a SESSION-mode
# Postgres connection (port 5432, never the 6543 transaction pooler — the
# probe refuses to start otherwise) and a place for `service_role` that is
# not Vercel. Locally and in CI it runs against the local database.
#
# Three workspace packages ride along: @kareem/storage-paths (the one path
# builder), @kareem/designer-runtime (THE renderer, DEC-017) and
# @kareem/fonts (the one font set, verified by hash below — REQ-DSG-016).

# ── build: the workspaces' TypeScript, with dev dependencies ────────────────
FROM node:22-slim AS build
WORKDIR /app
# npm workspaces need every workspace's package.json to reconcile the lock,
# even the ones this image never installs.
COPY package.json package-lock.json ./
COPY worker/package.json worker/
COPY packages/designer-runtime/package.json packages/designer-runtime/
COPY packages/storage-paths/package.json packages/storage-paths/
COPY packages/fonts/package.json packages/fonts/
RUN npm ci --workspace @kareem/worker --ignore-scripts
COPY packages/storage-paths/ packages/storage-paths/
COPY packages/designer-runtime/ packages/designer-runtime/
RUN npm run build --workspace @kareem/storage-paths \
 && npm run build --workspace @kareem/designer-runtime
COPY worker/ worker/
RUN npm run build --workspace @kareem/worker

# ── runtime: production dependencies of the worker workspace only ───────────
FROM node:22-slim
ENV NODE_ENV=production

# Headless Chromium for designer exports (A28, D66): Debian's build, driven by
# puppeteer-core at CHROME_PATH. No download at build or run time, so the
# binary is the same on every boot. poppler-utils (pdfinfo, pdffonts,
# pdftoppm) and webp (cwebp) render a PDF material's page images in this
# image since DEC-058 — the same two packages the retired converter image
# used, so 07 §4.5's outputs and the slide-page goldens are unchanged.
# fontconfig is what makes the font set below visible to all of them.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      poppler-utils \
      webp \
      fontconfig \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json package-lock.json ./
COPY worker/package.json worker/
COPY packages/designer-runtime/package.json packages/designer-runtime/
COPY packages/storage-paths/package.json packages/storage-paths/
COPY packages/fonts/package.json packages/fonts/
RUN npm ci --workspace @kareem/worker --omit=dev --ignore-scripts \
 && npm cache clean --force
COPY --from=build /app/packages/storage-paths/dist packages/storage-paths/dist
COPY --from=build /app/packages/designer-runtime/dist packages/designer-runtime/dist
COPY --from=build /app/worker/dist worker/dist

# ── The one font set (invariant 12, REQ-DSG-016). ──────────────────────────
# Copy the manifest and its files, PROVE they are what the manifest says,
# install the TrueType files where fontconfig — and therefore Chromium and
# poppler — finds them. An image that fails this step does not exist. The
# renderer also inlines faces by SHA-256 from the same manifest, so a poster
# never depends on fontconfig's fallback chain.
COPY packages/fonts ./packages/fonts
COPY scripts/fonts/check.mjs scripts/fonts/extract.mjs ./scripts/fonts/
RUN node scripts/fonts/check.mjs --no-build \
 && mkdir -p /usr/local/share/fonts/kareem \
 && cp packages/fonts/*.ttf /usr/local/share/fonts/kareem/ \
 && fc-cache -f \
 && fc-list : family | grep -q "IBM Plex Sans Arabic" \
 && fc-list : family | grep -q "IBM Plex Sans"

# The worker holds service_role (through SECURITY DEFINER functions only,
# CLAUDE.md data-access rule 6); it does not also need to be root. Chromium
# as a non-root user in a container still needs `--no-sandbox` unless the
# host grants user namespaces; the render driver passes it and says why.
USER node

# Boot = probe, then run. A failed probe is a failed boot (exit 1), which is
# what a host's restart policy should see.
CMD ["node", "worker/dist/index.js"]
