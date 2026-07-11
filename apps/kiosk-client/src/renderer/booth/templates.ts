export interface FrameDef { x: number; y: number; width: number; height: number; }
export interface Template { id: string; name: string; shotCount: number; frames: FrameDef[]; bgUrl: string; bgW: number; bgH: number; }

function num(v: unknown, fb = 0): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || fb;
  return fb;
}

function loadImageSize(url: string): Promise<{ img: HTMLImageElement; w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ img, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = rej;
    img.src = url;
  });
}

export async function loadTemplates(): Promise<Template[]> {
  console.log('[templates] 开始加载...');
  const dirs = await window.kiosk.listTemplateDirs();
  console.log('[templates] IPC返回 raw:', JSON.stringify(dirs));

  const templates: Template[] = [];
  for (const entry of dirs) {
    const { dir, files } = entry;
    const shotCount = parseInt(dir, 10);
    if (![1, 2, 4].includes(shotCount)) continue;

    const jsonFile = files.find((f) => f.endsWith('.json'));
    const webpFile = files.find((f) => f.endsWith('.webp'));
    if (!jsonFile || !webpFile) { console.warn('[templates]', dir, '缺少 json/webp pair'); continue; }

    const jsonPath = dir + '/' + jsonFile;
    const webpPath = dir + '/' + webpFile;
    console.log('[templates] IPC read:', jsonPath);

    try {
      const [jsonResult, imgResult] = await Promise.all([
        window.kiosk.readTemplateFile(jsonPath),
        window.kiosk.readTemplateFile(webpPath),
      ]);
      if (!jsonResult.ok || !jsonResult.data) throw new Error('json read failed: ' + (jsonResult.error || 'unknown'));
      if (!imgResult.ok || !imgResult.data) throw new Error('image read failed: ' + (imgResult.error || 'unknown'));
      const jsonResp = jsonResult.data as Record<string,unknown>;
      const imgInfo = await loadImageSize(imgResult.data as string);

      const name: string = String(jsonResp.name ?? dir);
      const rawFrames = (jsonResp.frames ?? []) as unknown[];
      const frames = rawFrames.map((f: unknown) => {
        const o = f as Record<string, unknown>;
        return { x: num(o.x), y: num(o.y), width: num(o.width, 0.5), height: num(o.height, 0.5) };
      });

      templates.push({
        id: dir + '/' + jsonFile.replace('.json', ''),
        name,
        shotCount: frames.length,
        frames,
        bgUrl: imgResult.data as string,
        bgW: imgInfo.w,
        bgH: imgInfo.h,
      });
      console.log('[templates]', name, 'loaded,', frames.length, 'frames,', imgInfo.w + 'x' + imgInfo.h);
    } catch (err) {
      console.error('[templates] IPC read/parse failed:', jsonPath, (err as Error).message);
    }
  }

  console.log('[templates] 最终结果:', templates.length, '个模板');
  return templates;
}

export function templatesForShotCount(all: Template[], n: number): Template[] {
  return all.filter((t) => t.shotCount === n);
}
