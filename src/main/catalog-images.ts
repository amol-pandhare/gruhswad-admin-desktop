import { app, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { CatalogImageAsset, CatalogImageSaveSelection, CatalogImageSelection, CatalogItem } from "../shared/contracts";
import { getCatalog, saveCatalogItem, saveCatalogItemCompatibility, validateCatalogItemReferences } from "./database";
import { gcsBucket } from "./gcs-client";

const maxBytes = 10 * 1024 * 1024;
const tokenTtl = 15 * 60 * 1000;
const staged = new Map<string, { path: string; expiresAt: number; format: "jpg" | "png" | "webp"; mimeType: string }>();
const safeName = /^[a-z0-9][a-z0-9.-]*\.(?:jpe?g|png|webp)$/i;
const contentTypes = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

export function packagedCatalogDirectory() { return join(__dirname, "../renderer/catalog"); }
export function catalogImageCacheDirectory() { const value = join(app.getPath("userData"), "catalog-images"); mkdirSync(value, { recursive: true }); return value; }
const dataUrl = (buffer: Buffer, mimeType: string) => `data:${mimeType};base64,${buffer.toString("base64")}`;

function jpegDimensions(data: Buffer) {
  let offset = 2;
  while (offset + 9 < data.length) { if (data[offset] !== 0xff) { offset++; continue; } const marker=data[offset+1],length=data.readUInt16BE(offset+2);if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { width:data.readUInt16BE(offset+7),height:data.readUInt16BE(offset+5) };if(length<2)break;offset+=2+length; }
  return null;
}
function webpDimensions(data: Buffer) {
  if (data.length < 30) return null; const kind=data.subarray(12,16).toString("ascii");
  if(kind==="VP8X")return{width:1+data.readUIntLE(24,3),height:1+data.readUIntLE(27,3)};
  if(kind==="VP8 "&&data.subarray(23,26).toString("hex")==="9d012a")return{width:data.readUInt16LE(26)&0x3fff,height:data.readUInt16LE(28)&0x3fff};
  if(kind==="VP8L"&&data[20]===0x2f){const bits=data.readUInt32LE(21);return{width:(bits&0x3fff)+1,height:((bits>>14)&0x3fff)+1};}return null;
}
export function inspectCatalogImage(data: Buffer, originalName: string) {
  if (!data.length || data.length > maxBytes) throw new Error("Choose a JPEG, PNG, or WebP image no larger than 10 MB.");
  const extension=extname(originalName).toLowerCase();let format:"jpg"|"png"|"webp",dimensions:{width:number;height:number}|null=null;
  if(data.subarray(0,8).toString("hex")==="89504e470d0a1a0a"){format="png";if(extension!==".png"||data.length<24)throw new Error("The image extension does not match its contents.");dimensions={width:data.readUInt32BE(16),height:data.readUInt32BE(20)};}
  else if(data[0]===0xff&&data[1]===0xd8){format="jpg";if(![".jpg",".jpeg"].includes(extension))throw new Error("The image extension does not match its contents.");dimensions=jpegDimensions(data);}
  else if(data.subarray(0,4).toString("ascii")==="RIFF"&&data.subarray(8,12).toString("ascii")==="WEBP"){format="webp";if(extension!==".webp")throw new Error("The image extension does not match its contents.");dimensions=webpDimensions(data);}
  else throw new Error("Choose a valid JPEG, PNG, or WebP image.");
  if(!dimensions||dimensions.width<1||dimensions.height<1)throw new Error("The selected image has invalid dimensions.");
  return { format, mimeType:contentTypes[format], ...dimensions };
}

export function packagedCatalogAssets(): CatalogImageAsset[] {
  return catalogAssetNames(readdirSync(packagedCatalogDirectory())).map((filename)=>({filename,source:"packaged",previewUrl:`catalog-image://image/${encodeURIComponent(filename)}`}));
}
export function catalogAssetNames(names:string[]){return names.filter((name)=>safeName.test(name)&&(name==="food-placeholder.jpeg"||/^\d+\.(?:jpe?g|png|webp)$/i.test(name))).sort((a,b)=>a==="food-placeholder.jpeg"?-1:b==="food-placeholder.jpeg"?1:a.localeCompare(b));}
export function catalogImageObjectName(itemId:string,format:"jpg"|"png"|"webp"){return `menu-items/${itemId}.${format}`;}
export async function chooseCatalogImage():Promise<CatalogImageSelection>{const result=await dialog.showOpenDialog({title:"Choose catalog food image",filters:[{name:"Food images",extensions:["jpg","jpeg","png","webp"]}],properties:["openFile"]});if(result.canceled||!result.filePaths[0])return{canceled:true,token:null,originalName:null,format:null,previewDataUrl:null};const path=result.filePaths[0],stats=statSync(path);if(stats.size>maxBytes)throw new Error("Choose an image no larger than 10 MB.");const buffer=readFileSync(path),info=inspectCatalogImage(buffer,basename(path)),token=randomUUID();staged.set(token,{path,expiresAt:Date.now()+tokenTtl,format:info.format,mimeType:info.mimeType});return{canceled:false,token,originalName:basename(path),format:info.format,previewDataUrl:dataUrl(buffer,info.mimeType)};}

function localPath(filename:string){if(!safeName.test(filename))return null;const cached=join(catalogImageCacheDirectory(),filename);if(existsSync(cached))return cached;const packaged=join(packagedCatalogDirectory(),filename);return existsSync(packaged)?packaged:null;}
export function resolveCatalogImagePath(filename?:string|null){return localPath(filename||"")??join(packagedCatalogDirectory(),"food-placeholder.jpeg");}
export async function ensureCatalogImageCached(filename?:string|null){if(!filename||filename==="food-placeholder.jpeg"||localPath(filename))return resolveCatalogImagePath(filename);if(!safeName.test(filename))return resolveCatalogImagePath();try{const[data]=await gcsBucket().file(`menu-items/${filename}`).download();inspectCatalogImage(data,filename);const target=join(catalogImageCacheDirectory(),filename);writeFileSync(target,data);return target;}catch{return resolveCatalogImagePath();}}
export async function ensureCatalogImagesCached(items:CatalogItem[]){await Promise.all([...new Set(items.map((item)=>item.image).filter(Boolean))].map((name)=>ensureCatalogImageCached(name)));}
export async function catalogImageResponse(url:string){const name=decodeURIComponent(new URL(url).pathname.replace(/^\//,""));const path=await ensureCatalogImageCached(name);const buffer=readFileSync(path),info=inspectCatalogImage(buffer,basename(path));return new Response(buffer,{headers:{"Content-Type":info.mimeType,"Cache-Control":"no-cache"}});}

async function removeCloudVariants(itemId:string,keep?:string){const bucket=gcsBucket();const[files]=await bucket.getFiles({prefix:`menu-items/${itemId}.`});await Promise.all(files.filter((file)=>file.name!==keep&&/^menu-items\/[a-z0-9-]+\.(?:jpg|png|webp)$/.test(file.name)).map((file)=>file.delete({ignoreNotFound:true})));for(const extension of ["jpg","png","webp"])if(`${itemId}.${extension}`!==keep?.slice("menu-items/".length))rmSync(join(catalogImageCacheDirectory(),`${itemId}.${extension}`),{force:true});}
export async function saveCatalogItemWithImage(item:CatalogItem,selection:CatalogImageSaveSelection){validateCatalogItemReferences(item);let next=item;const current=getCatalog().items.find((entry)=>entry.id===item.id);
  if(selection.kind==="unchanged"){saveCatalogItem(item);saveCatalogItemCompatibility(item.id,item.webCompatible);return{item,warning:null};}
  if(selection.kind==="placeholder"||(selection.kind==="asset"&&selection.filename==="food-placeholder.jpeg")){if(current?.image&&new RegExp(`^${item.id}\\.(jpg|png|webp)$`).test(current.image))await removeCloudVariants(item.id);next={...item,image:"food-placeholder.jpeg"};}
  else {let buffer:Buffer,format:"jpg"|"png"|"webp",mimeType:string;
    if(selection.kind==="asset"){if(!selection.filename||!packagedCatalogAssets().some((asset)=>asset.filename===selection.filename))throw new Error("Select a packaged catalog image.");const path=join(packagedCatalogDirectory(),selection.filename);buffer=readFileSync(path);const info=inspectCatalogImage(buffer,selection.filename);format=info.format;mimeType=info.mimeType;}
    else {const entry=selection.token?staged.get(selection.token):null;if(!entry||entry.expiresAt<Date.now())throw new Error("The selected local image expired. Browse and select it again.");buffer=readFileSync(entry.path);const info=inspectCatalogImage(buffer,basename(entry.path));format=info.format;mimeType=info.mimeType;}
    const filename=`${item.id}.${format}`,object=catalogImageObjectName(item.id,format),bucket=gcsBucket();await bucket.file(object).save(buffer,{contentType:mimeType,metadata:{cacheControl:"no-cache, max-age=0, must-revalidate",metadata:{catalogItemId:item.id}}});writeFileSync(join(catalogImageCacheDirectory(),filename),buffer);await removeCloudVariants(item.id,object);next={...item,image:filename};if(selection.kind==="browse"&&selection.token)staged.delete(selection.token);
  }
  saveCatalogItem(next);saveCatalogItemCompatibility(next.id,next.webCompatible);return{item:next,warning:null};
}
