import "server-only";
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {products as seedProducts} from "@/lib/products";

// NOTE: the file name/env default below intentionally still says "guia-do-fone" —
// it is a stable infrastructure identifier (matches the Docker volume and backup
// prefix already in production) and was deliberately NOT renamed as part of the
// Techno Blog rebrand, to avoid orphaning any existing deployment's data volume.
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "guia-do-fone.sqlite");
let connection: Database.Database | undefined;

// A migration is either pure DDL (`sql`, run in the schema phase, before seed())
// or a programmatic data step (`run`, executed in the data phase, after seed()).
// Splitting migrations into these two phases (instead of one flat list) is what
// lets data migrations safely assume the seed products already exist, without
// the ordering hazard the original inline "003" migration had.
type SchemaMigration = {id: string; sql: string};
// eslint-disable-next-line no-unused-vars -- "conn" here names a type-signature parameter, not a real binding
type DataMigration = {id: string; run: (conn: Database.Database) => void};
type Migration = SchemaMigration | DataMigration;
const isDataMigration = (m: Migration): m is DataMigration => "run" in m;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const affiliateMigration = [
  ["soundcore-p30i", "https://meli.la/31hbsds"],
  ["jbl-wave-buds-2", "https://meli.la/2EyM8zS"],
  ["qcy-melobuds-pro", "https://meli.la/246f3uU"],
  ["soundcore-p20i", "https://meli.la/3371j1i"],
  ["redmi-buds-6-pro", "https://meli.la/1Rscu23"],
  ["jbl-tune-beam-2", "https://meli.la/1oWBtxH"],
  ["galaxy-buds3-pro", "https://meli.la/2ugniMf"],
  ["edifier-w820nb-plus", "https://meli.la/2umHWe5"],
  ["jbl-tune-770nc", "https://meli.la/2Ekc4QE"],
  ["sony-wh-1000xm5", "https://meli.la/1LVvZz4"],
] as const;

const migrations: Migration[] = [
  {
    id: "001_products",
    sql: `CREATE TABLE products (id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,brand TEXT NOT NULL,position INTEGER NOT NULL CHECK(position>0),category TEXT NOT NULL,badge TEXT NOT NULL,short_description TEXT NOT NULL,full_description TEXT NOT NULL,benefits TEXT NOT NULL,attention_points TEXT NOT NULL,specifications TEXT NOT NULL,recommended_for TEXT NOT NULL,not_recommended_for TEXT NOT NULL,affiliate_url TEXT NOT NULL,search_url TEXT NOT NULL,image_id TEXT,image_alt TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT); CREATE INDEX products_active_position ON products(is_active,position); CREATE INDEX products_featured ON products(is_featured);`,
  },
  {
    id: "002_product_images",
    sql: `CREATE TABLE product_images (id TEXT PRIMARY KEY,original_name TEXT NOT NULL,mime_type TEXT NOT NULL CHECK(mime_type='image/webp'),width INTEGER NOT NULL,height INTEGER NOT NULL,size INTEGER NOT NULL,hash TEXT NOT NULL UNIQUE,data BLOB NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX product_images_hash ON product_images(hash);`,
  },
  // Was originally a hardcoded step that ran *before* seed() and threw on a
  // fresh database (seed hadn't populated the 10 slugs yet). Folded into the
  // ordinary data-migration phase (after seed()) under its original id, so it
  // is still a no-op on the current database (already recorded as applied)
  // and is now also correct on a brand-new one.
  {
    id: "003_official_affiliate_links",
    run: (conn) => {
      const found = conn
        .prepare(`SELECT slug FROM products WHERE slug IN (${affiliateMigration.map(() => "?").join(",")})`)
        .all(...affiliateMigration.map((x) => x[0])) as {slug: string}[];
      if (found.length !== affiliateMigration.length) throw new Error("Produtos do mapeamento de afiliados ausentes.");
      const update = conn.prepare("UPDATE products SET affiliate_url=?,updated_at=? WHERE slug=?");
      for (const [slug, url] of affiliateMigration) update.run(url, new Date().toISOString(), slug);
    },
  },

  // ---- Techno Blog data model (additive only — nothing above is touched) ----

  {
    id: "004_media_assets",
    sql: `CREATE TABLE media_assets (id TEXT PRIMARY KEY,original_name TEXT NOT NULL,mime_type TEXT NOT NULL CHECK(mime_type='image/webp'),width INTEGER NOT NULL,height INTEGER NOT NULL,size INTEGER NOT NULL,hash TEXT NOT NULL UNIQUE,data BLOB NOT NULL,source_type TEXT NOT NULL CHECK(source_type IN ('original_illustration','brand_provided','affiliate_program','licensed','official_authorized')),source_note TEXT,license TEXT,origin_url TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX media_assets_hash ON media_assets(hash);`,
  },
  {
    id: "005_brands",
    sql: `CREATE TABLE brands (id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,official_website TEXT,logo_image_id TEXT REFERENCES media_assets(id),is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX brands_active ON brands(is_active); CREATE INDEX brands_logo ON brands(logo_image_id);`,
  },
  {
    id: "006_categories",
    sql: `CREATE TABLE categories (id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT,image_id TEXT REFERENCES media_assets(id),is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE INDEX categories_active ON categories(is_active);`,
  },
  {
    id: "007_product_relational_columns",
    sql: `ALTER TABLE products ADD COLUMN brand_id TEXT REFERENCES brands(id); ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES categories(id); ALTER TABLE products ADD COLUMN model TEXT; ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','archived')); ALTER TABLE products ADD COLUMN official_url TEXT; ALTER TABLE products ADD COLUMN editorial_summary TEXT; ALTER TABLE products ADD COLUMN verdict TEXT; CREATE INDEX products_brand ON products(brand_id); CREATE INDEX products_category ON products(category_id);`,
  },
  {
    id: "008_backfill_brand_category",
    run: (conn) => {
      const now = new Date().toISOString();
      const catId = crypto.randomUUID();
      conn
        .prepare("INSERT INTO categories (id,name,slug,description,is_active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)")
        .run(catId, "Fones de ouvido", "fones-de-ouvido", "Fones TWS e headphones Bluetooth — a primeira categoria do Techno Blog.", now, now);
      const brandRows = conn.prepare("SELECT DISTINCT brand FROM products WHERE deleted_at IS NULL") .all() as {brand: string}[];
      const insertBrand = conn.prepare("INSERT INTO brands (id,name,slug,is_active,created_at,updated_at) VALUES (?,?,?,1,?,?)");
      const brandIdByName = new Map<string, string>();
      for (const {brand} of brandRows) {
        const id = crypto.randomUUID();
        insertBrand.run(id, brand, slugify(brand), now, now);
        brandIdByName.set(brand, id);
      }
      const products = conn.prepare("SELECT id,brand FROM products WHERE deleted_at IS NULL").all() as {id: string; brand: string}[];
      const update = conn.prepare("UPDATE products SET brand_id=?,category_id=?,updated_at=? WHERE id=?");
      for (const p of products) update.run(brandIdByName.get(p.brand) ?? null, catId, now, p.id);
    },
  },
  {
    id: "009_specification_definitions",
    sql: `CREATE TABLE specification_definitions (id TEXT PRIMARY KEY,category_id TEXT NOT NULL REFERENCES categories(id),key TEXT NOT NULL,label TEXT NOT NULL,data_type TEXT NOT NULL CHECK(data_type IN ('text','number','boolean')),unit TEXT,comparison_order INTEGER NOT NULL DEFAULT 0,is_key_specification INTEGER NOT NULL DEFAULT 0 CHECK(is_key_specification IN (0,1)), UNIQUE(category_id,key)); CREATE INDEX specification_definitions_category ON specification_definitions(category_id);`,
  },
  {
    id: "010_manufacturer_sources",
    sql: `CREATE TABLE manufacturer_sources (id TEXT PRIMARY KEY,brand_id TEXT REFERENCES brands(id),product_id TEXT REFERENCES products(id),official_url TEXT NOT NULL,source_title TEXT,country TEXT,language TEXT,fetched_at TEXT,verified_at TEXT,content_hash TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),notes TEXT, CHECK (brand_id IS NOT NULL OR product_id IS NOT NULL)); CREATE INDEX manufacturer_sources_brand ON manufacturer_sources(brand_id); CREATE INDEX manufacturer_sources_product ON manufacturer_sources(product_id); CREATE INDEX manufacturer_sources_status ON manufacturer_sources(status);`,
  },
  {
    id: "011_product_specifications",
    sql: `CREATE TABLE product_specifications (id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),specification_definition_id TEXT NOT NULL REFERENCES specification_definitions(id),value_text TEXT,value_number REAL,value_boolean INTEGER CHECK(value_boolean IN (0,1)),source_id TEXT REFERENCES manufacturer_sources(id),verified_at TEXT, UNIQUE(product_id,specification_definition_id)); CREATE INDEX product_specifications_product ON product_specifications(product_id); CREATE INDEX product_specifications_definition ON product_specifications(specification_definition_id);`,
  },
  {
    id: "012_backfill_specifications",
    run: (conn) => {
      const cat = conn.prepare("SELECT id FROM categories WHERE slug='fones-de-ouvido'").get() as {id: string} | undefined;
      if (!cat) return; // nothing seeded yet (fresh install ordering edge case) — safe no-op, nothing to lose
      const defs: [string, string, string, string | null, number, number][] = [
        ["tipo", "Tipo", "text", null, 1, 1],
        ["bateria", "Bateria", "text", null, 2, 1],
        ["anc", "ANC", "text", null, 3, 1],
        ["codec", "Codec", "text", null, 4, 0],
        ["resistencia", "Resistência", "text", null, 5, 0],
        ["multiponto", "Multiponto", "text", null, 6, 0],
      ];
      const insertDef = conn.prepare("INSERT INTO specification_definitions (id,category_id,key,label,data_type,unit,comparison_order,is_key_specification) VALUES (?,?,?,?,?,?,?,?)");
      const defId: Record<string, string> = {};
      for (const [key, label, dataType, unit, order, isKey] of defs) {
        const id = crypto.randomUUID();
        insertDef.run(id, cat.id, key, label, dataType, unit, order, isKey);
        defId[key] = id;
      }
      const jsonKeyToDefKey: Record<string, string> = {Tipo: "tipo", Bateria: "bateria", ANC: "anc", Codec: "codec", Resistência: "resistencia", Multiponto: "multiponto"};
      const products = conn.prepare("SELECT id,specifications FROM products WHERE deleted_at IS NULL").all() as {id: string; specifications: string}[];
      const insertVal = conn.prepare("INSERT INTO product_specifications (id,product_id,specification_definition_id,value_text) VALUES (?,?,?,?)");
      for (const p of products) {
        let spec: Record<string, string> = {};
        try {
          spec = JSON.parse(p.specifications);
        } catch {
          spec = {};
        }
        for (const [jsonKey, key] of Object.entries(jsonKeyToDefKey)) {
          if (spec[jsonKey] !== undefined) insertVal.run(crypto.randomUUID(), p.id, defId[key], String(spec[jsonKey]));
        }
      }
    },
  },
  {
    id: "013_rankings_and_ranking_items",
    sql: `CREATE TABLE rankings (id TEXT PRIMARY KEY,title TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT,category_id TEXT REFERENCES categories(id),methodology TEXT,published_at TEXT,updated_at TEXT,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived'))); CREATE INDEX rankings_category ON rankings(category_id); CREATE INDEX rankings_status ON rankings(status); CREATE TABLE ranking_items (id TEXT PRIMARY KEY,ranking_id TEXT NOT NULL REFERENCES rankings(id),product_id TEXT NOT NULL REFERENCES products(id),position INTEGER NOT NULL CHECK(position>0),badge TEXT,reason TEXT,main_benefit TEXT,main_limitation TEXT, UNIQUE(ranking_id,position), UNIQUE(ranking_id,product_id)); CREATE INDEX ranking_items_ranking ON ranking_items(ranking_id); CREATE INDEX ranking_items_product ON ranking_items(product_id);`,
  },
  {
    id: "014_backfill_ranking",
    run: (conn) => {
      const cat = conn.prepare("SELECT id FROM categories WHERE slug='fones-de-ouvido'").get() as {id: string} | undefined;
      const now = new Date().toISOString();
      const rankingId = crypto.randomUUID();
      conn
        .prepare("INSERT INTO rankings (id,title,slug,description,category_id,methodology,published_at,updated_at,status) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(rankingId, "Os melhores fones de ouvido do Mercado Livre", "melhores-fones-mercado-livre", "Ranking editorial de fones TWS e headphones ativos no catálogo.", cat?.id ?? null, "Priorizamos conforto, bateria, recursos do dia a dia e a relação entre o que cada modelo entrega e seu segmento.", now, now, "published");
      const products = conn.prepare("SELECT id,position,badge,short_description,attention_points FROM products WHERE deleted_at IS NULL ORDER BY position").all() as {id: string; position: number; badge: string; short_description: string; attention_points: string}[];
      const insertItem = conn.prepare("INSERT INTO ranking_items (id,ranking_id,product_id,position,badge,reason,main_benefit,main_limitation) VALUES (?,?,?,?,?,?,?,?)");
      for (const p of products) {
        let limitations: string[] = [];
        try {
          limitations = JSON.parse(p.attention_points);
        } catch {
          limitations = [];
        }
        insertItem.run(crypto.randomUUID(), rankingId, p.id, p.position, p.badge, p.badge, p.short_description, limitations[0] ?? null);
      }
    },
  },
  {
    id: "015_comparisons_and_comparison_items",
    sql: `CREATE TABLE comparisons (id TEXT PRIMARY KEY,title TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,summary TEXT,verdict TEXT,category_id TEXT REFERENCES categories(id),status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),published_at TEXT,updated_at TEXT); CREATE INDEX comparisons_category ON comparisons(category_id); CREATE INDEX comparisons_status ON comparisons(status); CREATE TABLE comparison_items (id TEXT PRIMARY KEY,comparison_id TEXT NOT NULL REFERENCES comparisons(id),product_id TEXT NOT NULL REFERENCES products(id),display_order INTEGER NOT NULL DEFAULT 0, UNIQUE(comparison_id,product_id)); CREATE INDEX comparison_items_comparison ON comparison_items(comparison_id);`,
  },
  {
    id: "016_trends",
    sql: `CREATE TABLE trends (id TEXT PRIMARY KEY,title TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,summary TEXT,reason TEXT,source_type TEXT,source_url TEXT,category_id TEXT REFERENCES categories(id),product_id TEXT REFERENCES products(id),image_id TEXT REFERENCES media_assets(id),starts_at TEXT,ends_at TEXT,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived'))); CREATE INDEX trends_category ON trends(category_id); CREATE INDEX trends_product ON trends(product_id); CREATE INDEX trends_status ON trends(status);`,
  },
  {
    id: "017_hero_banners",
    sql: `CREATE TABLE hero_banners (id TEXT PRIMARY KEY,eyebrow TEXT,title TEXT NOT NULL,description TEXT,image_id TEXT REFERENCES media_assets(id),destination_url TEXT,button_label TEXT,display_order INTEGER NOT NULL DEFAULT 0,starts_at TEXT,ends_at TEXT,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived'))); CREATE INDEX hero_banners_status ON hero_banners(status);`,
  },
  {
    id: "018_affiliate_offers",
    sql: `CREATE TABLE affiliate_offers (id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),retailer TEXT NOT NULL,affiliate_url TEXT NOT NULL,original_product_url TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','broken')),last_checked_at TEXT); CREATE INDEX affiliate_offers_product ON affiliate_offers(product_id); CREATE INDEX affiliate_offers_status ON affiliate_offers(status);`,
  },
  {
    id: "019_backfill_affiliate_offers",
    run: (conn) => {
      const now = new Date().toISOString();
      const products = conn.prepare("SELECT id,affiliate_url,search_url FROM products WHERE deleted_at IS NULL").all() as {id: string; affiliate_url: string; search_url: string}[];
      const insert = conn.prepare("INSERT INTO affiliate_offers (id,product_id,retailer,affiliate_url,original_product_url,status,last_checked_at) VALUES (?,?,?,?,?,?,?)");
      for (const p of products) insert.run(crypto.randomUUID(), p.id, "Mercado Livre", p.affiliate_url, p.search_url, "active", now);
    },
  },

  // ---- MVP-1: manual offers admin (price/primary tracking on top of the existing table) ----

  {
    id: "020_affiliate_offer_fields",
    sql: `ALTER TABLE affiliate_offers ADD COLUMN current_price REAL; ALTER TABLE affiliate_offers ADD COLUMN previous_price REAL; ALTER TABLE affiliate_offers ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)); ALTER TABLE affiliate_offers ADD COLUMN internal_note TEXT; CREATE UNIQUE INDEX affiliate_offers_url_unique ON affiliate_offers(product_id,affiliate_url); CREATE UNIQUE INDEX affiliate_offers_primary_unique ON affiliate_offers(product_id,retailer) WHERE is_primary=1 AND status='active';`,
  },
  {
    // Each of the 10 seed products already has exactly one active offer, so
    // marking all of them primary is trivially safe (no two rows share a
    // product_id+retailer pair) and gives the new public query something to
    // return without requiring an admin to revisit every product by hand.
    id: "021_backfill_primary_offers",
    run: (conn) => {
      conn.prepare("UPDATE affiliate_offers SET is_primary=1 WHERE status='active'").run();
    },
  },
  {
    // Money must never be stored as a float — see lib/offers-rules.ts
    // (brlToCents/centsToBrl) for why. Schema-phase step only: adds the new
    // columns. The value migration + removal of the old REAL columns happens
    // in 023 below, in the data phase, so the copy is guaranteed to run
    // before the drop (phase ordering is fixed by applyMigrations: all `sql`
    // steps run before seed(), all `run` steps after — interleaving a DROP
    // into this same `sql` step would risk it executing before 023's copy).
    id: "022_offer_price_cents_columns",
    sql: `ALTER TABLE affiliate_offers ADD COLUMN current_price_cents INTEGER; ALTER TABLE affiliate_offers ADD COLUMN previous_price_cents INTEGER;`,
  },
  {
    // Explicit, documented conversion rule for any pre-existing REAL price:
    // cents = Math.round(reais * 100). As of this migration's authoring, a
    // full production-data audit showed all 10 real offer rows have
    // current_price/previous_price = NULL (nothing was ever saved through
    // the REAL-typed fields), so this loop is a no-op in practice — it exists
    // to safely carry over a value if one exists in some other environment,
    // never to invent one. Rows that are NULL stay NULL; nothing is defaulted
    // to 0. Dropping the old columns only happens after this copy, in the
    // same transaction (see applyMigrations' phase-2 wrapper), so a failure
    // here rolls back the copy and the drop together rather than risking a drop
    // without its backfill.
    id: "023_migrate_offer_prices_to_cents",
    run: (conn) => {
      const rows = conn
        .prepare("SELECT id, current_price, previous_price FROM affiliate_offers WHERE current_price IS NOT NULL OR previous_price IS NOT NULL")
        .all() as {id: string; current_price: number | null; previous_price: number | null}[];
      const update = conn.prepare("UPDATE affiliate_offers SET current_price_cents=?, previous_price_cents=? WHERE id=?");
      for (const r of rows) {
        const currentCents = r.current_price === null ? null : Math.round(r.current_price * 100);
        const previousCents = r.previous_price === null ? null : Math.round(r.previous_price * 100);
        update.run(currentCents, previousCents, r.id);
      }
      conn.exec("ALTER TABLE affiliate_offers DROP COLUMN current_price");
      conn.exec("ALTER TABLE affiliate_offers DROP COLUMN previous_price");
    },
  },
];

function applyMigrations(conn: Database.Database) {
  conn.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((conn.prepare("SELECT id FROM schema_migrations").all() as {id: string}[]).map((x) => x.id));
  const markApplied = conn.prepare("INSERT INTO schema_migrations VALUES (?,?)");

  // Phase 1: schema (DDL only), always before seed() so seed() can insert into
  // tables these migrations just created.
  conn.transaction(() => {
    for (const m of migrations) {
      if (isDataMigration(m) || applied.has(m.id)) continue;
      conn.exec(m.sql);
      markApplied.run(m.id, new Date().toISOString());
      applied.add(m.id);
    }
  })();

  seed(conn);

  // Phase 2: data migrations, always after seed() so they can safely assume
  // the seed products already exist.
  conn.transaction(() => {
    for (const m of migrations) {
      if (!isDataMigration(m) || applied.has(m.id)) continue;
      m.run(conn);
      markApplied.run(m.id, new Date().toISOString());
      applied.add(m.id);
    }
  })();
}

function seed(conn: Database.Database) {
  const count = (conn.prepare("SELECT count(*) count FROM products").get() as {count: number}).count;
  if (count) return;
  const insert = conn.prepare(
    `INSERT INTO products (id,name,slug,brand,position,category,badge,short_description,full_description,benefits,attention_points,specifications,recommended_for,not_recommended_for,affiliate_url,search_url,image_alt,is_active,is_featured,created_at,updated_at) VALUES (@id,@name,@slug,@brand,@position,@category,@badge,@description,@description,@benefits,@attention,@spec,@recommended,@notRecommended,@affiliate,@search,@alt,1,@featured,@updated,@updated)`
  );
  conn.transaction(() =>
    seedProducts.forEach((p) =>
      insert.run({
        id: p.id,
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        position: p.position,
        category: p.category,
        badge: p.badge,
        description: p.description,
        benefits: JSON.stringify(p.benefits),
        attention: JSON.stringify(p.limitations),
        spec: JSON.stringify({Tipo: p.type, Bateria: p.battery, ANC: p.anc, Codec: p.codec, Resistência: p.resistance, Multiponto: p.multipoint}),
        recommended: JSON.stringify(p.use),
        notRecommended: JSON.stringify(["Confirme especificações oficiais"]),
        affiliate: p.affiliateUrl,
        search: p.searchUrl,
        alt: p.alt,
        featured: p.featured ? 1 : 0,
        updated: p.updatedAt,
      })
    )
  )();
}

export function db() {
  if (connection) return connection;
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  connection = new Database(dbPath, {timeout: 5000});
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  applyMigrations(connection);
  return connection;
}

export type DbProduct = {
  id: string; name: string; slug: string; brand: string; position: number; category: string; badge: string;
  short_description: string; full_description: string; benefits: string; attention_points: string; specifications: string;
  recommended_for: string; not_recommended_for: string; affiliate_url: string; search_url: string;
  image_id: string | null; image_alt: string; is_active: number; is_featured: number;
  created_at: string; updated_at: string;
  brand_id: string | null; category_id: string | null; model: string | null; status: string;
  official_url: string | null; editorial_summary: string | null; verdict: string | null;
};

export const listProducts = (activeOnly = false) =>
  db().prepare(`SELECT * FROM products WHERE deleted_at IS NULL ${activeOnly ? "AND is_active=1" : ""} ORDER BY position,name`).all() as DbProduct[];
export const productById = (id: string) => db().prepare("SELECT * FROM products WHERE id=? AND deleted_at IS NULL").get(id) as DbProduct | undefined;
export const productBySlug = (slug: string) => db().prepare("SELECT * FROM products WHERE slug=? AND deleted_at IS NULL AND is_active=1").get(slug) as DbProduct | undefined;
export const productStats = () => db().prepare("SELECT sum(is_active=1) active,sum(is_active=0) inactive FROM products WHERE deleted_at IS NULL").get() as {active: number; inactive: number};

export type AdminProductRow = DbProduct & {brand_name: string | null; category_name: string | null; spec_count: number; source_count: number};
export const adminListProducts = (): AdminProductRow[] =>
  db()
    .prepare(
      `SELECT p.*, b.name AS brand_name, c.name AS category_name,
         (SELECT count(*) FROM product_specifications ps WHERE ps.product_id=p.id) AS spec_count,
         (SELECT count(*) FROM manufacturer_sources ms WHERE ms.product_id=p.id) AS source_count
       FROM products p
       LEFT JOIN brands b ON b.id=p.brand_id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.position,p.name`
    )
    .all() as AdminProductRow[];

export type AdminDashboardStats = {
  totalProducts: number; activeProducts: number; draftProducts: number; archivedProducts: number;
  totalBrands: number; totalCategories: number;
  productsWithoutSource: number; productsWithoutSpecs: number; productsWithoutOffer: number;
};
export function adminDashboardStats(): AdminDashboardStats {
  const conn = db();
  const byStatus = new Map((conn.prepare("SELECT status,count(*) n FROM products WHERE deleted_at IS NULL GROUP BY status").all() as {status: string; n: number}[]).map((r) => [r.status, r.n]));
  const count = (sql: string) => (conn.prepare(sql).get() as {n: number}).n;
  return {
    totalProducts: count("SELECT count(*) n FROM products WHERE deleted_at IS NULL"),
    activeProducts: count("SELECT count(*) n FROM products WHERE deleted_at IS NULL AND is_active=1"),
    draftProducts: byStatus.get("draft") ?? 0,
    archivedProducts: byStatus.get("archived") ?? 0,
    totalBrands: count("SELECT count(*) n FROM brands WHERE is_active=1"),
    totalCategories: count("SELECT count(*) n FROM categories WHERE is_active=1"),
    productsWithoutSource: count("SELECT count(*) n FROM products p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM manufacturer_sources s WHERE s.product_id=p.id)"),
    productsWithoutSpecs: count("SELECT count(*) n FROM products p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM product_specifications ps WHERE ps.product_id=p.id)"),
    productsWithoutOffer: count("SELECT count(*) n FROM products p WHERE p.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.product_id=p.id AND o.status='active' AND o.is_primary=1)"),
  };
}

export const databasePath = dbPath;
export function closeDatabase() {
  if (connection) {
    connection.close();
    connection = undefined;
  }
}
