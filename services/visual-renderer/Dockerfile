# Node 20 + Playwright Chromium + system deps. The base-image tag MUST match the EXACT playwright
# version pinned in package.json (both 1.62.1 — the ONE canonical version, in lockstep with
# services/paige-browser + the root live-drive devDep; §18 — one playwright version, no second/third).
# WHY EXACT (Task #126 §32.c finding #2): package.json used a CARET (`^1.48.0`) so the Fly build
# resolved a newer 1.x (1.62.x) than the pinned v1.48.0-jammy base shipped Chromium for — Playwright
# 1.55+ needs a `chromium-headless-shell` binary the 1.48 image lacks, so the browser could not
# launch. Both sides are now EXACT-pinned at 1.62.1 (the version proven working live). Keep EXACT —
# a caret / Dependabot bump of package.json ALONE re-opens the gap; move both lines in lockstep.
FROM mcr.microsoft.com/playwright:v1.62.1-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
