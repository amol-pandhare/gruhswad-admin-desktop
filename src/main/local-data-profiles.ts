import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export type LocalDataProfile = "production" | "intensive-testing";
export type LocalDataProfileInfo = { id: LocalDataProfile; label: string; userDataPath: string; databasePath: string; exists: boolean };
export type LocalDataProfileState = { active: LocalDataProfile; selectionPath: string; profiles: LocalDataProfileInfo[] };

export const PROFILE_SELECTION_FILENAME = "gruhswad-admin-desktop-profile.json";
export const PRODUCTION_DIRECTORY = "gruhswad-admin-desktop";
export const TEST_DIRECTORY = "gruhswad-admin-desktop-testing";
export const DATABASE_FILENAME = "gruhswad-admin.db";

export function readSelectedProfile(selectionPath: string): LocalDataProfile {
  try { const parsed=JSON.parse(readFileSync(selectionPath,"utf8")) as {active?:unknown}; return parsed.active==="intensive-testing"?"intensive-testing":"production"; }
  catch { return "production"; }
}
export function writeSelectedProfile(selectionPath:string,active:LocalDataProfile){mkdirSync(dirname(selectionPath),{recursive:true});const temporary=`${selectionPath}.tmp`;writeFileSync(temporary,JSON.stringify({active},null,2),"utf8");renameSync(temporary,selectionPath);}
export function profileState(appDataPath:string,active:LocalDataProfile):LocalDataProfileState {
  const create=(id:LocalDataProfile,directory:string,label:string):LocalDataProfileInfo=>{const userDataPath=join(appDataPath,directory),databasePath=join(userDataPath,DATABASE_FILENAME);return{id,label,userDataPath,databasePath,exists:existsSync(databasePath)}};
  return{active,selectionPath:join(appDataPath,PROFILE_SELECTION_FILENAME),profiles:[create("production",PRODUCTION_DIRECTORY,"Production"),create("intensive-testing",TEST_DIRECTORY,"Intensive testing")]};
}
export async function cloneDatabase(source:Database.Database,destinationPath:string){
  mkdirSync(dirname(destinationPath),{recursive:true});const temporary=`${destinationPath}.copying`;rmSync(temporary,{force:true});await source.backup(temporary);let candidate:Database.Database|undefined;
  try{candidate=new Database(temporary,{readonly:true});if(candidate.pragma("integrity_check",{simple:true})!=="ok")throw new Error("The test database copy failed SQLite integrity validation.");if(!candidate.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get())throw new Error("The test database copy is missing migration history.");}finally{candidate?.close();}
  let safetyCopy:string|null=null;if(existsSync(destinationPath)){safetyCopy=`${destinationPath}.previous-${new Date().toISOString().replace(/[:.]/g,"-")}`;renameSync(destinationPath,safetyCopy);}
  try{renameSync(temporary,destinationPath);}catch(error){if(safetyCopy&&existsSync(safetyCopy))renameSync(safetyCopy,destinationPath);throw error;}return{destinationPath,safetyCopy};
}
