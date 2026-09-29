FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY ultraviolet/package.json ultraviolet/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY ultraviolet/src ./src
COPY ultraviolet/public ./public

# The files stay root-owned and read-only to the app; the server itself runs unprivileged.
USER node
EXPOSE 8080

# Run node directly so it receives SIGTERM from the container runtime (npm does not forward it).
CMD ["node", "src/index.js"]
