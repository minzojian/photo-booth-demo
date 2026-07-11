import type { FrameTheme } from "../config";
import { CAPTURE_SIZE } from "../config";

// 单张照片上的一个贴纸（位置为相对比例 0~1）
export interface PlacedSticker {
  id: string;
  emoji: string;
  x: number; // 0~1 相对照片宽度
  y: number; // 0~1 相对照片高度
  scale: number; // 相对基准字号
}

// 一张已拍/已上传的照片
export interface Shot {
  id: string;
  dataUrl: string;      // 已应用滤镜后的原始方图
  filterCss: string;    // 记录用于展示的滤镜（合成时图已烘焙，无需再用）
  stickers: PlacedSticker[];
}

// 从 video 中央裁剪一个方形，应用滤镜，返回 dataURL
export function captureSquareFromVideo(
  video: HTMLVideoElement,
  filterCss: string,
  mirror: boolean
): string {
  const size = CAPTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const vw = video.videoWidth || size;
  const vh = video.videoHeight || size;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
  if (mirror) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

// 把上传的图片文件转成应用了滤镜的方图 dataURL
export function fileToSquareDataUrl(file: File, filterCss: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = CAPTURE_SIZE;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.filter = filterCss && filterCss !== "none" ? filterCss : "none";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 解析 CSS 渐变字符串为 canvas 渐变（仅支持我们用的 linear-gradient 双色写法），否则当纯色
function applyBackground(ctx: CanvasRenderingContext2D, bg: string, w: number, h: number) {
  const match = bg.match(/linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/);
  if (match) {
    const grad = ctx.createLinearGradient(0, 0, w * 0.4, h);
    grad.addColorStop(0, match[1]);
    grad.addColorStop(1, match[2]);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bg;
  }
  ctx.fillRect(0, 0, w, h);
}

// 把多张照片合成为竖排大头贴条，返回最终 canvas
export async function composeStrip(shots: Shot[], theme: FrameTheme): Promise<HTMLCanvasElement> {
  const photo = CAPTURE_SIZE;      // 每张照片边长
  const pad = 48;                  // 外边距
  const gap = 32;                  // 照片间距
  const headerH = 24;              // 顶部留白
  const footerH = 120;             // 底部文案区
  const n = shots.length;

  const width = photo + pad * 2;
  const height = headerH + pad + n * photo + (n - 1) * gap + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // 相框底
  applyBackground(ctx, theme.bg, width, height);

  // 内白框
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;

  let y = headerH + pad;
  for (let i = 0; i < n; i++) {
    const shot = shots[i];
    const img = await loadImage(shot.dataUrl);
    const x = pad;
    // 白色相纸边
    ctx.fillStyle = "#fff";
    roundRect(ctx, x - 8, y - 8, photo + 16, photo + 16, 14);
    ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, photo, photo, 8);
    ctx.clip();
    ctx.drawImage(img, x, y, photo, photo);
    ctx.restore();

    // 贴纸
    for (const s of shot.stickers) {
      const fontPx = photo * 0.16 * s.scale;
      ctx.font = `${fontPx}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(s.emoji, x + s.x * photo, y + s.y * photo);
    }

    y += photo + gap;
  }
  ctx.restore();

  // 底部文案
  ctx.fillStyle = theme.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${footerH * 0.28}px "Segoe UI","PingFang SC",sans-serif`;
  ctx.fillText(theme.caption, width / 2, height - footerH * 0.62);

  const now = new Date();
  const stamp = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  ctx.font = `${footerH * 0.17}px "Segoe UI","PingFang SC",sans-serif`;
  ctx.globalAlpha = 0.8;
  ctx.fillText(stamp, width / 2, height - footerH * 0.28);
  ctx.globalAlpha = 1;

  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
