import "server-only";
import crypto from "node:crypto";
import {db} from "@/lib/db";

export type SpecDataType = "text" | "number" | "boolean";
export type DbSpecDefinition = {
  id: string;
  category_id: string;
  key: string;
  label: string;
  data_type: SpecDataType;
  unit: string | null;
  comparison_order: number;
  is_key_specification: number;
};
export type SpecDefinitionWithCategory = DbSpecDefinition & {category_name: string};

export const listSpecDefinitions = (categoryId?: string): SpecDefinitionWithCategory[] =>
  categoryId
    ? (db()
        .prepare(`SELECT sd.*, c.name AS category_name FROM specification_definitions sd JOIN categories c ON c.id=sd.category_id WHERE sd.category_id=? ORDER BY sd.comparison_order,sd.label`)
        .all(categoryId) as SpecDefinitionWithCategory[])
    : (db()
        .prepare(`SELECT sd.*, c.name AS category_name FROM specification_definitions sd JOIN categories c ON c.id=sd.category_id ORDER BY c.name,sd.comparison_order,sd.label`)
        .all() as SpecDefinitionWithCategory[]);

export const specDefinitionById = (id: string) => db().prepare("SELECT * FROM specification_definitions WHERE id=?").get(id) as DbSpecDefinition | undefined;

export function createSpecDefinition(data: {categoryId: string; key: string; label: string; dataType: SpecDataType; unit: string | null; comparisonOrder: number; isKeySpecification: boolean}) {
  const record = {
    id: crypto.randomUUID(),
    category_id: data.categoryId,
    key: data.key,
    label: data.label,
    data_type: data.dataType,
    unit: data.unit,
    comparison_order: data.comparisonOrder,
    is_key_specification: data.isKeySpecification ? 1 : 0,
  };
  db()
    .prepare("INSERT INTO specification_definitions (id,category_id,key,label,data_type,unit,comparison_order,is_key_specification) VALUES (@id,@category_id,@key,@label,@data_type,@unit,@comparison_order,@is_key_specification)")
    .run(record);
  return record;
}

export function updateSpecDefinition(id: string, data: {label: string; dataType: SpecDataType; unit: string | null; comparisonOrder: number; isKeySpecification: boolean}) {
  db()
    .prepare("UPDATE specification_definitions SET label=?,data_type=?,unit=?,comparison_order=?,is_key_specification=? WHERE id=?")
    .run(data.label, data.dataType, data.unit, data.comparisonOrder, data.isKeySpecification ? 1 : 0, id);
  return specDefinitionById(id);
}

// Definitions are metadata that other rows (product_specifications) point to —
// deleting one out from under existing values would silently orphan/blank
// them, so this only succeeds when nothing references it yet.
export function deleteUnusedSpecDefinition(id: string): {ok: true} | {ok: false; error: string} {
  const used = (db().prepare("SELECT count(*) n FROM product_specifications WHERE specification_definition_id=?").get(id) as {n: number}).n;
  if (used > 0) return {ok: false, error: `Esta especificação está em uso por ${used} produto(s) e não pode ser excluída.`};
  db().prepare("DELETE FROM specification_definitions WHERE id=?").run(id);
  return {ok: true};
}

export type DbProductSpecification = {
  id: string;
  product_id: string;
  specification_definition_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: number | null;
  source_id: string | null;
  verified_at: string | null;
};
export type ProductSpecificationWithDefinition = DbProductSpecification & {key: string; label: string; data_type: SpecDataType; unit: string | null; comparison_order: number; is_key_specification: number};

export const specificationsForProduct = (productId: string): ProductSpecificationWithDefinition[] =>
  db()
    .prepare(
      `SELECT ps.*, sd.key,sd.label,sd.data_type,sd.unit,sd.comparison_order,sd.is_key_specification
       FROM product_specifications ps JOIN specification_definitions sd ON sd.id=ps.specification_definition_id
       WHERE ps.product_id=? ORDER BY sd.comparison_order,sd.label`
    )
    .all(productId) as ProductSpecificationWithDefinition[];

// Full replace is simpler and safe here: values are admin-entered (not yet
// tied to an approved manufacturer source in this phase), so there is no
// provenance to preserve across a save — see Fase C1 report for the
// source-linking limitation.
export function replaceProductSpecifications(productId: string, values: {specificationDefinitionId: string; valueText: string | null; valueNumber: number | null; valueBoolean: boolean | null}[]) {
  const insert = db().prepare("INSERT INTO product_specifications (id,product_id,specification_definition_id,value_text,value_number,value_boolean) VALUES (?,?,?,?,?,?)");
  db().transaction(() => {
    db().prepare("DELETE FROM product_specifications WHERE product_id=?").run(productId);
    for (const v of values) {
      if (v.valueText == null && v.valueNumber == null && v.valueBoolean == null) continue;
      insert.run(crypto.randomUUID(), productId, v.specificationDefinitionId, v.valueText, v.valueNumber, v.valueBoolean == null ? null : v.valueBoolean ? 1 : 0);
    }
  })();
}
