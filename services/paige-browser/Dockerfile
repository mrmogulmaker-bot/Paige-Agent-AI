# Node 20 + Playwright Chromium + system deps, pinned to the playwright version in package.json.
# SAME base image + playwright version as services/visual-renderer (§18 — one playwright version
# across the repo's browser services; do not introduce a third).
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
