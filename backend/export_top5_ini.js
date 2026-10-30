/**
 * export_top5_ini.js — Script Xuất Top 5 File INI Cho Tất Cả Strategy Đã Done
 * 
 * Cách dùng trên bất kỳ máy nào:
 *   node export_top5_ini.js
 * 
 * Script tự động đọc file .env, tìm thư mục uploads/mt5_artifacts và xuất thẳng
 * ra thư mục Downloads/iniNhuLe của user Windows hiện tại.
 */

require("dotenv").config();
const { pool } = require("./src/config/db");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Tự động nhận diện thư mục uploads và Downloads trên mọi máy
const BASE_DIR = __dirname;
const ARTIFACTS_ROOT = process.env.MT5_ARTIFACTS_ROOT
  ? path.resolve(process.env.MT5_ARTIFACTS_ROOT)
  : path.join(BASE_DIR, "uploads", "mt5_artifacts");

const OUTPUT_DIR = path.join(os.homedir(), "Downloads", "iniNhuLe");

function sanitizeName(str) {
  return String(str || "").replace(/[^a-zA-Z0-9_\-\.]/g, "_").trim();
}

function readTextFileFlexible(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString("utf16le", 2);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return buf.swap16().toString("utf16le", 2);
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString("utf8", 3);
  }
  const utf8Text = buf.toString("utf8");
  if (utf8Text.includes("\0")) {
    return buf.toString("utf16le");
  }
  return utf8Text;
}

function writeUtf16LeTextFile(filePath, text) {
  const content = text.endsWith("\n") ? text : `${text}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "\ufeff" + content, "utf16le");
}

function renderIniContent(templatePath, params = {}) {
  const sourceText = readTextFileFlexible(templatePath);
  const renderedLines = [];
  let inTesterInputs = false;

  for (const line of String(sourceText || "").split(/\r?\n/)) {
    if (line.startsWith("Optimization=")) {
      renderedLines.push("Optimization=0");
      continue;
    }
    if (line.startsWith("Model=")) {
      renderedLines.push("Model=0"); // Model 0 = Every Tick
      continue;
    }
    if (line.startsWith("ShutdownTerminal=")) {
      renderedLines.push("ShutdownTerminal=1");
      continue;
    }
    if (line.startsWith("Report=") || line.startsWith("ReplaceReport=")) {
      continue;
    }

    if (line.trim().toLowerCase() === "[testerinputs]") {
      inTesterInputs = true;
      renderedLines.push(line);
      continue;
    }

    if (inTesterInputs) {
      if (line.startsWith("[") && line.endsWith("]")) {
        inTesterInputs = false;
        renderedLines.push(line);
        continue;
      }

      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const paramName = line.slice(0, eqIdx).trim();
        const valueSeg = line.slice(eqIdx + 1).trim();

        if (Object.prototype.hasOwnProperty.call(params, paramName)) {
          const newValue = params[paramName];
          const parts = valueSeg.split("||").map((s) => s.trim());
          if (parts.length > 1) {
            parts[0] = String(newValue);
            renderedLines.push(`${paramName}=${parts.join("||")}`);
          } else {
            renderedLines.push(`${paramName}=${newValue}`);
          }
          continue;
        }
      }
    }

    renderedLines.push(line);
  }

  return renderedLines.join("\n");
}

function findFileRecursive(dir, targetName) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const found = findFileRecursive(fullPath, targetName);
      if (found) return found;
    } else if (file.name.toLowerCase() === targetName.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

async function exportTop5IniFiles() {
  console.log("====================================================================");
  console.log("EXPORTING TOP 5 INI FILES TO DOWNLOADS/iniNhuLe");
  console.log("====================================================================");
  console.log("Artifacts Root:", ARTIFACTS_ROOT);
  console.log("Target Output Directory:", OUTPUT_DIR);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  try {
    // 1. Query all done optimize_only jobs
    const jobsRes = await pool.query(`
      SELECT id, external_job_id, job_name, artifact_relpath, ini_folder, bot_name
      FROM mt5_job_queue
      WHERE mode = 'optimize_only' AND status = 'done'
      ORDER BY id ASC;
    `);

    const jobs = jobsRes.rows;
    console.log(`✓ Found ${jobs.length} done strategy optimization jobs.`);

    let totalExportedCount = 0;
    let totalStrategiesProcessed = 0;

    for (const job of jobs) {
      // Find top 5 results for this job
      const resultsRes = await pool.query(`
        SELECT id, external_job_id, pass_no, rank_no, selected, profit, total_trades, profit_factor, drawdown_pct, pd_ratio, params_json, template_ini_relpath, template_ini_name
        FROM mt5_optimize_results
        WHERE external_job_id = $1
        ORDER BY selected DESC, rank_no ASC NULLS LAST, profit DESC
        LIMIT 5;
      `, [job.external_job_id]);

      const top5Results = resultsRes.rows;
      if (!top5Results.length) {
        continue;
      }

      // Locate template INI file
      let templatePath = null;
      for (const resRow of top5Results) {
        const rel = resRow.template_ini_relpath || job.artifact_relpath;
        if (rel) {
          const testPath = path.normalize(path.join(ARTIFACTS_ROOT, rel));
          if (fs.existsSync(testPath)) {
            templatePath = testPath;
            break;
          }
        }
      }

      if (!templatePath && job.artifact_relpath) {
        const testPath = path.normalize(path.join(ARTIFACTS_ROOT, job.artifact_relpath));
        if (fs.existsSync(testPath)) {
          templatePath = testPath;
        }
      }

      if (!templatePath && job.job_name) {
        templatePath = findFileRecursive(ARTIFACTS_ROOT, `${job.job_name}.ini`);
      }

      if (!templatePath) {
        console.log(`❌ Could not locate template .ini file for job ${job.external_job_id} (${job.job_name})`);
        continue;
      }

      const strategyBaseName = sanitizeName(job.job_name || job.external_job_id);

      let exportedForThisJob = 0;
      for (let i = 0; i < top5Results.length; i++) {
        const resRow = top5Results[i];
        const rank = resRow.rank_no || (i + 1);
        const params = typeof resRow.params_json === "string" ? JSON.parse(resRow.params_json) : (resRow.params_json || {});

        const renderedContent = renderIniContent(templatePath, params);

        // Format tên ngắn gọn: <Tên_Chiến_Lược>_R<Rank>.ini
        const filename = `${strategyBaseName}_R${rank}.ini`;
        const outIniPath = path.join(OUTPUT_DIR, filename);

        writeUtf16LeTextFile(outIniPath, renderedContent);
        exportedForThisJob++;
        totalExportedCount++;
      }

      if (exportedForThisJob > 0) {
        totalStrategiesProcessed++;
        console.log(`✓ Exported Top ${exportedForThisJob} .ini files for [${strategyBaseName}]`);
      }
    }

    console.log("\n====================================================================");
    console.log("SUMMARY OF TOP 5 INI EXPORT:");
    console.log(`✓ Total Strategies Processed: ${totalStrategiesProcessed}`);
    console.log(`✓ Total .ini Files Exported: ${totalExportedCount}`);
    console.log(`✓ Saved directly to: ${OUTPUT_DIR}`);
    console.log("====================================================================");

  } catch (err) {
    console.error("❌ Error exporting top 5 INI files:", err.message);
  } finally {
    await pool.end();
  }
}

exportTop5IniFiles();
