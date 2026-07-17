import { contextBridge, ipcRenderer } from "electron";
import type { AdminApi } from "../shared/contracts";

const api:AdminApi={
  dashboard:(range)=>ipcRenderer.invoke("dashboard",range),
  orders:{list:(range)=>ipcRenderer.invoke("orders:list",range),save:(input)=>ipcRenderer.invoke("orders:save",input),updateStatus:(id,status)=>ipcRenderer.invoke("orders:status",id,status),addPayment:(input)=>ipcRenderer.invoke("orders:payment",input)},
  expenses:{list:(range)=>ipcRenderer.invoke("expenses:list",range),save:(input)=>ipcRenderer.invoke("expenses:save",input),remove:(id)=>ipcRenderer.invoke("expenses:remove",id)},
  menu:{catalog:()=>ipcRenderer.invoke("menu:catalog"),history:()=>ipcRenderer.invoke("menu:history"),publish:(input)=>ipcRenderer.invoke("menu:publish",input)},
  reports:{exportCsv:(kind,range)=>ipcRenderer.invoke("reports:export",kind,range)}, inbox:{list:()=>ipcRenderer.invoke("inbox:list"),sync:()=>ipcRenderer.invoke("inbox:sync"),createOrder:()=>Promise.reject(new Error("Open the parsed draft and save it from Orders."))},
  settings:{get:()=>ipcRenderer.invoke("settings:get"),set:(values,secrets)=>ipcRenderer.invoke("settings:set",values,secrets),backup:()=>ipcRenderer.invoke("settings:backup"),restore:()=>ipcRenderer.invoke("settings:restore")},
  updates:{check:()=>ipcRenderer.invoke("updates:check"),install:()=>ipcRenderer.invoke("updates:install"),onStatus:(callback)=>{const handler=(_e:unknown,status:string)=>callback(status);ipcRenderer.on("updates:status",handler);return()=>ipcRenderer.removeListener("updates:status",handler)}},
};
contextBridge.exposeInMainWorld("admin",api);
