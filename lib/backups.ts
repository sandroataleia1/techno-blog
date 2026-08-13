import "server-only"; import Database from "better-sqlite3"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import {closeDatabase,databasePath,db} from "@/lib/db";
const dir=process.env.BACKUP_PATH||path.join(path.dirname(databasePath),"backups"),max=Number(process.env.BACKUP_MAX_COUNT||10),limit=Number(process.env.BACKUP_MAX_BYTES||200*1024*1024);const safeName=/^guia-do-fone-\d{8}T\d{6}Z\.sqlite$/;
const stamp=()=>new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");export function backupPath(){fs.mkdirSync(dir,{recursive:true});return dir}
// turbopackIgnore: `dir` is only known at runtime (BACKUP_PATH override, or
// derived from DATABASE_PATH) — Turbopack's static analyzer can't scope it
// to a subfolder, so without this it falls back to tracing (and bundling
// into .next/standalone) the entire project, database included. These reads
// are genuinely dynamic — the backup directory's contents are runtime data,
// never build-time assets — so opting out of tracing here is correct, not
// just a warning suppression. See next.config.ts's outputFileTracingExcludes
// for the second, independent layer that keeps data/** out of the build
// artifact even if some other dynamic fs access is added later.
export function listBackups(){return fs.readdirSync(/*turbopackIgnore: true*/backupPath()).filter(x=>safeName.test(x)).map(x=>{const s=fs.statSync(/*turbopackIgnore: true*/path.join(dir,x));return {name:x,size:s.size,createdAt:s.mtime.toISOString()}}).sort((a,b)=>b.name.localeCompare(a.name))}
function trim(){const all=listBackups();for(const b of all.slice(max))fs.unlinkSync(path.join(dir,b.name))}
export function createBackup(){const file=`guia-do-fone-${stamp()}.sqlite`,target=path.join(backupPath(),file);db().prepare("VACUUM INTO ?").run(target);trim();return {name:file,...fs.statSync(target),schema:(db().prepare("SELECT count(*) n FROM schema_migrations").get() as {n:number}).n}}
export function backupFile(name:string){if(!safeName.test(name))return;const file=path.join(backupPath(),name);return fs.existsSync(file)?file:undefined}
export function deleteBackup(name:string){const file=backupFile(name);if(!file)throw new Error("Backup não encontrado.");if(listBackups()[0]?.name===name)throw new Error("O backup mais recente não pode ser removido.");fs.unlinkSync(file)}
export function restoreBackup(name:string){const source=backupFile(name);if(!source)throw new Error("Backup não encontrado.");if(fs.statSync(/*turbopackIgnore: true*/source).size>limit)throw new Error("Backup excede o limite configurado.");const temp=path.join(backupPath(),`.restore-${crypto.randomUUID()}.sqlite`);fs.copyFileSync(source,temp);const check=new Database(temp,{readonly:true});try{const ok=(check.pragma("integrity_check",{simple:true}) as string)==="ok";const tables=(check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','schema_migrations')").all() as {name:string}[]).length;if(!ok||tables!==2)throw new Error("Backup inválido.");}finally{check.close()}const safety=createBackup();closeDatabase();try{fs.renameSync(databasePath,`${databasePath}.previous-${Date.now()}`);fs.renameSync(temp,databasePath);db();return safety}catch(e){if(fs.existsSync(temp))fs.unlinkSync(temp);throw e}}
