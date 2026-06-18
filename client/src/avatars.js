// Danh sách emoji avatar tạm thời cho người chơi, chia theo danh mục cảm xúc/hình tượng.
// Dùng ở màn join (người chơi tự chọn) và để random khi tham gia.
export const AVATAR_CATEGORIES = [
  {
    key: "faces",
    label: "Cảm xúc",
    emojis: ["😀", "😎", "🤩", "😜", "🥳", "😇", "🤠", "🥰", "😂", "🤓"],
  },
  {
    key: "animals",
    label: "Động vật",
    emojis: ["🐶", "🐱", "🦊", "🐼", "🐵", "🦁", "🐯", "🐸", "🐧", "🦄"],
  },
  {
    key: "food",
    label: "Đồ ăn",
    emojis: ["🍔", "🍕", "🍩", "🍦", "🍓", "🍉", "🌮", "🍪", "🧁", "🍿"],
  },
  {
    key: "objects",
    label: "Thể thao & vật phẩm",
    emojis: ["⚽", "🏀", "🎮", "🚀", "🎸", "🏆", "🎯", "🎨", "🛹", "🥇"],
  },
  {
    key: "nature",
    label: "Thiên nhiên & kỳ ảo",
    emojis: ["🌟", "🔥", "🌈", "🌸", "🍀", "⚡", "🌙", "❄️", "🦋", "💎"],
  },
];

// Mảng phẳng tất cả emoji (tiện cho random / validate).
export const ALL_AVATARS = AVATAR_CATEGORIES.flatMap((c) => c.emojis);

/** Lấy ngẫu nhiên một emoji avatar. */
export function randomAvatar() {
  return ALL_AVATARS[Math.floor(Math.random() * ALL_AVATARS.length)];
}
