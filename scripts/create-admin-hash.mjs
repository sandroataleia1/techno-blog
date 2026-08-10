import {scryptSync, randomBytes} from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Use: node scripts/create-admin-hash.mjs <senha-com-ao-menos-12-caracteres>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
const hashBase64 = Buffer.from(hash, "utf8").toString("base64");

// Never echo the password itself — only the derived hash, which is what the
// app actually stores/compares against.
console.log("Hash gerado. Escolha a forma certa para onde a variável vai:");
console.log("");
console.log("1) Variável de ambiente de processo real (recomendado) — shell export,");
console.log("   `environment:` do Docker Compose, systemd, secret manager, etc:");
console.log("");
console.log(`   ADMIN_PASSWORD_HASH=${hash}`);
console.log("");
console.log("2) Arquivo .env/.env.local — o carregador de env do Next.js expande");
console.log("   sequências \"$...\" nesses arquivos e corromperia o hash acima.");
console.log("   Use a variante em base64 em vez disso:");
console.log("");
console.log(`   ADMIN_PASSWORD_HASH_BASE64=${hashBase64}`);
console.log("");
console.log("Nunca use as duas para credenciais diferentes ao mesmo tempo — se ambas");
console.log("estiverem definidas, ADMIN_PASSWORD_HASH (a direta) tem prioridade.");
