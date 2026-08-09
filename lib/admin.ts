import "server-only"; import crypto from "node:crypto"; import {cookies} from "next/headers";
const cookieName="guia_admin"; const ttl=60*60*8;
function secret(){return process.env.ADMIN_SESSION_SECRET||""} export function configured(){return Boolean(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD_HASH&&secret())}
export function verifyPassword(password:string){const encoded=process.env.ADMIN_PASSWORD_HASH||"";const [kind,salt,expected]=encoded.split("$");if(kind!=="scrypt"||!salt||!expected)return false;const actual=crypto.scryptSync(password,salt,64).toString("hex");return crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected))}
function sign(value:string){return crypto.createHmac("sha256",secret()).update(value).digest("base64url")}
export async function createSession(){const value=Buffer.from(JSON.stringify({email:process.env.ADMIN_EMAIL,exp:Date.now()+ttl*1000})).toString("base64url");(await cookies()).set(cookieName,`${value}.${sign(value)}`,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/admin",maxAge:ttl})}
export async function adminSession(){if(!configured())return false;const token=(await cookies()).get(cookieName)?.value;if(!token)return false;const [value,sig]=token.split(".");if(!value||!sig||!crypto.timingSafeEqual(Buffer.from(sign(value)),Buffer.from(sig)))return false;try{return JSON.parse(Buffer.from(value,"base64url").toString()).exp>Date.now()}catch{return false}}
export async function requireAdmin(){if(!await adminSession())throw new Error("UNAUTHORIZED")}
export async function clearSession(){(await cookies()).delete(cookieName)}
export function validAffiliate(url:string){try{const u=new URL(url);const allow=(process.env.AFFILIATE_ALLOWED_HOSTS||"mercadolivre.com.br,lista.mercadolivre.com.br,meli.la").split(",");return u.protocol==="https:"&&allow.some(d=>d==="meli.la"?u.hostname==="meli.la":u.hostname===d||u.hostname.endsWith(`.${d}`))}catch{return false}}
export function id(){return crypto.randomUUID()}
