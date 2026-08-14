import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { cloneDatabase, profileState, readSelectedProfile, writeSelectedProfile } from "../src/main/local-data-profiles";

describe("local data profiles",()=>{
  it("uses fixed production and intensive-testing paths",()=>{const appDataPath=join(tmpdir(),"gruhswad-profile-root"),state=profileState(appDataPath,"production");expect(state.profiles.map(profile=>profile.databasePath)).toEqual([join(appDataPath,"gruhswad-admin-desktop","gruhswad-admin.db"),join(appDataPath,"gruhswad-admin-desktop-testing","gruhswad-admin.db")])});
  it("falls back to production for missing, corrupt, or unsupported selection",()=>{const directory=mkdtempSync(join(tmpdir(),"gruhswad-profiles-")),path=join(directory,"selection.json");expect(readSelectedProfile(path)).toBe("production");writeFileSync(path,"not json");expect(readSelectedProfile(path)).toBe("production");writeFileSync(path,JSON.stringify({active:"unknown"}));expect(readSelectedProfile(path)).toBe("production");writeSelectedProfile(path,"intensive-testing");expect(JSON.parse(readFileSync(path,"utf8")).active).toBe("intensive-testing");expect(readSelectedProfile(path)).toBe("intensive-testing")});
  it("creates a validated online copy and preserves a previous test database",async()=>{const directory=mkdtempSync(join(tmpdir(),"gruhswad-clone-")),sourcePath=join(directory,"source.db"),destination=join(directory,"test","gruhswad-admin.db"),source=new Database(sourcePath);source.exec("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY); INSERT INTO schema_migrations VALUES ('0001'); CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES ('first')");await cloneDatabase(source,destination);let copy=new Database(destination,{readonly:true});expect(copy.prepare("SELECT value FROM sample").pluck().get()).toBe("first");copy.close();source.exec("UPDATE sample SET value='second'");const refreshed=await cloneDatabase(source,destination);expect(refreshed.safetyCopy).toBeTruthy();copy=new Database(destination,{readonly:true});expect(copy.prepare("SELECT value FROM sample").pluck().get()).toBe("second");copy.close();source.close()});
});
