import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

export async function runProfileSecretHelper(mode:string,userDataPath:string,outputPath?:string){try{if(!userDataPath||!["decrypt","encrypt"].includes(mode))throw new Error("Invalid helper request.");if(mode==="decrypt"){const value=safeStorage.decryptString(readFileSync(join(userDataPath,"secrets.bin")));JSON.parse(value);process.stdout.write(value)}else{if(!outputPath)throw new Error("Missing credential output path.");let value="";process.stdin.setEncoding("utf8");for await(const chunk of process.stdin)value+=chunk;JSON.parse(value);writeFileSync(outputPath,safeStorage.encryptString(value))}app.exit(0)}catch{process.stderr.write("Profile credentials could not be processed.");app.exit(1)}}

if(process.argv[1]?.replace(/\\/g,"/").endsWith("/profile-secret-helper.js")){const[, ,mode,userDataPath,outputPath]=process.argv;app.setPath("userData",userDataPath);void app.whenReady().then(()=>runProfileSecretHelper(mode,userDataPath,outputPath))}
