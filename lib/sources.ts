import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";

export type SourceStatus = "pending" | "approved" | "rejected";
export type DbManufacturerSource = {
  id: string;
  brand_id: string | null;
  product_id: string | null;
  official_url: string;
  source_title: string | null;
  country: string | null;
  language: string | null;
  fetched_at: string | null;
  verified_at: string | null;
  content_hash: string | null;
  status: SourceStatus;
  notes: string | null;
};
export type SourceWithContext = DbManufacturerSource & {brand_name: string | null; product_name: string | null};

export const listSources = (): SourceWithContext[] =>
  db()
    .prepare(
      `SELECT s.*, b.name AS brand_name, p.name AS product_name
       FROM manufacturer_sources s LEFT JOIN brands b ON b.id=s.brand_id LEFT JOIN products p ON p.id=s.product_id
       ORDER BY s.status='pending' DESC, s.official_url`
    )
    .all() as SourceWithContext[];

export const sourcesForProduct = (productId: string) => db().prepare("SELECT * FROM manufacturer_sources WHERE product_id=? ORDER BY rowid DESC").all(productId) as DbManufacturerSource[];

export const sourceById = (id: string) => db().prepare("SELECT * FROM manufacturer_sources WHERE id=?").get(id) as DbManufacturerSource | undefined;

export function createSource(data: {brandId: string | null; productId: string | null; officialUrl: string; sourceTitle: string | null; country: string | null; language: string | null; notes: string | null}) {
  const record = {
    id: crypto.randomUUID(),
    brand_id: data.brandId,
    product_id: data.productId,
    official_url: data.officialUrl,
    source_title: data.sourceTitle,
    country: data.country,
    language: data.language,
    fetched_at: null,
    verified_at: null,
    content_hash: null,
    status: "pending" as const,
    notes: data.notes,
  };
  db()
    .prepare(
      "INSERT INTO manufacturer_sources (id,brand_id,product_id,official_url,source_title,country,language,fetched_at,verified_at,content_hash,status,notes) VALUES (@id,@brand_id,@product_id,@official_url,@source_title,@country,@language,@fetched_at,@verified_at,@content_hash,@status,@notes)"
    )
    .run(record);
  return record;
}

export function updateSourceStatus(id: string, status: SourceStatus, notes: string | null) {
  const now = new Date().toISOString();
  db()
    .prepare("UPDATE manufacturer_sources SET status=?,notes=?,verified_at=? WHERE id=?")
    .run(status, notes, status === "approved" ? now : null, id);
  return sourceById(id);
}
