import {NextResponse} from "next/server";
import {requireAdmin} from "@/lib/admin";
import {backupFile,deleteBackup} from "@/lib/backups";
import fs from "node:fs";
export async function GET(_:Request,{params}:{params:Promise<{name:string}>}){try{await requireAdmin();const file=backupFile((await params).name);if(!file)return new Response(null,{status:404});return new Response(fs.readFileSync(file),{headers:{"Content-Type":"application/vnd.sqlite3","Content-Disposition":"attachment; filename=backup.sqlite","Cache-Control":"no-store"}})}catch{return new Response(null,{status:401})}}
export async function DELETE(_:Request,{params}:{params:Promise<{name:string}>}){try{await requireAdmin();deleteBackup((await params).name);return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Não autorizado"},{status:400})}}
