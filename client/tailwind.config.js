/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        kred: "#e21b3c",
        kblue: "#1368ce",
        kyellow: "#d89e00",
        kgreen: "#26890c",
      },
      fontFamily: {
        display: ["Poppins", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fly-in": {
          "0%": { transform: "translateY(40px) scale(0.6)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "pulse-slow": {
          "0%,100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
      },
      animation: {
        "fly-in": "fly-in 0.5s cubic-bezier(0.22,1,0.36,1)",
        "pulse-slow": "pulse-slow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
