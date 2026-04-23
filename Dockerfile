FROM oven/bun:1.3.10 AS deps
WORKDIR /app
COPY package.json bun.lock* tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile || bun install

FROM deps AS build
WORKDIR /app
COPY . .
RUN bun run build

FROM oven/bun:1.3.10 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/server /app/apps/server
COPY --from=build /app/apps/web/dist /app/apps/web/dist
EXPOSE 3007
CMD ["bun", "apps/server/src/index.ts"]
