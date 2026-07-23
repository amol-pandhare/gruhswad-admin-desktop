import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source=resolve("build/icon-256.png"),target=resolve("build/icon.ico"),png=readFileSync(source);
const header=Buffer.alloc(22);
header.writeUInt16LE(0,0);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
header.writeUInt8(0,6);header.writeUInt8(0,7);header.writeUInt8(0,8);header.writeUInt8(0,9);
header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(header.length,18);
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,Buffer.concat([header,png]));
console.log(`Created ${target}`);
