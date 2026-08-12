FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
ENV PORT=3000
ENV DEMO_DB=/data/app.db
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
