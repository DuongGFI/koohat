// Nhúng toàn bộ client/dist vào server/src/embedded-dist.js (dạng base64 trong RAM).
// Nhờ vậy bản .exe đóng gói không cần đọc file tĩnh từ ổ đĩa — phục vụ thẳng từ bộ nhớ.
// Chạy: node scripts/embed-dist.mjs  (sau khi đã build client)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(repo, "client", "dist");
const outFile = path.join(repo, "server", "src", "embedded-dist.js");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

if (!fs.existsSync(distDir)) {
  console.error("✗ Chưa có client/dist. Hãy build client trước (npm run build trong client/).");
  process.exit(1);
}

const entries = [];
function walk(dir, base = "") {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = base + "/" + name;
    if (fs.statSync(full).isDirectory()) {
      walk(full, rel);
    } else {
      const type = TYPES[path.extname(name).toLowerCase()] || "application/octet-stream";
      const b64 = fs.readFileSync(full).toString("base64");
      entries.push(
        `  [${JSON.stringify(rel)}, { type: ${JSON.stringify(type)}, body: Buffer.from(${JSON.stringify(b64)}, "base64") }]`
      );
    }
  }
}
walk(distDir);

const out =
  `// AUTO-GENERATED bởi scripts/embed-dist.mjs — KHÔNG sửa tay.\n` +
  `// Map URL path -> { type, body(Buffer) }. Rỗng trong môi trường dev.\n` +
  `export default new Map([\n${entries.join(",\n")}\n]);\n`;
fs.writeFileSync(outFile, out);
console.log(`✓ Đã nhúng ${entries.length} file (${(out.length / 1024).toFixed(0)} KB) vào ${path.relative(repo, outFile)}`);
