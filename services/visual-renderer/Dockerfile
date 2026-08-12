# Node 20 + Playwright Chromium + system deps. The base-image tag MUST match the EXACT playwright
# version pinned in package.json (both 1.56.1 — the repo's canonical version, kept in lockstep with
# services/paige-browser + the root live-drive devDep; §18 — one playwright version, no third).
# §13 note (Task #126 §32.c finding #2): package.json used a CARET (`^1.48.0`) so the Fly build
# silently pulled a newer 1.x than this pinned base image shipped Chromium for → the browser could
# not launch. Both sides are now EXACT-pinned so they can never drift apart again.
FROM mcr.microsoft.com/playwright:v1.56.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
