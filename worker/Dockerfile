# The worker image — graphile-worker behind the LISTEN/NOTIFY boot probe.
# 04 §7, 11 §1, DEC-034, DEC-046. Build from the REPO ROOT, like the converter:
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
# What is deliberately NOT here yet: headless Chromium, the designer runtime
# and the platform fonts (04 §7.4, DEC-031). They join the image with M6, and
# the font layer is verified by hash then (REQ-DSG-016), exactly as
# converter/Dockerfile does today. Nothing in M3–M5 renders.

# ── build: the workspace's TypeScript, with dev dependencies ────────────────
FROM node:22-slim AS build
WORKDIR /app
# npm workspaces need every workspace's package.json to reconcile the lock,
# even the ones this image never installs.
COPY package.json package-lock.json ./
COPY worker/package.json worker/
COPY packages/designer-runtime/package.json packages/designer-runtime/
COPY packages/fonts/package.json packages/fonts/
RUN npm ci --workspace @kareem/worker --ignore-scripts
COPY worker/ worker/
RUN npm run build --workspace @kareem/worker

# ── runtime: production dependencies of the worker workspace only ───────────
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY worker/package.json worker/
COPY packages/designer-runtime/package.json packages/designer-runtime/
COPY packages/fonts/package.json packages/fonts/
RUN npm ci --workspace @kareem/worker --omit=dev --ignore-scripts \
 && npm cache clean --force
COPY --from=build /app/worker/dist worker/dist

# The worker holds service_role (through SECURITY DEFINER functions only,
# CLAUDE.md data-access rule 6); it does not also need to be root.
USER node

# Boot = probe, then run. A failed probe is a failed boot (exit 1), which is
# what a host's restart policy should see.
CMD ["node", "worker/dist/index.js"]
