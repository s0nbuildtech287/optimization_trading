const { getAppPool } = require('../config/db');

const pool = getAppPool();

/**
 * Khởi tạo các bảng phục vụ Paper Trading trong PostgreSQL
 */
async function initPaperTradeTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS paper_accounts (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        account_type VARCHAR(20) NOT NULL DEFAULT 'FUTURES',
        initial_balance NUMERIC(15, 2) NOT NULL DEFAULT 100.00,
        balance NUMERIC(15, 2) NOT NULL DEFAULT 100.00,
        equity NUMERIC(15, 2) NOT NULL DEFAULT 100.00,
        realized_pnl NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        unrealized_pnl NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
        total_trades INTEGER NOT NULL DEFAULT 0,
        winning_trades INTEGER NOT NULL DEFAULT 0,
        losing_trades INTEGER NOT NULL DEFAULT 0,
        max_drawdown_pct NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
        peak_equity NUMERIC(15, 2) NOT NULL DEFAULT 100.00,
        is_bot_active BOOLEAN NOT NULL DEFAULT TRUE,
        risk_per_trade NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
        leverage INTEGER NOT NULL DEFAULT 3,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS paper_positions (
        id BIGSERIAL PRIMARY KEY,
        account_id VARCHAR(50) NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
        symbol VARCHAR(30) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price NUMERIC(18, 4) NOT NULL,
        current_price NUMERIC(18, 4) NOT NULL,
        quantity NUMERIC(18, 6) NOT NULL,
        leverage INTEGER NOT NULL DEFAULT 3,
        margin NUMERIC(15, 4) NOT NULL,
        stop_loss NUMERIC(18, 4) NOT NULL,
        take_profit NUMERIC(18, 4) NOT NULL,
        unrealized_pnl NUMERIC(15, 4) NOT NULL DEFAULT 0,
        unrealized_pnl_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
        liquidation_price NUMERIC(18, 4),
        is_breakeven_triggered BOOLEAN NOT NULL DEFAULT FALSE,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS paper_orders (
        id BIGSERIAL PRIMARY KEY,
        account_id VARCHAR(50) NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
        symbol VARCHAR(30) NOT NULL,
        side VARCHAR(10) NOT NULL,
        entry_price NUMERIC(18, 4) NOT NULL,
        exit_price NUMERIC(18, 4) NOT NULL,
        quantity NUMERIC(18, 6) NOT NULL,
        leverage INTEGER NOT NULL DEFAULT 3,
        margin NUMERIC(15, 4) NOT NULL,
        realized_pnl NUMERIC(15, 4) NOT NULL,
        realized_pnl_pct NUMERIC(8, 2) NOT NULL,
        fee NUMERIC(15, 4) NOT NULL DEFAULT 0,
        exit_reason VARCHAR(40) NOT NULL,
        opened_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS paper_equity_snapshots (
        id BIGSERIAL PRIMARY KEY,
        account_id VARCHAR(50) NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
        balance NUMERIC(15, 2) NOT NULL,
        equity NUMERIC(15, 2) NOT NULL,
        drawdown_pct NUMERIC(8, 2) NOT NULL DEFAULT 0,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS paper_bot_logs (
        id BIGSERIAL PRIMARY KEY,
        account_id VARCHAR(50) NOT NULL,
        symbol VARCHAR(30),
        level VARCHAR(10) NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS paper_spot_holdings (
        id BIGSERIAL PRIMARY KEY,
        account_id VARCHAR(50) NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
        symbol VARCHAR(30) NOT NULL,
        coin VARCHAR(10) NOT NULL,
        quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,
        avg_buy_price NUMERIC(18, 4) NOT NULL DEFAULT 0,
        total_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_paper_spot_holding UNIQUE (account_id, symbol)
      );

      CREATE INDEX IF NOT EXISTS idx_paper_positions_acc ON paper_positions(account_id);
      CREATE INDEX IF NOT EXISTS idx_paper_orders_acc ON paper_orders(account_id, closed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_paper_snapshots_acc ON paper_equity_snapshots(account_id, timestamp ASC);
      CREATE INDEX IF NOT EXISTS idx_paper_logs_acc ON paper_bot_logs(account_id, created_at DESC);
    `);

    // Seed tài khoản mặc định $100 nếu chưa có
    await client.query(`
      INSERT INTO paper_accounts (id, name, account_type, initial_balance, balance, equity, peak_equity, risk_per_trade, leverage)
      VALUES 
        ('acc_binance_futures', 'Binance Futures Virtual Account', 'FUTURES', 100.00, 100.00, 100.00, 100.00, 2.00, 3),
        ('acc_binance_spot', 'Binance Spot Virtual Account', 'SPOT', 100.00, 100.00, 100.00, 100.00, 25.00, 1)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log('[DB] Paper Trading schema and default accounts initialized.');
  } catch (err) {
    console.error('[DB] Failed to init Paper Trading schema:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function getAccount(accountId = 'acc_binance_futures') {
  const res = await pool.query('SELECT * FROM paper_accounts WHERE id = $1', [accountId]);
  return res.rows[0] || null;
}

async function updateAccount(accountId, updates = {}) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return null;
  
  const setClauses = keys.map((key, idx) => `"${key}" = $${idx + 2}`);
  setClauses.push('updated_at = NOW()');

  const query = `
    UPDATE paper_accounts
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;
  const values = [accountId, ...Object.values(updates)];
  const res = await pool.query(query, values);
  return res.rows[0];
}

async function resetAccount(accountId = 'acc_binance_futures', initialBalance = 100.00, riskPerTrade = null, leverage = null) {
  const client = await pool.connect();
  try {
    const validBalance = parseFloat(initialBalance) || 100.00;
    const validRisk = parseFloat(riskPerTrade) || Math.max(1.0, Number((validBalance * 0.02).toFixed(2)));
    const validLev = parseInt(leverage, 10) || 3;

    await client.query('BEGIN');
    await client.query('DELETE FROM paper_positions WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM paper_spot_holdings WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM paper_orders WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM paper_equity_snapshots WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM paper_bot_logs WHERE account_id = $1', [accountId]);

    const res = await client.query(`
      UPDATE paper_accounts
      SET 
        initial_balance = $2,
        balance = $2,
        equity = $2,
        peak_equity = $2,
        risk_per_trade = $3,
        leverage = $4,
        realized_pnl = 0.00,
        unrealized_pnl = 0.00,
        total_trades = 0,
        winning_trades = 0,
        losing_trades = 0,
        max_drawdown_pct = 0.00,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `, [accountId, validBalance, validRisk, validLev]);

    // Tạo snapshot đầu tiên sau reset
    await client.query(`
      INSERT INTO paper_equity_snapshots (account_id, balance, equity, drawdown_pct)
      VALUES ($1, $2, $2, 0.00);
    `, [accountId, validBalance]);

    await client.query('COMMIT');
    return res.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getOpenPositions(accountId = 'acc_binance_futures') {
  const res = await pool.query(
    'SELECT * FROM paper_positions WHERE account_id = $1 ORDER BY opened_at DESC',
    [accountId]
  );
  return res.rows;
}

async function createPosition(pos) {
  const query = `
    INSERT INTO paper_positions (
      account_id, symbol, side, entry_price, current_price, quantity, leverage,
      margin, stop_loss, take_profit, unrealized_pnl, unrealized_pnl_pct, liquidation_price
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *;
  `;
  const values = [
    pos.accountId, pos.symbol, pos.side, pos.entryPrice, pos.currentPrice, pos.quantity, pos.leverage,
    pos.margin, pos.stopLoss, pos.takeProfit, pos.unrealizedPnl || 0, pos.unrealizedPnlPct || 0, pos.liquidationPrice
  ];
  const res = await pool.query(query, values);
  return res.rows[0];
}

async function updatePosition(positionId, updates = {}) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return null;
  const setClauses = keys.map((key, idx) => `"${key}" = $${idx + 2}`);
  setClauses.push('updated_at = NOW()');

  const query = `
    UPDATE paper_positions
    SET ${setClauses.join(', ')}
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, [positionId, ...Object.values(updates)]);
  return res.rows[0];
}

async function deletePosition(positionId) {
  const res = await pool.query('DELETE FROM paper_positions WHERE id = $1 RETURNING *', [positionId]);
  return res.rows[0];
}

async function createOrder(order) {
  const query = `
    INSERT INTO paper_orders (
      account_id, symbol, side, entry_price, exit_price, quantity, leverage,
      margin, realized_pnl, realized_pnl_pct, fee, exit_reason, opened_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *;
  `;
  const values = [
    order.accountId, order.symbol, order.side, order.entryPrice, order.exitPrice, order.quantity,
    order.leverage, order.margin, order.realizedPnl, order.realizedPnlPct, order.fee, order.exitReason, order.openedAt
  ];
  const res = await pool.query(query, values);
  return res.rows[0];
}

async function getOrderHistory(accountId = 'acc_binance_futures', limit = 50) {
  const res = await pool.query(
    'SELECT * FROM paper_orders WHERE account_id = $1 ORDER BY closed_at DESC LIMIT $2',
    [accountId, limit]
  );
  return res.rows;
}

async function createEquitySnapshot(accountId, balance, equity, drawdownPct) {
  const res = await pool.query(
    `INSERT INTO paper_equity_snapshots (account_id, balance, equity, drawdown_pct)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [accountId, balance, equity, drawdownPct]
  );
  return res.rows[0];
}

async function getEquityHistory(accountId = 'acc_binance_futures', limit = 100) {
  const res = await pool.query(
    'SELECT * FROM paper_equity_snapshots WHERE account_id = $1 ORDER BY timestamp ASC LIMIT $2',
    [accountId, limit]
  );
  return res.rows;
}

async function createLog(accountId, symbol, level, message) {
  const res = await pool.query(
    'INSERT INTO paper_bot_logs (account_id, symbol, level, message) VALUES ($1, $2, $3, $4) RETURNING *',
    [accountId, symbol, level, message]
  );
  return res.rows[0];
}

async function getLogs(accountId = 'acc_binance_futures', limit = 50) {
  const res = await pool.query(
    'SELECT * FROM paper_bot_logs WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2',
    [accountId, limit]
  );
  return res.rows;
}

async function getSpotHoldings(accountId = 'acc_binance_spot') {
  const res = await pool.query(
    'SELECT * FROM paper_spot_holdings WHERE account_id = $1 AND quantity > 0 ORDER BY updated_at DESC',
    [accountId]
  );
  return res.rows;
}

async function upsertSpotHolding(accountId = 'acc_binance_spot', symbol, coin, quantity, avgBuyPrice, totalCost) {
  const query = `
    INSERT INTO paper_spot_holdings (account_id, symbol, coin, quantity, avg_buy_price, total_cost, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (account_id, symbol)
    DO UPDATE SET
      quantity = EXCLUDED.quantity,
      avg_buy_price = EXCLUDED.avg_buy_price,
      total_cost = EXCLUDED.total_cost,
      updated_at = NOW()
    RETURNING *;
  `;
  const res = await pool.query(query, [accountId, symbol, coin, quantity, avgBuyPrice, totalCost]);
  return res.rows[0];
}

async function deleteSpotHolding(accountId = 'acc_binance_spot', symbol) {
  const res = await pool.query(
    'DELETE FROM paper_spot_holdings WHERE account_id = $1 AND symbol = $2 RETURNING *',
    [accountId, symbol]
  );
  return res.rows[0];
}

async function addTrackedSymbol(accountId, symbol) {
  const sym = symbol.toUpperCase().trim();
  const query = `
    UPDATE paper_accounts
    SET tracked_symbols = array_append(
      ARRAY(SELECT DISTINCT UNNEST(tracked_symbols)),
      $2
    ),
    updated_at = NOW()
    WHERE id = $1 AND NOT ($2 = ANY(tracked_symbols))
    RETURNING *;
  `;
  const res = await pool.query(query, [accountId, sym]);
  return res.rows[0] || (await getAccount(accountId));
}

async function removeTrackedSymbol(accountId, symbol) {
  const sym = symbol.toUpperCase().trim();
  const query = `
    UPDATE paper_accounts
    SET tracked_symbols = array_remove(tracked_symbols, $2),
    updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const res = await pool.query(query, [accountId, sym]);
  return res.rows[0] || (await getAccount(accountId));
}

module.exports = {
  initPaperTradeTables,
  getAccount,
  updateAccount,
  resetAccount,
  getOpenPositions,
  createPosition,
  updatePosition,
  deletePosition,
  getSpotHoldings,
  upsertSpotHolding,
  deleteSpotHolding,
  addTrackedSymbol,
  removeTrackedSymbol,
  createOrder,
  getOrderHistory,
  createEquitySnapshot,
  getEquityHistory,
  createLog,
  getLogs
};

