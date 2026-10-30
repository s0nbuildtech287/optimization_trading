const { getAppPool } = require("../config/db");
const pool = getAppPool();

async function initAiAnalysisReportTable() {
  const tableQuery = `
    CREATE TABLE IF NOT EXISTS ai_analysis_reports (
      id SERIAL PRIMARY KEY,
      target_type VARCHAR(50) NOT NULL,
      target_id VARCHAR(100) NOT NULL,
      backtest_table VARCHAR(100) NOT NULL,
      start_date DATE,
      end_date DATE,
      analysis_content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const indexQuery = `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_reports_unique 
    ON ai_analysis_reports (
      target_type, 
      target_id, 
      backtest_table, 
      COALESCE(start_date, '1970-01-01'), 
      COALESCE(end_date, '9999-12-31')
    );
  `;

  try {
    await pool.query(tableQuery);
    await pool.query(indexQuery);
    console.log("[DB] ai_analysis_reports table and unique index initialized");
  } catch (err) {
    console.error("❌ Failed to initialize ai_analysis_reports table:", err.message);
    throw err;
  }
}

async function getAiReport({ targetType, targetId, backtestTable, startDate, endDate }) {
  const query = `
    SELECT * FROM ai_analysis_reports
    WHERE target_type = $1
      AND target_id = $2
      AND backtest_table = $3
      AND COALESCE(start_date, '1970-01-01') = COALESCE($4::DATE, '1970-01-01')
      AND COALESCE(end_date, '9999-12-31') = COALESCE($5::DATE, '9999-12-31')
    LIMIT 1;
  `;
  const values = [targetType, targetId, backtestTable, startDate || null, endDate || null];
  try {
    const { rows } = await pool.query(query, values);
    return rows[0] || null;
  } catch (err) {
    console.error("❌ Failed to get AI analysis report:", err.message);
    throw err;
  }
}

async function upsertAiReport({ targetType, targetId, backtestTable, startDate, endDate, content }) {
  const query = `
    INSERT INTO ai_analysis_reports (target_type, target_id, backtest_table, start_date, end_date, analysis_content)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (
      target_type, 
      target_id, 
      backtest_table, 
      COALESCE(start_date, '1970-01-01'), 
      COALESCE(end_date, '9999-12-31')
    )
    DO UPDATE SET 
      analysis_content = EXCLUDED.analysis_content,
      updated_at = NOW()
    RETURNING *;
  `;
  const values = [targetType, targetId, backtestTable, startDate || null, endDate || null, content];
  try {
    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (err) {
    console.error("❌ Failed to upsert AI analysis report:", err.message);
    throw err;
  }
}

async function deleteAiReportsByTable(backtestTable) {
  const query = `
    DELETE FROM ai_analysis_reports
    WHERE backtest_table = $1;
  `;
  try {
    const result = await pool.query(query, [backtestTable]);
    return { success: true, count: result.rowCount };
  } catch (err) {
    console.error(`❌ Failed to delete AI reports for ${backtestTable}:`, err.message);
    throw err;
  }
}

module.exports = {
  initAiAnalysisReportTable,
  getAiReport,
  upsertAiReport,
  deleteAiReportsByTable
};
