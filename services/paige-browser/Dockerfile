# Node 20 + Playwright Chromium + system deps. The base-image tag MUST match the EXACT playwright
# version pinned in package.json (both 1.56.1 — the repo's canonical version, same as the root
# devDep). §18 — ONE playwright version across the repo's browser services (paige-browser +
# visual-renderer) AND the root live-drive helper; do not introduce a third.
# §13 root-cause note (Task #126 §32.c finding #2): package.json previously used a CARET (`^1.48.0`),
# so the Fly build silently pulled the latest 1.x (1.62.x) while this base image stayed at 1.48.0 —
# the npm playwright package and the image's Chromium diverged and the browser could not launch.
# The pin is now EXACT on both sides so the two can never drift apart again.
FROM mcr.microsoft.com/playwright:v1.56.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
