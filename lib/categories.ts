import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";

export type DbCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};
export type CategoryWithCount = DbCategory & {product_count: number};

export const listCategories = (): CategoryWithCount[] =>
  db()
    .prepare(
      `SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id=c.id AND p.deleted_at IS NULL) AS product_count
       FROM categories c ORDER BY c.name`
    )
    .all() as CategoryWithCount[];

export const categoryById = (id: string) => db().prepare("SELECT * FROM categories WHERE id=?").get(id) as DbCategory | undefined;

export function createCategory(data: {name: string; slug: string; description: string | null}) {
  const now = new Date().toISOString();
  const record = {id: crypto.randomUUID(), name: data.name, slug: data.slug, description: data.description, is_active: 1, created_at: now, updated_at: now};
  db()
    .prepare("INSERT INTO categories (id,name,slug,description,is_active,created_at,updated_at) VALUES (@id,@name,@slug,@description,@is_active,@created_at,@updated_at)")
    .run(record);
  return record;
}

export function updateCategory(id: string, data: {name: string; slug: string; description: string | null; isActive: boolean}) {
  const now = new Date().toISOString();
  db().prepare("UPDATE categories SET name=?,slug=?,description=?,is_active=?,updated_at=? WHERE id=?").run(data.name, data.slug, data.description, data.isActive ? 1 : 0, now, id);
  return categoryById(id);
}
