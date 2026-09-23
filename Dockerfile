FROM node:22-slim

WORKDIR /app

COPY ultraviolet/package.json ultraviolet/package-lock.json ./
RUN npm ci --omit=dev

COPY ultraviolet/src ./src
COPY ultraviolet/public ./public

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
