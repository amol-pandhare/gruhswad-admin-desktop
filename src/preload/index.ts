import { contextBridge, ipcRenderer } from "electron";
import type { AdminApi } from "../shared/contracts";

const api:AdminApi={
  dashboard:(range)=>ipcRenderer.invoke("dashboard",range),
  orders:{list:(range)=>ipcRenderer.invoke("orders:list",range),save:(input)=>ipcRenderer.invoke("orders:save",input),updateStatus:(id,status)=>ipcRenderer.invoke("orders:status",id,status),addPayment:(input)=>ipcRenderer.invoke("orders:payment",input)},
  expenses:{list:(range)=>ipcRenderer.invoke("expenses:list",range),save:(input)=>ipcRenderer.invoke("expenses:save",input),remove:(id)=>ipcRenderer.invoke("expenses:remove",id)},
  catalog:{get:()=>ipcRenderer.invoke("catalog:get"),save:(input)=>ipcRenderer.invoke("catalog:save",input),archive:(id,archived)=>ipcRenderer.invoke("catalog:archive",id,archived),exportPdf:()=>ipcRenderer.invoke("catalog:export-pdf")},
  operations:{get:()=>ipcRenderer.invoke("operations:get"),save:(input)=>ipcRenderer.invoke("operations:save",input)},
  menu:{catalog:()=>ipcRenderer.invoke("menu:catalog"),history:()=>ipcRenderer.invoke("menu:history"),getCurrent:()=>ipcRenderer.invoke("menu:current"),publish:(input)=>ipcRenderer.invoke("menu:publish",input)},
  cloudOrders:{list:(query)=>ipcRenderer.invoke("cloud-orders:list",query),detail:(id)=>ipcRenderer.invoke("cloud-orders:detail",id),updateStatus:(id,status)=>ipcRenderer.invoke("cloud-orders:status",id,status)},
  sync:{status:()=>ipcRenderer.invoke("sync:status"),previewPull:()=>ipcRenderer.invoke("sync:preview-pull"),pull:()=>ipcRenderer.invoke("sync:pull"),previewPush:()=>ipcRenderer.invoke("sync:preview-push"),push:()=>ipcRenderer.invoke("sync:push"),conflicts:()=>ipcRenderer.invoke("sync:conflicts"),resolve:(id,resolution)=>ipcRenderer.invoke("sync:resolve",id,resolution),history:()=>ipcRenderer.invoke("sync:history"),onStartupPullComplete:(callback)=>{const handler=()=>callback();ipcRenderer.on("sync:startup-pull-complete",handler);return()=>ipcRenderer.removeListener("sync:startup-pull-complete",handler)},onStartupPullSettled:(callback)=>{const handler=()=>callback();ipcRenderer.on("sync:startup-pull-settled",handler);return()=>ipcRenderer.removeListener("sync:startup-pull-settled",handler)}},
  reports:{exportCsv:(kind,range)=>ipcRenderer.invoke("reports:export",kind,range)}, inbox:{list:()=>ipcRenderer.invoke("inbox:list"),sync:()=>ipcRenderer.invoke("inbox:sync"),createOrder:()=>Promise.reject(new Error("Open the parsed draft and save it from Orders."))},
  settings:{get:()=>ipcRenderer.invoke("settings:get"),set:(values,secrets)=>ipcRenderer.invoke("settings:set",values,secrets),backup:()=>ipcRenderer.invoke("settings:backup"),restore:()=>ipcRenderer.invoke("settings:restore")},
  updates:{check:()=>ipcRenderer.invoke("updates:check"),install:()=>ipcRenderer.invoke("updates:install"),onStatus:(callback)=>{const handler=(_e:unknown,status:string)=>callback(status);ipcRenderer.on("updates:status",handler);return()=>ipcRenderer.removeListener("updates:status",handler)}},
};
contextBridge.exposeInMainWorld("admin",api);
