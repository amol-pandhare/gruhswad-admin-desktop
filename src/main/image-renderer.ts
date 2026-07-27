import { BrowserWindow, shell } from "electron";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { MenuImageExportResult } from "../shared/contracts";

const width = 1085;
const height = 1536;
const renderScale = 0.58;
const renderWidth = Math.round(width * renderScale);
const renderHeight = Math.round(height * renderScale);
let latestExportPaths: string[] = [];
let latestPathsAreTemporary = false;

function withTimeout<T>(promise: Promise<T>, message: string) {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 30_000))]);
}

export function numberedImagePaths(basePath: string, count: number) {
  if (count === 1) return [basePath];
  const extension = extname(basePath) || ".png";
  const stem = basePath.slice(0, basePath.length - extension.length);
  return Array.from({ length: count }, (_, index) => `${stem}-${String(index + 1).padStart(2, "0")}${extension}`);
}

export async function renderHtmlImagesToPaths({ pages, basePath, warning, temporary = false }: { pages: string[]; basePath: string; warning?: string | null; temporary?: boolean }): Promise<MenuImageExportResult> {
  if (!pages.length) throw new Error("The menu image document has no pages.");
  const paths = numberedImagePaths(basePath, pages.length);
  const buffers: Buffer[] = [];
  for (let index = 0; index < pages.length; index++) {
    const temp = join(dirname(basePath), `.gruhswad-menu-image-${Date.now()}-${index}.html`);
    writeFileSync(temp, pages[index], "utf8");
    // Windows constrains hidden windows to the monitor work area. Render the
    // complete poster at a proportional, monitor-safe viewport, then normalize
    // the full capture to the requested export dimensions.
    const window = new BrowserWindow({ show: false, frame: false, width: renderWidth, height: renderHeight, useContentSize: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, zoomFactor: renderScale } });
    try {
      await withTimeout(window.loadFile(temp), "The menu image preview could not be prepared within 30 seconds.");
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      const image = await withTimeout(window.webContents.capturePage(), "Menu image generation did not finish within 30 seconds.");
      const size = image.getSize();
      const output = size.width === width && size.height === height ? image : image.resize({ width, height, quality: "best" });
      buffers.push(output.toPNG());
    } finally {
      window.destroy();
      rmSync(temp, { force: true });
    }
  }
  paths.forEach((path, index) => writeFileSync(path, buffers[index]));
  if (latestPathsAreTemporary) latestExportPaths.forEach((path) => rmSync(path, { force: true }));
  latestExportPaths = [...paths];
  latestPathsAreTemporary = temporary;
  return { canceled: false, paths, imageCount: paths.length, warning: warning ?? null };
}

export function cleanupLatestImagePreview() {
  if (latestPathsAreTemporary) latestExportPaths.forEach((path) => rmSync(path, { force: true }));
  latestExportPaths = [];
  latestPathsAreTemporary = false;
}

function latestPath(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= latestExportPaths.length) throw new Error("That image is not part of the latest completed export.");
  return latestExportPaths[index];
}

export function latestImageDataUrl(index: number) {
  return `data:image/png;base64,${readFileSync(latestPath(index)).toString("base64")}`;
}

export async function openLatestImage(index: number) {
  const error = await shell.openPath(latestPath(index));
  if (error) throw new Error(error);
}

export function showLatestImageInFolder(index: number) {
  shell.showItemInFolder(latestPath(index));
}
