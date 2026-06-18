// PM2 process definition for the Kahoot Local game server.
// Usage:
//   pm2 start ecosystem.config.cjs       # khởi động
//   pm2 logs kahoot-local                # xem log realtime
//   pm2 restart kahoot-local             # khởi động lại sau khi sửa code
//   pm2 stop kahoot-local                # dừng
//   pm2 save && pm2 startup              # tự chạy lại khi reboot máy
module.exports = {
  apps: [
    {
      name: "kahoot-local",
      cwd: "./server",
      script: "src/index.js",
      interpreter: "node",
      instances: 1, // state in-memory => KHÔNG chạy nhiều instance (xem README)
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 1234,
      },
      time: true, // gắn timestamp vào log
    },
  ],
};
