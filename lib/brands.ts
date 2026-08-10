import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";

export type DbBrand = {
  id: string;
  name: string;
  slug: string;
  official_website: string | null;
  logo_image_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};
export type BrandWithCount = DbBrand & {product_count: number};

export const listBrands = (): BrandWithCount[] =>
  db()
    .prepare(
      `SELECT b.*, (SELECT count(*) FROM products p WHERE p.brand_id=b.id AND p.deleted_at IS NULL) AS product_count
       FROM brands b ORDER BY b.name`
    )
    .all() as BrandWithCount[];

export const brandById = (id: string) => db().prepare("SELECT * FROM brands WHERE id=?").get(id) as DbBrand | undefined;

export function createBrand(data: {name: string; slug: string; officialWebsite: string | null}) {
  const now = new Date().toISOString();
  const record = {id: crypto.randomUUID(), name: data.name, slug: data.slug, official_website: data.officialWebsite, is_active: 1, created_at: now, updated_at: now};
  db()
    .prepare("INSERT INTO brands (id,name,slug,official_website,is_active,created_at,updated_at) VALUES (@id,@name,@slug,@official_website,@is_active,@created_at,@updated_at)")
    .run(record);
  return record;
}

export function updateBrand(id: string, data: {name: string; slug: string; officialWebsite: string | null; isActive: boolean}) {
  const now = new Date().toISOString();
  db().prepare("UPDATE brands SET name=?,slug=?,official_website=?,is_active=?,updated_at=? WHERE id=?").run(data.name, data.slug, data.officialWebsite, data.isActive ? 1 : 0, now, id);
  return brandById(id);
}
