FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY public ./public
COPY ops/backup.mjs ./ops/backup.mjs
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3140 RUNTIME_DIR=/data
USER 10001:10001
EXPOSE 3140
HEALTHCHECK --interval=20s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3140/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.mjs"]
