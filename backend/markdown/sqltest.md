<!-- Volume optimazation -->

Nếu không có mốc nào > 200 trades, hệ thống sẽ hạ xuống tìm mốc có P/D cao nhất nhưng bắt buộc phải có tối thiểu 5 hoặc 10 trades (thay vì lấy cả mốc 1-2 trades).

<!-- strategies, tối ưu query -->

Query 1: Full Period Filter with P/D >= 5 (Static JSONB results)
This query scans the strategy_metadata table directly and extracts the P/D value using regex parsing of the balanceDrawdownMaximal JSON field.

SELECT COUNT(\*) AS total_strategies
FROM strategy_metadata
WHERE (
(results->>'totalNetProfit')::numeric /
NULLIF(
regexp_replace(
split_part(results->>'balanceDrawdownMaximal', '(', 1),
'[^0-9\.]',
'',
'g'
)::numeric,
0
)
) >= 5.0;

Query 2: Dynamic Time Range Filter with P/D >= 5.0 (Calculating on the fly)
WITH raw*deals_filtered AS (
SELECT
b.strategy_id,
b.deal,
b.commission,
b.swap,
b.profit
FROM backtest_temp1 b
WHERE b.type <> 'balance'
AND b.time >= DATE '2024-06-30'
AND b.time < DATE '2025-06-30'
),
cumulative_profit AS (
SELECT
*,
SUM(profit + commission + swap) OVER (
PARTITION BY strategy*id
ORDER BY deal
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
) AS cumulative_profit
FROM raw_deals_filtered
),
drawdown_steps AS (
SELECT
*,
GREATEST(
MAX(cumulative*profit) OVER (
PARTITION BY strategy_id
ORDER BY deal
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
),
0
) - cumulative_profit AS drawdown
FROM cumulative_profit
),
computed_metrics AS (
SELECT
strategy_id,
FLOOR(COUNT(*) / 2.0) AS total*orders,
SUM(profit + commission + swap) AS total_profit,
MAX(drawdown) AS max_drawdown,
CASE
WHEN MAX(drawdown) > 0 THEN ROUND(
(SUM(profit + commission + swap) / MAX(drawdown))::numeric,
2
)
ELSE NULL
END AS pd_ratio
FROM drawdown_steps
GROUP BY strategy_id
)
SELECT
COUNT(*) AS total_strategies
FROM computed_metrics
WHERE pd_ratio >= 5.0;

<!-- sql xoá data module mt5 -->

BEGIN;

DO $$
DECLARE
tables*to_clean TEXT;
BEGIN
SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
INTO tables_to_clean
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'mt5*%';

    IF tables_to_clean IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE '
            || tables_to_clean
            || ' RESTART IDENTITY CASCADE';
    END IF;

END $$;

COMMIT;
