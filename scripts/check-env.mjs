import dotenv from "dotenv";

dotenv.config();

const requiredKeys = ["DATABASE_URL", "ZOTERO_KEY", "ZOTERO_ID"];
const missing = requiredKeys.filter((key) => {
  const value = process.env[key];
  return value === undefined || value.trim() === "";
});

if (missing.length > 0) {
  console.error("[env] Missing required environment variables:");
  for (const key of missing) {
    console.error(`- ${key}`);
  }
  console.error("Create a .env file from .env.example and fill required values.");
  process.exit(1);
}

console.log("[env] Required environment variables are present.");
