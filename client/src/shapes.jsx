// The four signature Kahoot answer identities: colour + shape.
export const ANSWERS = [
  { key: 0, label: "A", color: "kred", bg: "bg-kred", hex: "#e21b3c", shape: "triangle", name: "Tam giác" },
  { key: 1, label: "B", color: "kblue", bg: "bg-kblue", hex: "#1368ce", shape: "diamond", name: "Kim cương" },
  { key: 2, label: "C", color: "kyellow", bg: "bg-kyellow", hex: "#d89e00", shape: "circle", name: "Tròn" },
  { key: 3, label: "D", color: "kgreen", bg: "bg-kgreen", hex: "#26890c", shape: "square", name: "Vuông" },
];

export function Shape({ type, className = "w-7 h-7" }) {
  const common = { className, viewBox: "0 0 100 100", fill: "white" };
  switch (type) {
    case "triangle":
      return (
        <svg {...common}>
          <polygon points="50,10 95,90 5,90" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <polygon points="50,5 95,50 50,95 5,50" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="50" cy="50" r="44" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="12" y="12" width="76" height="76" rx="8" />
        </svg>
      );
    default:
      return null;
  }
}
