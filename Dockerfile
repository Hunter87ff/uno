FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock tsconfig.base.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json

RUN bun install --frozen-lockfile

COPY client client
COPY server server
COPY shared shared

RUN bun run build
RUN bun build server/src/index.ts --target bun --outfile server/src/index.js

FROM oven/bun:1-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/src/index.js server/src/index.js

EXPOSE 3000

CMD ["bun", "server/src/index.js"]