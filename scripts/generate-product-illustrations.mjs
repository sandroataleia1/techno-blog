// One-off content operation: generates original, in-house line-art illustrations
// (no brand photography, no scraped assets) for products that don't have an
// image yet, and stores them through the same product_images table and
// products.image_id/image_alt columns the admin upload flow already uses.
// Does not touch lib/images.ts, the upload route, or any business logic.
import Database from "better-sqlite3";
import sharp from "sharp";
import crypto from "node:crypto";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || path.resolve("data/guia-do-fone.sqlite");
const db = new Database(dbPath);

const INK = "#0B0F14";
const METAL = "#98A1AD";

const WAVE = [22, 48, 30, 66, 40, 82, 55, 34, 70, 46, 90, 58, 26, 74, 42, 60, 20, 50, 36, 64, 28, 78, 44, 32, 68, 24, 52, 38, 56, 30, 72, 20];

function backdrop() {
  const bars = WAVE.map((h, i) => {
    const x = 20 + i * ((760 - 40) / (WAVE.length - 1));
    const barH = h * 2.2;
    return `<rect x="${x.toFixed(1)}" y="${(400 - barH / 2).toFixed(1)}" width="8" height="${barH.toFixed(1)}" rx="4" fill="${METAL}" opacity="0.14"/>`;
  }).join("");
  return bars;
}

function headphoneIcon() {
  return `
    <path d="M170 430 V360 a230 230 0 0 1 460 0 V430" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
    <rect x="120" y="400" width="100" height="180" rx="46" fill="none" stroke="${INK}" stroke-width="22"/>
    <rect x="580" y="400" width="100" height="180" rx="46" fill="none" stroke="${INK}" stroke-width="22"/>
  `;
}

function twsIcon() {
  const bud = (cx) => `
    <rect x="${cx - 62}" y="380" width="124" height="200" rx="62" fill="none" stroke="${INK}" stroke-width="20"/>
    <path d="M${cx + 18} 392 L${cx + 68} 302" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>
  `;
  return `${bud(260)}${bud(540)}`;
}

function svgFor(type) {
  const icon = type === "Headphone" ? headphoneIcon() : twsIcon();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${backdrop()}${icon}</svg>`;
}

async function render(type) {
  const svg = svgFor(type);
  const data = await sharp(Buffer.from(svg)).resize(800, 800).webp({quality: 82}).toBuffer();
  const meta = await sharp(data).metadata();
  return {data, width: meta.width, height: meta.height};
}

function saveImage(originalName, image) {
  const hash = crypto.createHash("sha256").update(image.data).digest("hex");
  const existing = db.prepare("SELECT id FROM product_images WHERE hash=?").get(hash);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO product_images VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, originalName, "image/webp", image.width, image.height, image.data.length, hash, image.data, now, now);
  return id;
}

async function run() {
  const products = db.prepare("SELECT id,name,slug,specifications,image_id FROM products WHERE deleted_at IS NULL").all();
  const cache = {};
  let updated = 0;
  for (const p of products) {
    if (p.image_id) continue;
    let type = "TWS";
    try { type = JSON.parse(p.specifications).Tipo === "Headphone" ? "Headphone" : "TWS"; } catch (_e) { void _e; }
    cache[type] = cache[type] || (await render(type));
    const imageId = saveImage(`${p.slug}-ilustracao-editorial.webp`, cache[type]);
    const alt = `Ilustração editorial do ${p.name} (${type === "Headphone" ? "headphone" : "fone TWS"}), representação gráfica, não é foto do fabricante.`;
    db.prepare("UPDATE products SET image_id=?,image_alt=?,updated_at=? WHERE id=? AND deleted_at IS NULL").run(imageId, alt, new Date().toISOString(), p.id);
    updated++;
  }
  console.log(`Ilustrações aplicadas a ${updated} produto(s) em ${dbPath}.`);
}

run().finally(() => db.close());
