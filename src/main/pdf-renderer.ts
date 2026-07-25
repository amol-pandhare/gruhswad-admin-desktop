import { BrowserWindow } from "electron";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { MenuPdfExportResult } from "../shared/contracts";

function withTimeout<T>(promise: Promise<T>, message: string) {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), 30_000))]);
}

export async function renderHtmlPdfToPath({ html, outputPath, tempPrefix, warning }: { html: string; outputPath: string; tempPrefix: string; warning?: (pageCount: number) => string | null }): Promise<MenuPdfExportResult> {
  const temp = join(dirname(outputPath), `.${tempPrefix}-${Date.now()}.html`);
  writeFileSync(temp, html, "utf8");
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true } });
  try {
    await withTimeout(printWindow.loadFile(temp), "The menu preview could not be prepared within 30 seconds.");
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    const buffer = await withTimeout(printWindow.webContents.printToPDF({ pageSize: "A4", landscape: false, printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } }), "PDF generation did not finish within 30 seconds.");
    writeFileSync(outputPath, buffer);
    const pageCount = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    return { canceled: false, path: outputPath, pageCount, warning: warning?.(pageCount) ?? null };
  } finally {
    printWindow.destroy();
    rmSync(temp, { force: true });
  }
}
