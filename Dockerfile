# ---- Stage 1: build giao diện client ----
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: runtime server ----
FROM node:20-alpine
WORKDIR /app/server
# ca-certificates: cloudflared cần để bắt tay TLS với Cloudflare edge
RUN apk add --no-cache ca-certificates
# Chỉ cài dependency production (bỏ socket.io-client dùng cho test)
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
# Tải sẵn binary cloudflared để lần đầu bấm "Mở từ xa" không phải chờ
# (không bắt buộc — nếu thất bại sẽ tải lúc chạy; do đó || true)
RUN node -e "import('cloudflared').then(m=>m.install(m.bin)).then(()=>console.log('cloudflared ready')).catch(e=>console.error('preinstall skipped:',e.message))" || true
# Server phục vụ bản build tĩnh ở ../../client/dist (xem index.js)
COPY --from=client-build /app/client/dist /app/client/dist

ENV NODE_ENV=production
ENV PORT=1234
EXPOSE 1234
CMD ["node", "src/index.js"]
