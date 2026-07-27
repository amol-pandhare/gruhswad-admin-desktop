import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { inspectMenuImage, menuImageObjectName } from "../src/main/menu-publishing";

const directories:string[]=[];
afterEach(()=>directories.splice(0).forEach((path)=>rmSync(path,{recursive:true,force:true})));
function png(width=1085,height=1536){const data=Buffer.alloc(24);Buffer.from("89504e470d0a1a0a","hex").copy(data);data.writeUInt32BE(width,16);data.writeUInt32BE(height,20);return data;}

describe("menu image publishing",()=>{
  it("uses stable controlled object names",()=>{
    expect(menuImageObjectName("master",0)).toBe("menus/master-menu.png");
    expect(menuImageObjectName("master",1)).toBe("menus/master-menu-02.png");
    expect(menuImageObjectName("one-day",2)).toBe("menus/one-day-menu-03.png");
  });
  it("accepts only the expected PNG dimensions",()=>{
    const directory=mkdtempSync(join(tmpdir(),"gruhswad-publish-"));directories.push(directory);
    const valid=join(directory,"valid.png"),invalid=join(directory,"invalid.png");writeFileSync(valid,png());writeFileSync(invalid,png(100,100));
    expect(inspectMenuImage(valid)).toMatchObject({path:valid,size:24});
    expect(()=>inspectMenuImage(invalid)).toThrow(/1085x1536/);
  });
});
