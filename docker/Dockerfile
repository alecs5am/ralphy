# Ralphy farm server image (#506) — one image, two services (compose picks the
# command): the farm daemon (`ralphy farm start`, #503) and the authenticated
# Studio dashboard (`bun studio/server/index.ts`).
#
# Provider keys are NEVER baked into the image — they arrive as env at run
# time (docker-compose.yml / docker/README.md). Durable state is the mounted
# `.ralphy/` volume at /app/.ralphy.

FROM oven/bun:1

# zip/unzip: workspace bundle export/import (cli/lib/bundle.ts uses the system
# binaries — same decision as unpack-zip.ts). Renders additionally need
# ffmpeg + a browser; install them here if this deployment renders (kept out
# of the base image to stay small — see docker/README.md "Render deps").
RUN apt-get update \
  && apt-get install -y --no-install-recommends zip unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency layers first (cache-friendly), then the source tree.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY studio/package.json studio/bun.lock ./studio/
RUN cd studio && bun install --frozen-lockfile

COPY . .

# Build the Studio UI (studio/dist/ is what the server serves).
RUN cd studio && bun run build

# Default command is the dashboard; compose overrides per service.
EXPOSE 4860
CMD ["bun", "studio/server/index.ts"]
