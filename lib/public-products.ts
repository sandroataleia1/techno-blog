import "server-only";
import {listProducts} from "@/lib/db";
import type {Product} from "@/lib/products";
const parse=(value:string)=>{try{return JSON.parse(value)}catch{return []}};
export function publicProducts():Product[]{return listProducts(true).map(p=>{const spec=parse(p.specifications) as Record<string,string>;return {id:p.id,slug:p.slug,position:p.position,name:p.name,brand:p.brand,category:p.category,badge:p.badge,description:p.short_description,benefits:parse(p.benefits),limitations:parse(p.attention_points),type:spec.Tipo==="Headphone"?"Headphone":"TWS",battery:spec.Bateria||"Não informado",anc:spec.ANC||"Não informado",codec:spec.Codec||"Não informado",resistance:spec.Resistência||"Não informado",multipoint:spec.Multiponto||"Não informado",use:parse(p.recommended_for),priceBand:"Não informado",image:p.image_id?`/api/images/${p.image_id}`:"",alt:p.image_alt,affiliateUrl:p.affiliate_url,searchUrl:p.search_url,featured:Boolean(p.is_featured),updatedAt:p.updated_at}})}
