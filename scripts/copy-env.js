const fs = require("fs");
const path = require("path");

const services = ["auth-gateway", "erp-service", "crm-service", "supply-chain-service"];
const root = path.resolve(__dirname, "..");

for (const svc of services) {
  const example = path.join(root, svc, ".env.example");
  const target = path.join(root, svc, ".env");

  if (fs.existsSync(example) && !fs.existsSync(target)) {
    fs.copyFileSync(example, target);
    console.log(`✓ ${svc}/.env créé depuis .env.example`);
  } else if (fs.existsSync(target)) {
    console.log(`• ${svc}/.env existe déjà, ignoré`);
  }
}
