# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22.17.0-bookworm-slim@sha256:b04ce4ae4e95b522112c2e5c52f781471a5cbc3b594527bcddedee9bc48c03a0

FROM ${NODE_IMAGE} AS base

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /workspace

RUN node --input-type=module -e "const major = Number.parseInt(process.versions.node.split('.')[0], 10); if (major !== 22) process.exit(1)"

FROM base AS development-dependencies

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages

RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts; \
    else \
      npm install --ignore-scripts --package-lock=false; \
    fi

FROM development-dependencies AS build

RUN npm run ci

FROM base AS production-dependencies

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages ./packages

RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --ignore-scripts; \
    else \
      npm install --omit=dev --ignore-scripts --package-lock=false; \
    fi

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/package.json ./package.json
COPY --from=build --chown=node:node /workspace/packages ./packages

USER node

# A deployable package must replace this diagnostic command with its reviewed
# entry point. This image definition is build/runtime plumbing, not activation.
CMD ["node", "--version"]
