# The credential-free converter (04 §7.1). Build from the REPO ROOT:
#
#   docker build -f converter/Dockerfile -t kareem-converter .
#
# It needs packages/fonts and scripts/fonts from the root, because the fonts
# LibreOffice sees are the manifest's, verified by hash at build (REQ-DSG-016).
FROM node:22-slim

# LibreOffice Impress for PowerPoint → PDF, poppler for PDF → page images and
# font inspection, libwebp for the viewer's WebP pages, unzip to read the
# deck's font list. --no-install-recommends keeps the image and its attack
# surface small; LibreOffice's own dependency set is already large enough.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-impress \
      poppler-utils \
      webp \
      unzip \
      fontconfig \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── The one font set. ───────────────────────────────────────────────────
# Copy the manifest and its files, PROVE they are what the manifest says,
# then install the TrueType files where fontconfig finds them. An image that
# fails this step does not exist, which is what "fails CI, not production"
# means for LibreOffice.
COPY packages/fonts ./packages/fonts
COPY scripts/fonts/check.mjs scripts/fonts/extract.mjs ./scripts/fonts/
RUN node scripts/fonts/check.mjs --no-build \
 && mkdir -p /usr/local/share/fonts/kareem \
 && cp packages/fonts/*.ttf /usr/local/share/fonts/kareem/ \
 && fc-cache -f \
 && fc-list : family | grep -q "IBM Plex Sans Arabic" \
 && fc-list : family | grep -q "IBM Plex Sans"

COPY converter/server.mjs converter/package.json ./converter/

# LibreOffice wants a writable HOME; each job also gets its own profile
# under the request's temp dir (see server.mjs), so HOME is just a default.
ENV PORT=8080 HOME=/tmp NODE_ENV=production
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "converter/server.mjs"]
