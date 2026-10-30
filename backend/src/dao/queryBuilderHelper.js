/**
 * src/dao/queryBuilderHelper.js
 * Helper để xây dựng từ vựng FROM clause cho UNION ALL các mảng nguồn dữ liệu (sourceNames).
 */

const { validateAndFilterSourceNames, getEnabledDataSources } = require("./dataSourceDao");
const { getRequestActor, getActorScopeKey } = require("../utils/requestContext");

/**
 * Phân giải tham số nguồn dữ liệu (chuỗi hoặc mảng) thành FROM Clause an toàn cho SQL.
 * @param {string|string[]} sourceInput - Tên bảng hoặc mảng danh sách tên bảng được chọn
 * @returns {Promise<{fromClause: string, validTables: string[], isAllBacktest: boolean, strategyWhere: string, strategyParams: string[]}>}
 */
async function resolveTableSubquery(sourceInput, actor = getRequestActor()) {
  let isAllExplicit = false;
  const inputStr = typeof sourceInput === 'string' ? sourceInput.trim().toLowerCase() : '';
  if (!sourceInput || inputStr === 'all_backtests') {
    isAllExplicit = true;
  } else if (Array.isArray(sourceInput)) {
    if (sourceInput.length === 0) {
      throw new Error("No data sources selected");
    }
    if (sourceInput.some((s) => String(s).trim().toLowerCase() === 'all_backtests')) {
      isAllExplicit = true;
    }
  }

  let validTables = [];
  if (isAllExplicit) {
    const allSources = await getEnabledDataSources(actor);
    validTables = allSources.map((s) => s.source_name);
  } else {
    validTables = await validateAndFilterSourceNames(sourceInput, actor);
    if (!validTables || validTables.length === 0) {
      throw new Error("No valid data sources selected");
    }
  }

  if (!validTables || validTables.length === 0) {
    throw new Error("No backtest data sources available in database");
  }

  // Chọn 1 bảng đơn lẻ — wrap vào subquery để có cột source_table nhất quán với multi-table
  if (validTables.length === 1) {
    const singleTable = validTables[0];
    const allowedCols = [
      "time", "deal", "symbol", "type", "direction", "volume",
      "price", "order", "commission", "swap", "profit", "comment", "strategy_id"
    ];
    const colList = allowedCols.map((c) => `"${c}"`).join(", ");
    const singleSubquery = `(SELECT ${colList}, '${singleTable}' AS source_table FROM "${singleTable}")`;
    return {
      fromClause: singleSubquery,
      validTables,
      isAllBacktest: false,
      strategyWhere: `WHERE backtest_table = $1`,
      strategyParams: [singleTable]
    };
  }

  // Chọn nhiều bảng: Xây dựng UNION ALL
  const allowedCols = [
    "time", "deal", "symbol", "type", "direction", "volume",
    "price", "order", "commission", "swap", "profit", "comment", "strategy_id"
  ];
  const colList = allowedCols.map((c) => `"${c}"`).join(", ");
  const subqueries = validTables.map(
    (t) => `SELECT ${colList}, '${t}' AS source_table FROM "${t}"`
  );
  const unionSql = `(${subqueries.join("\n UNION ALL \n")})`;
  const inPlaceholders = validTables.map((_, i) => `$${i + 1}`).join(", ");

  return {
    fromClause: unionSql,
    validTables,
    isAllBacktest: true,
    strategyWhere: `WHERE backtest_table IN (${inPlaceholders})`,
    strategyParams: validTables
  };
}

/**
 * Xây dựng Cache Key chuẩn hóa cho danh sách các nguồn dữ liệu được chọn
 * @param {string|string[]} sourceInput 
 * @returns {string} E.g., "src_backtest_temp1_backtest_temp2"
 */
function buildSourceCacheKey(sourceInput, actor = getRequestActor()) {
  const scope = getActorScopeKey(actor);
  if (!sourceInput) return `${scope}:src_all`;
  if (sourceInput === 'all_backtests') {
    return `${scope}:src_all`;
  }
  let arr = [];
  if (Array.isArray(sourceInput)) {
    arr = sourceInput;
  } else if (typeof sourceInput === "string") {
    arr = sourceInput.split(",").map((s) => s.trim());
  }
  if (arr.length === 0 || arr.some((s) => String(s).toLowerCase() === 'all_backtests')) {
    return `${scope}:src_all`;
  }
  const sorted = arr.map((s) => String(s).trim().toLowerCase()).sort();
  return sorted.length > 0 ? `${scope}:src_${sorted.join("_")}` : `${scope}:src_all`;
}

module.exports = {
  resolveTableSubquery,
  buildSourceCacheKey
};
