# node:sqlite (DatabaseSync) precisa do Node 22.5+
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=4321

RUN mkdir -p /data && chown -R node:node /app /data

USER node

EXPOSE 4321

CMD ["node", "server.js"]
