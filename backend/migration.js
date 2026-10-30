/**
 * Migration Script Execution
 * Thuc thi toan bo SQL trong migration.md trong mot lan chay.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { pool } = require("./src/config/db");

async function runMigration() {
  console.log("=== Bat dau thuc thi toan bo migration.md ===");
  const sqlPath = path.join(__dirname, "markdown", "migration.md");
  if (!fs.existsSync(sqlPath)) {
    throw new Error("Khong tim thay file migration.md");
  }

  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  if (!sqlContent.trim()) throw new Error("migration.md dang rong");

  const client = await pool.connect();
  try {
    console.log("Dang thuc thi toan bo SQL trong migration.md...");
    await client.query(sqlContent);
    console.log("Migration hoan tat thanh cong.");
  } catch (err) {
    console.error("Loi khi chay migration:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
