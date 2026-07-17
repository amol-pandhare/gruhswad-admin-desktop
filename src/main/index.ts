import { join } from "node:path";
import { existsSync, renameSync, rmSync } from "node:fs";
import { app, BrowserWindow, ipcMain } from "electron";
import updater from "electron-updater";
import { expenseInputSchema, orderInputSchema, orderStatusSchema, paymentInputSchema, publicationSchema, type DateRange } from "../shared/contracts";
import { addPayment, dashboard, getCatalog, getSettings, initializeDatabase, listExpenses, listInbox, listOrders, publicationHistory, removeExpense, saveExpense, saveOrder, setSettings, updateOrderStatus } from "./database";
import { backupDatabase, exportCsv, loadSecrets, publishToGruhswad, restoreDatabase, saveSecrets, syncInbox } from "./services";

let window:BrowserWindow|null=null;
const { autoUpdater } = updater;
function registerIpc(){
  ipcMain.handle("dashboard",(_e,range:DateRange)=>dashboard(range));
  ipcMain.handle("orders:list",(_e,range?:DateRange)=>listOrders(range)); ipcMain.handle("orders:save",(_e,input)=>saveOrder(orderInputSchema.parse(input))); ipcMain.handle("orders:status",(_e,id,status)=>updateOrderStatus(id,orderStatusSchema.parse(status))); ipcMain.handle("orders:payment",(_e,input)=>addPayment(paymentInputSchema.parse(input)));
  ipcMain.handle("expenses:list",(_e,range?:DateRange)=>listExpenses(range)); ipcMain.handle("expenses:save",(_e,input)=>saveExpense(expenseInputSchema.parse(input))); ipcMain.handle("expenses:remove",(_e,id)=>removeExpense(id));
  ipcMain.handle("menu:catalog",()=>getCatalog()); ipcMain.handle("menu:history",()=>publicationHistory()); ipcMain.handle("menu:publish",(_e,input)=>publishToGruhswad(publicationSchema.parse(input)));
  ipcMain.handle("inbox:list",()=>listInbox()); ipcMain.handle("inbox:sync",()=>syncInbox());
  ipcMain.handle("settings:get",()=>({...getSettings(),hasNeonUrl:Boolean(loadSecrets().neonDatabaseUrl),hasInboxToken:Boolean(loadSecrets().inboxToken)})); ipcMain.handle("settings:set",(_e,values,secrets)=>{setSettings(values);if(secrets)saveSecrets({...loadSecrets(),...secrets});}); ipcMain.handle("settings:backup",()=>backupDatabase()); ipcMain.handle("settings:restore",()=>restoreDatabase());
  ipcMain.handle("reports:export",(_e,kind,range)=>exportCsv(kind,range)); ipcMain.handle("updates:check",()=>autoUpdater.checkForUpdates()); ipcMain.handle("updates:install",()=>autoUpdater.quitAndInstall());
}
function createWindow(){window=new BrowserWindow({width:1440,height:920,minWidth:1080,minHeight:700,backgroundColor:"#fff8f1",webPreferences:{preload:join(__dirname,"../preload/index.cjs"),nodeIntegration:false,contextIsolation:true,sandbox:true}}); const devUrl=process.env.ELECTRON_RENDERER_URL;if(!app.isPackaged&&devUrl)window.loadURL(devUrl);else window.loadFile(join(__dirname,"../renderer/index.html"));}
app.whenReady().then(()=>{const databasePath=join(app.getPath("userData"),"gruhswad-admin.db"),pendingPath=join(app.getPath("userData"),"restore-pending.db");if(existsSync(pendingPath)){rmSync(databasePath,{force:true});renameSync(pendingPath,databasePath);}initializeDatabase(databasePath,app.isPackaged?join(process.resourcesPath,"drizzle"):join(process.cwd(),"drizzle"));registerIpc();createWindow(); if(app.isPackaged)autoUpdater.checkForUpdatesAndNotify();});
for(const event of ["checking-for-update","update-available","update-not-available","download-progress","update-downloaded","error"] as const) autoUpdater.on(event,(value:any)=>window?.webContents.send("updates:status",event==="download-progress"?`Downloading ${Math.round(value.percent)}%`:event));
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();}); app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
