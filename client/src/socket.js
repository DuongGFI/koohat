import { io } from "socket.io-client";

// In dev the Vite proxy forwards /socket.io to :3000; in prod the server
// serves the built client from the same origin. Either way, default origin works.
export const socket = io("/", { autoConnect: true, transports: ["websocket", "polling"] });

/**
 * RTT calibration loop (spec §4.2). Continuously measures round-trip time and
 * reports a smoothed median to the server, which subtracts half of it from each
 * response timestamp so every device shares the host's t=0.
 */
export function startRttCalibration() {
  const samples = [];
  let timer = null;

  function ping() {
    const t0 = performance.now();
    socket.emit("rtt:ping", t0);
  }

  socket.on("rtt:pong", (t0) => {
    const rtt = performance.now() - t0;
    samples.push(rtt);
    if (samples.length > 7) samples.shift();
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    socket.emit("rtt:report", { rtt: median });
  });

  // Burst at first to converge quickly, then keep a slow heartbeat.
  let count = 0;
  timer = setInterval(() => {
    ping();
    count++;
    if (count === 6) {
      clearInterval(timer);
      timer = setInterval(ping, 4000);
    }
  }, 350);

  return () => timer && clearInterval(timer);
}

// Promise wrapper for socket.emit with ack callback.
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res || {}));
  });
}
