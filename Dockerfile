# Builds minecraft-mcp from source for the catalogs that run MCP servers in a container: Glama and Docker's MCP Catalog.
# People install it with npx instead (README.md). The image speaks stdio: `docker run -i --rm -e WORLDAPI_URL=… -e
# WORLDAPI_TOKEN=… <image>`. A container can't see a singleplayer world's files, so it always needs WORLDAPI_URL.
FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src src
COPY openapi openapi
RUN npm run build && npm prune --omit=dev

FROM node:24.22.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/openapi openapi
USER node
ENTRYPOINT ["node", "dist/index.js"]
