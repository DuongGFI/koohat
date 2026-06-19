// Quản lý Cloudflare "quick tunnel" — mở một URL HTTPS public trỏ về cổng server,
// không cần tài khoản / domain. Dùng cho tính năng "Mở cho người chơi từ xa".
//
// Binary cloudflared được gói `cloudflared` tự tải về lần đầu (cần internet).
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let mod = null; // import lười gói cloudflared
let current = null; // { url, instance }
let starting = null; // Promise chống gọi trùng

// Khi đóng gói thành .exe, thư mục gói KHÔNG ghi được. Trỏ binary cloudflared ra
// ~/.koohat (ghi được) qua env CLOUDFLARED_BIN — gói cloudflared đọc env này.
// PHẢI set TRƯỚC khi import gói (vì nó tính `bin` lúc nạp module).
function configureBin() {
  if (!process.env.CLOUDFLARED_BIN) {
    const dir = path.join(os.homedir(), ".koohat");
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
    const exe = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    process.env.CLOUDFLARED_BIN = path.join(dir, exe);
  }
}

async function loadMod() {
  configureBin();
  if (!mod) mod = await import("cloudflared");
  return mod;
}

export function tunnelStatus() {
  return { active: !!current, url: current?.url || null };
}

/** Mở tunnel (idempotent: đang mở thì trả URL hiện có). */
export async function startTunnel(port) {
  if (current) return current.url;
  if (starting) return starting;

  starting = (async () => {
    const { tunnel, bin, install } = await loadMod();
    if (!existsSync(bin)) await install(bin); // tải binary nếu chưa có

    // Ép cloudflared dùng một config RỖNG để luôn tạo "quick tunnel" sạch,
    // tránh bị config toàn cục (~/.cloudflared/config.yml — nếu máy có named
    // tunnel khác) chiếm quyền và làm không lấy được URL trycloudflare.com.
    const emptyConfig = path.join(os.tmpdir(), "koohat-tunnel-empty.yml");
    try {
      writeFileSync(emptyConfig, "ingress: []\n");
    } catch {
      /* tmp không ghi được thì bỏ qua, vẫn thử mở */
    }

    // Truyền MẢNG args thô (không dùng object) vì helper build_args của gói luôn
    // chèn "run" -> "cloudflared tunnel run ..." (dành cho named tunnel) khiến
    // quick tunnel thoát ngay. Mảng cho ra đúng: cloudflared tunnel --config X --url Y
    const instance = tunnel([
      "tunnel",
      "--config",
      emptyConfig,
      "--url",
      `http://localhost:${port}`,
    ]);

    // URL đến qua event "url" (gói parse stdout/stderr của cloudflared).
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Quá thời gian chờ kết nối (45s)")),
        45000
      );
      instance.once("url", (u) => {
        clearTimeout(timer);
        resolve(u);
      });
      instance.once("error", (e) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
      instance.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("cloudflared thoát sớm"));
      });
    });

    current = { url, instance };
    // Nếu tiến trình cloudflared chết sau đó, xoá trạng thái để mở lại được.
    instance.once("exit", () => {
      if (current?.instance === instance) current = null;
    });
    return url;
  })();

  try {
    return await starting;
  } catch (err) {
    current = null;
    throw err;
  } finally {
    starting = null;
  }
}

export async function stopTunnel() {
  if (!current) return;
  try {
    current.instance.stop?.();
  } catch {
    /* ignore */
  }
  current = null;
}
