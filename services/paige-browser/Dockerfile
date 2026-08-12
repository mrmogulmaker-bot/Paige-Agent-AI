# Node 20 + Playwright Chromium + system deps. The base-image tag MUST match the EXACT playwright
# version pinned in package.json (both 1.62.1 — the ONE canonical version across the browser
# services AND the root live-drive devDep; §18 — do not introduce a second/third).
#
# WHY EXACT, NOT A CARET (Task #126 §32.c finding #2 — proven live): package.json previously used a
# CARET (`^1.48.0`), so the Fly build silently resolved the latest 1.x (1.62.x) while this base image
# stayed pinned at v1.48.0-jammy. Playwright 1.55+ launches Chromium via a `chromium-headless-shell`
# binary that the 1.48.0 image does not ship — so the drifted npm package could not find its browser
# and the launch failed (the honest infra-block Paige reported on three live-drives). The pin is now
# EXACT on both the npm and image sides at 1.62.1 (the version proven working live: 817 MB rebuild,
# healthz 200, real paigeagent.ai content returned). Keep it EXACT — a caret or a Dependabot bump that
# moves ONLY package.json will re-open this exact gap. Bump BOTH lines together, in lockstep, always.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
