import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import { catalogAssetNames, catalogImageObjectName, inspectCatalogImage } from "../src/main/catalog-images";

describe("catalog images",()=>{
  it("lists only packaged food assets",()=>{expect(catalogAssetNames(["gruhswad-menu-logo.png","MASTER-002_Template.png","food-placeholder.jpeg","1000128453.jpg"])).toEqual(["food-placeholder.jpeg","1000128453.jpg"]);});
  it("uses one controlled object name per stable item ID",()=>{expect(catalogImageObjectName("pav-bhaji","jpg")).toBe("menu-items/pav-bhaji.jpg");});
  it("validates real image contents and matching extensions",()=>{const data=readFileSync(join(process.cwd(),"src/renderer/public/catalog/1000128453.jpg"));expect(inspectCatalogImage(data,"dish.jpg")).toMatchObject({format:"jpg",mimeType:"image/jpeg"});expect(()=>inspectCatalogImage(data,"dish.png")).toThrow(/extension/);expect(()=>inspectCatalogImage(Buffer.from("not an image"),"dish.jpg")).toThrow(/valid JPEG/);});
});
