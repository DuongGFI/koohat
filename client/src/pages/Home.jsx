import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Home() {
  const nav = useNavigate();
  return (
    <div className="app-bg min-h-full flex flex-col items-center justify-center text-white p-6">
      <motion.h1
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="text-6xl md:text-7xl font-extrabold drop-shadow-lg mb-2"
      >
        Koohat <span className="text-yellow-300">Local</span>
      </motion.h1>
      <p className="text-white/80 mb-10 text-lg">Đố vui thời gian thực — chơi trong mạng LAN</p>

      <div className="grid gap-4 w-full max-w-md">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => nav("/play")}
          className="btn-primary text-2xl py-6"
        >
          🎮 Tham gia chơi
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => nav("/host")}
          className="btn-ghost text-xl py-5"
        >
          📺 Tổ chức (Host)
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => nav("/admin")}
          className="btn-ghost text-lg py-4"
        >
          ⚙️ Quản lý câu hỏi (Admin)
        </motion.button>
      </div>
    </div>
  );
}
