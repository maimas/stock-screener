# The stock screener: the built page, the server behind it, the daily recorder and Claude Code, in one image.
FROM node:24-bookworm-slim AS build
ENV NG_CLI_ANALYTICS=false CI=true
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
RUN npx ng build

FROM node:24-bookworm-slim
ARG CLAUDE_CODE_VERSION=2.1.332
ENV NODE_ENV=production DISABLE_AUTOUPDATER=1 CLAUDE_CONFIG_DIR=/home/node/.claude
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force
# A friend types "docker compose exec reader claude" as the page shows it, and exec runs as root: this makes claude run as node, so what it signs in and saves stays readable for the app.
RUN mv /usr/local/bin/claude /usr/local/bin/claude-real \
 && printf '%s\n' '#!/bin/sh' \
  'if [ "$(id -u)" = "0" ]; then' \
  '  exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node /usr/local/bin/claude-real "$@"' \
  'fi' \
  'exec /usr/local/bin/claude-real "$@"' > /usr/local/bin/claude \
 && chmod +x /usr/local/bin/claude
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY proxy.conf.json ./
COPY src/app ./src/app
COPY tools/store ./tools/store
COPY tools/server ./tools/server
COPY tools/recorder ./tools/recorder
COPY tools/claude ./tools/claude
COPY --from=build /app/dist/material-pro-angular-lite ./dist
RUN sed -i 's/\r$//' tools/server/entrypoint.sh && chmod +x tools/server/entrypoint.sh \
 && mkdir -p /backups /run/reader /home/node/.claude \
 && chown node:node /backups /run/reader /home/node/.claude
EXPOSE 4200
ENTRYPOINT ["/app/tools/server/entrypoint.sh"]
CMD ["node", "tools/server/main.js"]
