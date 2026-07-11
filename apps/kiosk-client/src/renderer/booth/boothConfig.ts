// 大头贴 demo 配置：滤镜、相框主题、贴纸

export interface Filter {
  id: string;
  name: string;
  css: string; // 同时用于 <video> 预览 与 canvas ctx.filter
}

export const FILTERS: Filter[] = [
  { id: "none", name: "原图", css: "none" },
  { id: "bright", name: "美白", css: "brightness(1.15) saturate(1.1) contrast(1.02)" },
  { id: "warm", name: "暖阳", css: "sepia(0.35) saturate(1.4) brightness(1.05)" },
  { id: "cool", name: "冷调", css: "hue-rotate(-12deg) saturate(1.15) brightness(1.05)" },
  { id: "mono", name: "黑白", css: "grayscale(1) contrast(1.1)" },
  { id: "retro", name: "复古", css: "sepia(0.6) contrast(0.95) brightness(1.05) saturate(0.9)" },
  { id: "pop", name: "高饱和", css: "saturate(1.8) contrast(1.15)" },
];

export interface FrameTheme {
  id: string;
  name: string;
  bg: string;        // 相框底色（CSS 渐变或纯色）
  accent: string;    // 文字/装饰色
  caption: string;   // 底部文案
}

export const FRAME_THEMES: FrameTheme[] = [
  { id: "pink", name: "粉萌", bg: "linear-gradient(160deg,#ffd7e8,#ffb3d1)", accent: "#c2185b", caption: "♡ PHOTO BOOTH ♡" },
  { id: "mint", name: "薄荷", bg: "linear-gradient(160deg,#c9f5e5,#a0e8cf)", accent: "#00897b", caption: "☘ FRESH DAY ☘" },
  { id: "sky", name: "天空", bg: "linear-gradient(160deg,#cfe8ff,#a9d3ff)", accent: "#1565c0", caption: "☁ GOOD VIBES ☁" },
  { id: "night", name: "暗夜", bg: "linear-gradient(160deg,#3a3a5a,#22223b)", accent: "#ffd166", caption: "★ NIGHT OUT ★" },
  { id: "cream", name: "奶油", bg: "linear-gradient(160deg,#fff4e0,#ffe3c2)", accent: "#b5651d", caption: "✿ SWEET ✿" },
];

// 贴纸用 emoji，合成时以 canvas 文字绘制
export const STICKERS: string[] = [
  "😍", "😎", "🥰", "😜", "🤩", "😂",
  "❤️", "✨", "⭐", "🌈", "🌸", "🍓",
  "👑", "🎀", "🦄", "🐱", "🐶", "🍭",
  "💯", "🔥", "🎉", "☀️", "🌙", "💖",
];

export const SHOT_OPTIONS = [1, 2, 3, 4];
export const COUNTDOWN_SECONDS = 3;
export const CAPTURE_SIZE = 720; // 每张方形照片的像素边长
