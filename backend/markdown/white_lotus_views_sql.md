# SQL View Definitions - White Lotus Portfolio

Tài liệu này chứa định nghĩa SQL chính xác của các Materialized View được sếp sử dụng để chuẩn hóa vốn và phân tích quỹ White Lotus.

## mv_all_backtest

```sql
SELECT backtest1."time",
    backtest1.deal,
    backtest1.symbol,
    backtest1.type,
    backtest1.direction,
    backtest1.volume,
    backtest1.price,
    backtest1."order",
    backtest1.commission,
    backtest1.swap,
    backtest1.profit,
    backtest1.comment,
    backtest1.strategy_id,
    'backtest1'::text AS source_table
   FROM backtest1
UNION ALL
 SELECT backtest2."time",
    backtest2.deal,
    backtest2.symbol,
    backtest2.type,
    backtest2.direction,
    backtest2.volume,
    backtest2.price,
    backtest2."order",
    backtest2.commission,
    backtest2.swap,
    backtest2.profit,
    backtest2.comment,
    backtest2.strategy_id,
    'backtest2'::text AS source_table
   FROM backtest2;
```

## backtest1_upscale_by_st_tunning_rate

```sql
WITH min_max_time_symbol_backtest_name AS (
         SELECT mv_all_backtest.source_table,
            mv_all_backtest.symbol,
            min(mv_all_backtest."time") AS min_time,
            max(mv_all_backtest."time") AS max_time
           FROM mv_all_backtest
          GROUP BY mv_all_backtest.source_table, mv_all_backtest.symbol
        ), backtest_filtered_by_time AS (
         SELECT a_1."time",
            a_1.deal,
            a_1.symbol,
            a_1.type,
            a_1.direction,
            a_1.volume,
            a_1.price,
            a_1."order",
            a_1.commission,
            a_1.swap,
            a_1.profit,
            a_1.comment,
            a_1.strategy_id,
            b_1.lot_threshold
           FROM (backtest1 a_1
             JOIN lot_threshold_final b_1 ON (((a_1.strategy_id = (b_1.strategy_id)::text) AND ((b_1.source_table)::text = ( SELECT pg_class.relname
                   FROM pg_class
                  WHERE (pg_class.oid = a_1.tableoid))))))
          WHERE ((a_1."time" >= ( SELECT max(min_max_time_symbol_backtest_name.min_time) AS max
                   FROM min_max_time_symbol_backtest_name
                 LIMIT 1)) AND (a_1."time" <= ( SELECT min(min_max_time_symbol_backtest_name.max_time) AS min
                   FROM min_max_time_symbol_backtest_name
                 LIMIT 1)) AND (b_1.best_pd >= (2)::numeric) AND (b_1.total_trades >= 100) AND (b_1.max_drawdown >= (60000)::numeric))
        ), backtest_cumulative_profit_partial_by_strategy AS (
         SELECT backtest_filtered_by_time."time",
            backtest_filtered_by_time.deal,
            backtest_filtered_by_time.symbol,
            backtest_filtered_by_time.type,
            backtest_filtered_by_time.direction,
            backtest_filtered_by_time.volume,
            backtest_filtered_by_time.price,
            backtest_filtered_by_time."order",
            backtest_filtered_by_time.commission,
            backtest_filtered_by_time.swap,
            backtest_filtered_by_time.profit,
            backtest_filtered_by_time.comment,
            backtest_filtered_by_time.strategy_id,
            backtest_filtered_by_time.lot_threshold,
            sum(((backtest_filtered_by_time.profit + backtest_filtered_by_time.commission) + backtest_filtered_by_time.swap)) OVER (PARTITION BY backtest_filtered_by_time.strategy_id ORDER BY backtest_filtered_by_time.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit
           FROM backtest_filtered_by_time
        ), backtest_drawdown_partial_by_strategy AS (
         SELECT backtest_cumulative_profit_partial_by_strategy."time",
            backtest_cumulative_profit_partial_by_strategy.deal,
            backtest_cumulative_profit_partial_by_strategy.symbol,
            backtest_cumulative_profit_partial_by_strategy.type,
            backtest_cumulative_profit_partial_by_strategy.direction,
            backtest_cumulative_profit_partial_by_strategy.volume,
            backtest_cumulative_profit_partial_by_strategy.price,
            backtest_cumulative_profit_partial_by_strategy."order",
            backtest_cumulative_profit_partial_by_strategy.commission,
            backtest_cumulative_profit_partial_by_strategy.swap,
            backtest_cumulative_profit_partial_by_strategy.profit,
            backtest_cumulative_profit_partial_by_strategy.comment,
            backtest_cumulative_profit_partial_by_strategy.strategy_id,
            backtest_cumulative_profit_partial_by_strategy.lot_threshold,
            backtest_cumulative_profit_partial_by_strategy.cumulative_profit,
            (GREATEST(max(backtest_cumulative_profit_partial_by_strategy.cumulative_profit) OVER (PARTITION BY backtest_cumulative_profit_partial_by_strategy.strategy_id ORDER BY backtest_cumulative_profit_partial_by_strategy.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_partial_by_strategy.cumulative_profit) AS drawdown
           FROM backtest_cumulative_profit_partial_by_strategy
        ), strategies_add_tp_mdd AS (
         SELECT backtest_drawdown_partial_by_strategy.strategy_id,
            "right"(backtest_drawdown_partial_by_strategy.strategy_id, 1) AS strategy_type,
            sum(((backtest_drawdown_partial_by_strategy.profit + backtest_drawdown_partial_by_strategy.commission) + backtest_drawdown_partial_by_strategy.swap)) AS total_profit,
            count(1) AS total_orders,
            max(backtest_drawdown_partial_by_strategy.drawdown) AS mdd
           FROM backtest_drawdown_partial_by_strategy
          GROUP BY backtest_drawdown_partial_by_strategy.strategy_id
        ), strategies_add_tunning_rate AS (
         SELECT strategies_add_tp_mdd.strategy_id,
            strategies_add_tp_mdd.strategy_type,
            strategies_add_tp_mdd.total_profit,
            strategies_add_tp_mdd.total_orders,
            strategies_add_tp_mdd.mdd,
            (strategies_add_tp_mdd.total_profit / NULLIF(strategies_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(strategies_add_tp_mdd.mdd, (0)::numeric)) AS strategy_tunning_rate
           FROM strategies_add_tp_mdd
        )
 SELECT b."time",
    b.deal,
    b.symbol,
    b.type,
    b.direction,
    b.volume,
    b.price,
    b."order",
    b.commission,
    b.swap,
    b.profit,
    b.comment,
    b.strategy_id,
    b.lot_threshold,
    b.cumulative_profit,
    b.drawdown,
    a.pd,
    a.total_orders,
    a.strategy_type,
    a.strategy_tunning_rate,
    (b.commission * a.strategy_tunning_rate) AS commission_x_tr,
    (b.profit * a.strategy_tunning_rate) AS profit_x_tr,
    (b.swap * a.strategy_tunning_rate) AS swap_x_tr
   FROM (strategies_add_tunning_rate a
     JOIN backtest_drawdown_partial_by_strategy b ON ((a.strategy_id = b.strategy_id)))
  ORDER BY b."time";
```

## backtest1_upscale_by_tr_str_sytr

```sql
WITH backtest_cumulative_profit_x_tr_partial_by_symbol AS (
         SELECT backtest1_upscale_by_st_tunning_rate."time",
            backtest1_upscale_by_st_tunning_rate.deal,
            backtest1_upscale_by_st_tunning_rate.symbol,
            backtest1_upscale_by_st_tunning_rate.type,
            backtest1_upscale_by_st_tunning_rate.direction,
            backtest1_upscale_by_st_tunning_rate.volume,
            backtest1_upscale_by_st_tunning_rate.price,
            backtest1_upscale_by_st_tunning_rate."order",
            backtest1_upscale_by_st_tunning_rate.commission,
            backtest1_upscale_by_st_tunning_rate.swap,
            backtest1_upscale_by_st_tunning_rate.profit,
            backtest1_upscale_by_st_tunning_rate.comment,
            backtest1_upscale_by_st_tunning_rate.strategy_id,
            backtest1_upscale_by_st_tunning_rate.lot_threshold,
            backtest1_upscale_by_st_tunning_rate.cumulative_profit,
            backtest1_upscale_by_st_tunning_rate.drawdown,
            backtest1_upscale_by_st_tunning_rate.pd,
            backtest1_upscale_by_st_tunning_rate.total_orders,
            backtest1_upscale_by_st_tunning_rate.strategy_type,
            backtest1_upscale_by_st_tunning_rate.strategy_tunning_rate,
            backtest1_upscale_by_st_tunning_rate.commission_x_tr,
            backtest1_upscale_by_st_tunning_rate.profit_x_tr,
            backtest1_upscale_by_st_tunning_rate.swap_x_tr,
            sum(((backtest1_upscale_by_st_tunning_rate.profit_x_tr + backtest1_upscale_by_st_tunning_rate.commission_x_tr) + backtest1_upscale_by_st_tunning_rate.swap_x_tr)) OVER (PARTITION BY backtest1_upscale_by_st_tunning_rate.symbol ORDER BY backtest1_upscale_by_st_tunning_rate."time", backtest1_upscale_by_st_tunning_rate.strategy_id, backtest1_upscale_by_st_tunning_rate.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit_x_tr
           FROM backtest1_upscale_by_st_tunning_rate
        ), backtest_drawdown_partial_by_symbol AS (
         SELECT backtest_cumulative_profit_x_tr_partial_by_symbol."time",
            backtest_cumulative_profit_x_tr_partial_by_symbol.deal,
            backtest_cumulative_profit_x_tr_partial_by_symbol.symbol,
            backtest_cumulative_profit_x_tr_partial_by_symbol.type,
            backtest_cumulative_profit_x_tr_partial_by_symbol.direction,
            backtest_cumulative_profit_x_tr_partial_by_symbol.volume,
            backtest_cumulative_profit_x_tr_partial_by_symbol.price,
            backtest_cumulative_profit_x_tr_partial_by_symbol."order",
            backtest_cumulative_profit_x_tr_partial_by_symbol.commission,
            backtest_cumulative_profit_x_tr_partial_by_symbol.swap,
            backtest_cumulative_profit_x_tr_partial_by_symbol.profit,
            backtest_cumulative_profit_x_tr_partial_by_symbol.comment,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_id,
            backtest_cumulative_profit_x_tr_partial_by_symbol.lot_threshold,
            backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit,
            backtest_cumulative_profit_x_tr_partial_by_symbol.drawdown,
            backtest_cumulative_profit_x_tr_partial_by_symbol.pd,
            backtest_cumulative_profit_x_tr_partial_by_symbol.total_orders,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_type,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_tunning_rate,
            backtest_cumulative_profit_x_tr_partial_by_symbol.commission_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.profit_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.swap_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr,
            (GREATEST(max(backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr) OVER (PARTITION BY backtest_cumulative_profit_x_tr_partial_by_symbol.symbol ORDER BY backtest_cumulative_profit_x_tr_partial_by_symbol."time", backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_id, backtest_cumulative_profit_x_tr_partial_by_symbol.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr) AS drawdown_partial_by_symbol
           FROM backtest_cumulative_profit_x_tr_partial_by_symbol
        ), symbols_add_tp_mdd AS (
         SELECT backtest_drawdown_partial_by_symbol.symbol,
            sum(((backtest_drawdown_partial_by_symbol.profit_x_tr + backtest_drawdown_partial_by_symbol.commission_x_tr) + backtest_drawdown_partial_by_symbol.swap_x_tr)) AS total_profit_symbol,
            max(backtest_drawdown_partial_by_symbol.drawdown_partial_by_symbol) AS mdd
           FROM backtest_drawdown_partial_by_symbol
          GROUP BY backtest_drawdown_partial_by_symbol.symbol
        ), symbols_add_tunning_rate AS (
         SELECT symbols_add_tp_mdd.symbol,
            symbols_add_tp_mdd.total_profit_symbol,
            symbols_add_tp_mdd.mdd,
            (symbols_add_tp_mdd.total_profit_symbol / NULLIF(symbols_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(symbols_add_tp_mdd.mdd, (0)::numeric)) AS symbol_tunning_rate
           FROM symbols_add_tp_mdd
          ORDER BY symbols_add_tp_mdd.symbol
        ), backtest_upscale_by_tr_str AS (
         SELECT b_1."time",
            b_1.deal,
            b_1.symbol,
            b_1.type,
            b_1.direction,
            b_1.volume,
            b_1.price,
            b_1."order",
            b_1.commission,
            b_1.swap,
            b_1.profit,
            b_1.comment,
            b_1.strategy_id,
            b_1.lot_threshold,
            b_1.cumulative_profit,
            b_1.drawdown,
            b_1.pd,
            b_1.total_orders,
            b_1.strategy_type,
            b_1.strategy_tunning_rate,
            b_1.commission_x_tr,
            b_1.profit_x_tr,
            b_1.swap_x_tr,
            a_1.symbol_tunning_rate,
            (b_1.commission_x_tr * a_1.symbol_tunning_rate) AS commission_x_tr_str,
            (b_1.profit_x_tr * a_1.symbol_tunning_rate) AS profit_x_tr_str,
            (b_1.swap_x_tr * a_1.symbol_tunning_rate) AS swap_x_tr_str
           FROM (symbols_add_tunning_rate a_1
             JOIN backtest1_upscale_by_st_tunning_rate b_1 ON ((a_1.symbol = b_1.symbol)))
        ), backtest_cumulative_profit_x_tr_str AS (
         SELECT backtest_upscale_by_tr_str."time",
            backtest_upscale_by_tr_str.deal,
            backtest_upscale_by_tr_str.symbol,
            backtest_upscale_by_tr_str.type,
            backtest_upscale_by_tr_str.direction,
            backtest_upscale_by_tr_str.volume,
            backtest_upscale_by_tr_str.price,
            backtest_upscale_by_tr_str."order",
            backtest_upscale_by_tr_str.commission,
            backtest_upscale_by_tr_str.swap,
            backtest_upscale_by_tr_str.profit,
            backtest_upscale_by_tr_str.comment,
            backtest_upscale_by_tr_str.strategy_id,
            backtest_upscale_by_tr_str.lot_threshold,
            backtest_upscale_by_tr_str.cumulative_profit,
            backtest_upscale_by_tr_str.drawdown,
            backtest_upscale_by_tr_str.pd,
            backtest_upscale_by_tr_str.total_orders,
            backtest_upscale_by_tr_str.strategy_type,
            backtest_upscale_by_tr_str.strategy_tunning_rate,
            backtest_upscale_by_tr_str.commission_x_tr,
            backtest_upscale_by_tr_str.profit_x_tr,
            backtest_upscale_by_tr_str.swap_x_tr,
            backtest_upscale_by_tr_str.symbol_tunning_rate,
            backtest_upscale_by_tr_str.commission_x_tr_str,
            backtest_upscale_by_tr_str.profit_x_tr_str,
            backtest_upscale_by_tr_str.swap_x_tr_str,
            sum(((backtest_upscale_by_tr_str.profit_x_tr_str + backtest_upscale_by_tr_str.commission_x_tr_str) + backtest_upscale_by_tr_str.swap_x_tr_str)) OVER (ORDER BY backtest_upscale_by_tr_str."time", backtest_upscale_by_tr_str.strategy_id, backtest_upscale_by_tr_str.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit_x_tr_str
           FROM backtest_upscale_by_tr_str
        ), backtest_drawdown_system AS (
         SELECT backtest_cumulative_profit_x_tr_str."time",
            backtest_cumulative_profit_x_tr_str.deal,
            backtest_cumulative_profit_x_tr_str.symbol,
            backtest_cumulative_profit_x_tr_str.type,
            backtest_cumulative_profit_x_tr_str.direction,
            backtest_cumulative_profit_x_tr_str.volume,
            backtest_cumulative_profit_x_tr_str.price,
            backtest_cumulative_profit_x_tr_str."order",
            backtest_cumulative_profit_x_tr_str.commission,
            backtest_cumulative_profit_x_tr_str.swap,
            backtest_cumulative_profit_x_tr_str.profit,
            backtest_cumulative_profit_x_tr_str.comment,
            backtest_cumulative_profit_x_tr_str.strategy_id,
            backtest_cumulative_profit_x_tr_str.lot_threshold,
            backtest_cumulative_profit_x_tr_str.cumulative_profit,
            backtest_cumulative_profit_x_tr_str.drawdown,
            backtest_cumulative_profit_x_tr_str.pd,
            backtest_cumulative_profit_x_tr_str.total_orders,
            backtest_cumulative_profit_x_tr_str.strategy_type,
            backtest_cumulative_profit_x_tr_str.strategy_tunning_rate,
            backtest_cumulative_profit_x_tr_str.commission_x_tr,
            backtest_cumulative_profit_x_tr_str.profit_x_tr,
            backtest_cumulative_profit_x_tr_str.swap_x_tr,
            backtest_cumulative_profit_x_tr_str.symbol_tunning_rate,
            backtest_cumulative_profit_x_tr_str.commission_x_tr_str,
            backtest_cumulative_profit_x_tr_str.profit_x_tr_str,
            backtest_cumulative_profit_x_tr_str.swap_x_tr_str,
            backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str,
            (GREATEST(max(backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str) OVER (ORDER BY backtest_cumulative_profit_x_tr_str."time", backtest_cumulative_profit_x_tr_str.strategy_id, backtest_cumulative_profit_x_tr_str.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str) AS drawdown_system
           FROM backtest_cumulative_profit_x_tr_str
        ), system_add_tp_mdd AS (
         SELECT sum(((backtest_drawdown_system.profit_x_tr_str + backtest_drawdown_system.commission_x_tr_str) + backtest_drawdown_system.swap_x_tr_str)) AS total_profit_system,
            max(backtest_drawdown_system.drawdown_system) AS mdd,
            count(DISTINCT backtest_drawdown_system.strategy_id) AS no_strategies,
            (count(*) / 2) AS total_trades
           FROM backtest_drawdown_system
        ), system_add_tunning_rate AS (
         SELECT system_add_tp_mdd.total_profit_system,
            system_add_tp_mdd.mdd,
            system_add_tp_mdd.no_strategies,
            system_add_tp_mdd.total_trades,
            (system_add_tp_mdd.total_profit_system / NULLIF(system_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(system_add_tp_mdd.mdd, (0)::numeric)) AS system_tunning_rate
           FROM system_add_tp_mdd
        )
 SELECT b."time",
    b.deal,
    b.symbol,
    b.type,
    b.direction,
    b.volume,
    b.price,
    b."order",
    b.commission,
    b.swap,
    b.profit,
    b.comment,
    b.strategy_id,
    b.lot_threshold,
    b.cumulative_profit,
    b.drawdown,
    b.pd,
    b.total_orders,
    b.strategy_type,
    b.strategy_tunning_rate,
    b.commission_x_tr,
    b.profit_x_tr,
    b.swap_x_tr,
    b.symbol_tunning_rate,
    b.commission_x_tr_str,
    b.profit_x_tr_str,
    b.swap_x_tr_str,
    a.system_tunning_rate,
    (b.commission_x_tr_str * a.system_tunning_rate) AS commission_x_tr_str_sytr,
    (b.profit_x_tr_str * a.system_tunning_rate) AS profit_x_tr_str_sytr,
    (b.swap_x_tr_str * a.system_tunning_rate) AS swap_x_tr_str_sytr
   FROM system_add_tunning_rate a,
    backtest_upscale_by_tr_str b
  ORDER BY b."time";
```

## backtest2_upscale_by_st_tunning_rate

```sql
WITH min_max_time_symbol_backtest_name AS (
         SELECT mv_all_backtest.source_table,
            mv_all_backtest.symbol,
            min(mv_all_backtest."time") AS min_time,
            max(mv_all_backtest."time") AS max_time
           FROM mv_all_backtest
          GROUP BY mv_all_backtest.source_table, mv_all_backtest.symbol
        ), backtest_filtered_by_time AS (
         SELECT a_1."time",
            a_1.deal,
            a_1.symbol,
            a_1.type,
            a_1.direction,
            a_1.volume,
            a_1.price,
            a_1."order",
            a_1.commission,
            a_1.swap,
            a_1.profit,
            a_1.comment,
            a_1.strategy_id,
            b_1.lot_threshold
           FROM (backtest2 a_1
             JOIN lot_threshold_final b_1 ON (((a_1.strategy_id = (b_1.strategy_id)::text) AND ((b_1.source_table)::text = ( SELECT pg_class.relname
                   FROM pg_class
                  WHERE (pg_class.oid = a_1.tableoid))))))
          WHERE ((a_1."time" >= ( SELECT max(min_max_time_symbol_backtest_name.min_time) AS max
                   FROM min_max_time_symbol_backtest_name
                 LIMIT 1)) AND (a_1."time" <= ( SELECT min(min_max_time_symbol_backtest_name.max_time) AS min
                   FROM min_max_time_symbol_backtest_name
                 LIMIT 1)) AND (b_1.best_pd >= (2)::numeric) AND (b_1.total_trades >= 100) AND (b_1.max_drawdown >= (60000)::numeric))
        ), backtest_cumulative_profit_partial_by_strategy AS (
         SELECT backtest_filtered_by_time."time",
            backtest_filtered_by_time.deal,
            backtest_filtered_by_time.symbol,
            backtest_filtered_by_time.type,
            backtest_filtered_by_time.direction,
            backtest_filtered_by_time.volume,
            backtest_filtered_by_time.price,
            backtest_filtered_by_time."order",
            backtest_filtered_by_time.commission,
            backtest_filtered_by_time.swap,
            backtest_filtered_by_time.profit,
            backtest_filtered_by_time.comment,
            backtest_filtered_by_time.strategy_id,
            backtest_filtered_by_time.lot_threshold,
            sum(((backtest_filtered_by_time.profit + backtest_filtered_by_time.commission) + backtest_filtered_by_time.swap)) OVER (PARTITION BY backtest_filtered_by_time.strategy_id ORDER BY backtest_filtered_by_time.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit
           FROM backtest_filtered_by_time
        ), backtest_drawdown_partial_by_strategy AS (
         SELECT backtest_cumulative_profit_partial_by_strategy."time",
            backtest_cumulative_profit_partial_by_strategy.deal,
            backtest_cumulative_profit_partial_by_strategy.symbol,
            backtest_cumulative_profit_partial_by_strategy.type,
            backtest_cumulative_profit_partial_by_strategy.direction,
            backtest_cumulative_profit_partial_by_strategy.volume,
            backtest_cumulative_profit_partial_by_strategy.price,
            backtest_cumulative_profit_partial_by_strategy."order",
            backtest_cumulative_profit_partial_by_strategy.commission,
            backtest_cumulative_profit_partial_by_strategy.swap,
            backtest_cumulative_profit_partial_by_strategy.profit,
            backtest_cumulative_profit_partial_by_strategy.comment,
            backtest_cumulative_profit_partial_by_strategy.strategy_id,
            backtest_cumulative_profit_partial_by_strategy.lot_threshold,
            backtest_cumulative_profit_partial_by_strategy.cumulative_profit,
            (GREATEST(max(backtest_cumulative_profit_partial_by_strategy.cumulative_profit) OVER (PARTITION BY backtest_cumulative_profit_partial_by_strategy.strategy_id ORDER BY backtest_cumulative_profit_partial_by_strategy.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_partial_by_strategy.cumulative_profit) AS drawdown
           FROM backtest_cumulative_profit_partial_by_strategy
        ), strategies_add_tp_mdd AS (
         SELECT backtest_drawdown_partial_by_strategy.strategy_id,
            "right"(backtest_drawdown_partial_by_strategy.strategy_id, 1) AS strategy_type,
            sum(((backtest_drawdown_partial_by_strategy.profit + backtest_drawdown_partial_by_strategy.commission) + backtest_drawdown_partial_by_strategy.swap)) AS total_profit,
            count(1) AS total_orders,
            max(backtest_drawdown_partial_by_strategy.drawdown) AS mdd
           FROM backtest_drawdown_partial_by_strategy
          GROUP BY backtest_drawdown_partial_by_strategy.strategy_id
        ), strategies_add_tunning_rate AS (
         SELECT strategies_add_tp_mdd.strategy_id,
            strategies_add_tp_mdd.strategy_type,
            strategies_add_tp_mdd.total_profit,
            strategies_add_tp_mdd.total_orders,
            strategies_add_tp_mdd.mdd,
            (strategies_add_tp_mdd.total_profit / NULLIF(strategies_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(strategies_add_tp_mdd.mdd, (0)::numeric)) AS strategy_tunning_rate
           FROM strategies_add_tp_mdd
        )
 SELECT b."time",
    b.deal,
    b.symbol,
    b.type,
    b.direction,
    b.volume,
    b.price,
    b."order",
    b.commission,
    b.swap,
    b.profit,
    b.comment,
    b.strategy_id,
    b.lot_threshold,
    b.cumulative_profit,
    b.drawdown,
    a.pd,
    a.total_orders,
    a.strategy_type,
    a.strategy_tunning_rate,
    (b.commission * a.strategy_tunning_rate) AS commission_x_tr,
    (b.profit * a.strategy_tunning_rate) AS profit_x_tr,
    (b.swap * a.strategy_tunning_rate) AS swap_x_tr
   FROM (strategies_add_tunning_rate a
     JOIN backtest_drawdown_partial_by_strategy b ON ((a.strategy_id = b.strategy_id)))
  ORDER BY b."time";
```

## backtest2_upscale_by_tr_str_sytr

```sql
WITH backtest_cumulative_profit_x_tr_partial_by_symbol AS (
         SELECT backtest2_upscale_by_st_tunning_rate."time",
            backtest2_upscale_by_st_tunning_rate.deal,
            backtest2_upscale_by_st_tunning_rate.symbol,
            backtest2_upscale_by_st_tunning_rate.type,
            backtest2_upscale_by_st_tunning_rate.direction,
            backtest2_upscale_by_st_tunning_rate.volume,
            backtest2_upscale_by_st_tunning_rate.price,
            backtest2_upscale_by_st_tunning_rate."order",
            backtest2_upscale_by_st_tunning_rate.commission,
            backtest2_upscale_by_st_tunning_rate.swap,
            backtest2_upscale_by_st_tunning_rate.profit,
            backtest2_upscale_by_st_tunning_rate.comment,
            backtest2_upscale_by_st_tunning_rate.strategy_id,
            backtest2_upscale_by_st_tunning_rate.lot_threshold,
            backtest2_upscale_by_st_tunning_rate.cumulative_profit,
            backtest2_upscale_by_st_tunning_rate.drawdown,
            backtest2_upscale_by_st_tunning_rate.pd,
            backtest2_upscale_by_st_tunning_rate.total_orders,
            backtest2_upscale_by_st_tunning_rate.strategy_type,
            backtest2_upscale_by_st_tunning_rate.strategy_tunning_rate,
            backtest2_upscale_by_st_tunning_rate.commission_x_tr,
            backtest2_upscale_by_st_tunning_rate.profit_x_tr,
            backtest2_upscale_by_st_tunning_rate.swap_x_tr,
            sum(((backtest2_upscale_by_st_tunning_rate.profit_x_tr + backtest2_upscale_by_st_tunning_rate.commission_x_tr) + backtest2_upscale_by_st_tunning_rate.swap_x_tr)) OVER (PARTITION BY backtest2_upscale_by_st_tunning_rate.symbol ORDER BY backtest2_upscale_by_st_tunning_rate."time", backtest2_upscale_by_st_tunning_rate.strategy_id, backtest2_upscale_by_st_tunning_rate.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit_x_tr
           FROM backtest2_upscale_by_st_tunning_rate
        ), backtest_drawdown_partial_by_symbol AS (
         SELECT backtest_cumulative_profit_x_tr_partial_by_symbol."time",
            backtest_cumulative_profit_x_tr_partial_by_symbol.deal,
            backtest_cumulative_profit_x_tr_partial_by_symbol.symbol,
            backtest_cumulative_profit_x_tr_partial_by_symbol.type,
            backtest_cumulative_profit_x_tr_partial_by_symbol.direction,
            backtest_cumulative_profit_x_tr_partial_by_symbol.volume,
            backtest_cumulative_profit_x_tr_partial_by_symbol.price,
            backtest_cumulative_profit_x_tr_partial_by_symbol."order",
            backtest_cumulative_profit_x_tr_partial_by_symbol.commission,
            backtest_cumulative_profit_x_tr_partial_by_symbol.swap,
            backtest_cumulative_profit_x_tr_partial_by_symbol.profit,
            backtest_cumulative_profit_x_tr_partial_by_symbol.comment,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_id,
            backtest_cumulative_profit_x_tr_partial_by_symbol.lot_threshold,
            backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit,
            backtest_cumulative_profit_x_tr_partial_by_symbol.drawdown,
            backtest_cumulative_profit_x_tr_partial_by_symbol.pd,
            backtest_cumulative_profit_x_tr_partial_by_symbol.total_orders,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_type,
            backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_tunning_rate,
            backtest_cumulative_profit_x_tr_partial_by_symbol.commission_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.profit_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.swap_x_tr,
            backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr,
            (GREATEST(max(backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr) OVER (PARTITION BY backtest_cumulative_profit_x_tr_partial_by_symbol.symbol ORDER BY backtest_cumulative_profit_x_tr_partial_by_symbol."time", backtest_cumulative_profit_x_tr_partial_by_symbol.strategy_id, backtest_cumulative_profit_x_tr_partial_by_symbol.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_x_tr_partial_by_symbol.cumulative_profit_x_tr) AS drawdown_partial_by_symbol
           FROM backtest_cumulative_profit_x_tr_partial_by_symbol
        ), symbols_add_tp_mdd AS (
         SELECT backtest_drawdown_partial_by_symbol.symbol,
            sum(((backtest_drawdown_partial_by_symbol.profit_x_tr + backtest_drawdown_partial_by_symbol.commission_x_tr) + backtest_drawdown_partial_by_symbol.swap_x_tr)) AS total_profit_symbol,
            max(backtest_drawdown_partial_by_symbol.drawdown_partial_by_symbol) AS mdd
           FROM backtest_drawdown_partial_by_symbol
          GROUP BY backtest_drawdown_partial_by_symbol.symbol
        ), symbols_add_tunning_rate AS (
         SELECT symbols_add_tp_mdd.symbol,
            symbols_add_tp_mdd.total_profit_symbol,
            symbols_add_tp_mdd.mdd,
            (symbols_add_tp_mdd.total_profit_symbol / NULLIF(symbols_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(symbols_add_tp_mdd.mdd, (0)::numeric)) AS symbol_tunning_rate
           FROM symbols_add_tp_mdd
          ORDER BY symbols_add_tp_mdd.symbol
        ), backtest_upscale_by_tr_str AS (
         SELECT b_1."time",
            b_1.deal,
            b_1.symbol,
            b_1.type,
            b_1.direction,
            b_1.volume,
            b_1.price,
            b_1."order",
            b_1.commission,
            b_1.swap,
            b_1.profit,
            b_1.comment,
            b_1.strategy_id,
            b_1.lot_threshold,
            b_1.cumulative_profit,
            b_1.drawdown,
            b_1.pd,
            b_1.total_orders,
            b_1.strategy_type,
            b_1.strategy_tunning_rate,
            b_1.commission_x_tr,
            b_1.profit_x_tr,
            b_1.swap_x_tr,
            a_1.symbol_tunning_rate,
            (b_1.commission_x_tr * a_1.symbol_tunning_rate) AS commission_x_tr_str,
            (b_1.profit_x_tr * a_1.symbol_tunning_rate) AS profit_x_tr_str,
            (b_1.swap_x_tr * a_1.symbol_tunning_rate) AS swap_x_tr_str
           FROM (symbols_add_tunning_rate a_1
             JOIN backtest2_upscale_by_st_tunning_rate b_1 ON ((a_1.symbol = b_1.symbol)))
        ), backtest_cumulative_profit_x_tr_str AS (
         SELECT backtest_upscale_by_tr_str."time",
            backtest_upscale_by_tr_str.deal,
            backtest_upscale_by_tr_str.symbol,
            backtest_upscale_by_tr_str.type,
            backtest_upscale_by_tr_str.direction,
            backtest_upscale_by_tr_str.volume,
            backtest_upscale_by_tr_str.price,
            backtest_upscale_by_tr_str."order",
            backtest_upscale_by_tr_str.commission,
            backtest_upscale_by_tr_str.swap,
            backtest_upscale_by_tr_str.profit,
            backtest_upscale_by_tr_str.comment,
            backtest_upscale_by_tr_str.strategy_id,
            backtest_upscale_by_tr_str.lot_threshold,
            backtest_upscale_by_tr_str.cumulative_profit,
            backtest_upscale_by_tr_str.drawdown,
            backtest_upscale_by_tr_str.pd,
            backtest_upscale_by_tr_str.total_orders,
            backtest_upscale_by_tr_str.strategy_type,
            backtest_upscale_by_tr_str.strategy_tunning_rate,
            backtest_upscale_by_tr_str.commission_x_tr,
            backtest_upscale_by_tr_str.profit_x_tr,
            backtest_upscale_by_tr_str.swap_x_tr,
            backtest_upscale_by_tr_str.symbol_tunning_rate,
            backtest_upscale_by_tr_str.commission_x_tr_str,
            backtest_upscale_by_tr_str.profit_x_tr_str,
            backtest_upscale_by_tr_str.swap_x_tr_str,
            sum(((backtest_upscale_by_tr_str.profit_x_tr_str + backtest_upscale_by_tr_str.commission_x_tr_str) + backtest_upscale_by_tr_str.swap_x_tr_str)) OVER (ORDER BY backtest_upscale_by_tr_str."time", backtest_upscale_by_tr_str.strategy_id, backtest_upscale_by_tr_str.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_profit_x_tr_str
           FROM backtest_upscale_by_tr_str
        ), backtest_drawdown_system AS (
         SELECT backtest_cumulative_profit_x_tr_str."time",
            backtest_cumulative_profit_x_tr_str.deal,
            backtest_cumulative_profit_x_tr_str.symbol,
            backtest_cumulative_profit_x_tr_str.type,
            backtest_cumulative_profit_x_tr_str.direction,
            backtest_cumulative_profit_x_tr_str.volume,
            backtest_cumulative_profit_x_tr_str.price,
            backtest_cumulative_profit_x_tr_str."order",
            backtest_cumulative_profit_x_tr_str.commission,
            backtest_cumulative_profit_x_tr_str.swap,
            backtest_cumulative_profit_x_tr_str.profit,
            backtest_cumulative_profit_x_tr_str.comment,
            backtest_cumulative_profit_x_tr_str.strategy_id,
            backtest_cumulative_profit_x_tr_str.lot_threshold,
            backtest_cumulative_profit_x_tr_str.cumulative_profit,
            backtest_cumulative_profit_x_tr_str.drawdown,
            backtest_cumulative_profit_x_tr_str.pd,
            backtest_cumulative_profit_x_tr_str.total_orders,
            backtest_cumulative_profit_x_tr_str.strategy_type,
            backtest_cumulative_profit_x_tr_str.strategy_tunning_rate,
            backtest_cumulative_profit_x_tr_str.commission_x_tr,
            backtest_cumulative_profit_x_tr_str.profit_x_tr,
            backtest_cumulative_profit_x_tr_str.swap_x_tr,
            backtest_cumulative_profit_x_tr_str.symbol_tunning_rate,
            backtest_cumulative_profit_x_tr_str.commission_x_tr_str,
            backtest_cumulative_profit_x_tr_str.profit_x_tr_str,
            backtest_cumulative_profit_x_tr_str.swap_x_tr_str,
            backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str,
            (GREATEST(max(backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str) OVER (ORDER BY backtest_cumulative_profit_x_tr_str."time", backtest_cumulative_profit_x_tr_str.strategy_id, backtest_cumulative_profit_x_tr_str.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - backtest_cumulative_profit_x_tr_str.cumulative_profit_x_tr_str) AS drawdown_system
           FROM backtest_cumulative_profit_x_tr_str
        ), system_add_tp_mdd AS (
         SELECT sum(((backtest_drawdown_system.profit_x_tr_str + backtest_drawdown_system.commission_x_tr_str) + backtest_drawdown_system.swap_x_tr_str)) AS total_profit_system,
            max(backtest_drawdown_system.drawdown_system) AS mdd,
            count(DISTINCT backtest_drawdown_system.strategy_id) AS no_strategies,
            (count(*) / 2) AS total_trades
           FROM backtest_drawdown_system
        ), system_add_tunning_rate AS (
         SELECT system_add_tp_mdd.total_profit_system,
            system_add_tp_mdd.mdd,
            system_add_tp_mdd.no_strategies,
            system_add_tp_mdd.total_trades,
            (system_add_tp_mdd.total_profit_system / NULLIF(system_add_tp_mdd.mdd, (0)::numeric)) AS pd,
            ((1000000)::numeric / NULLIF(system_add_tp_mdd.mdd, (0)::numeric)) AS system_tunning_rate
           FROM system_add_tp_mdd
        )
 SELECT b."time",
    b.deal,
    b.symbol,
    b.type,
    b.direction,
    b.volume,
    b.price,
    b."order",
    b.commission,
    b.swap,
    b.profit,
    b.comment,
    b.strategy_id,
    b.lot_threshold,
    b.cumulative_profit,
    b.drawdown,
    b.pd,
    b.total_orders,
    b.strategy_type,
    b.strategy_tunning_rate,
    b.commission_x_tr,
    b.profit_x_tr,
    b.swap_x_tr,
    b.symbol_tunning_rate,
    b.commission_x_tr_str,
    b.profit_x_tr_str,
    b.swap_x_tr_str,
    a.system_tunning_rate,
    (b.commission_x_tr_str * a.system_tunning_rate) AS commission_x_tr_str_sytr,
    (b.profit_x_tr_str * a.system_tunning_rate) AS profit_x_tr_str_sytr,
    (b.swap_x_tr_str * a.system_tunning_rate) AS swap_x_tr_str_sytr
   FROM system_add_tunning_rate a,
    backtest_upscale_by_tr_str b
  ORDER BY b."time";
```

## white_lotus_add_tunning_rate

```sql
WITH white_lotus_upscale AS (
         SELECT backtest1_upscale_by_tr_str_sytr."time",
            backtest1_upscale_by_tr_str_sytr.deal,
            backtest1_upscale_by_tr_str_sytr.symbol,
            backtest1_upscale_by_tr_str_sytr.type,
            backtest1_upscale_by_tr_str_sytr.direction,
            backtest1_upscale_by_tr_str_sytr.volume,
            backtest1_upscale_by_tr_str_sytr.price,
            backtest1_upscale_by_tr_str_sytr."order",
            backtest1_upscale_by_tr_str_sytr.commission,
            backtest1_upscale_by_tr_str_sytr.swap,
            backtest1_upscale_by_tr_str_sytr.profit,
            backtest1_upscale_by_tr_str_sytr.comment,
            backtest1_upscale_by_tr_str_sytr.strategy_id,
            backtest1_upscale_by_tr_str_sytr.lot_threshold,
            backtest1_upscale_by_tr_str_sytr.cumulative_profit,
            backtest1_upscale_by_tr_str_sytr.drawdown,
            backtest1_upscale_by_tr_str_sytr.pd,
            backtest1_upscale_by_tr_str_sytr.total_orders,
            backtest1_upscale_by_tr_str_sytr.strategy_type,
            backtest1_upscale_by_tr_str_sytr.strategy_tunning_rate,
            backtest1_upscale_by_tr_str_sytr.commission_x_tr,
            backtest1_upscale_by_tr_str_sytr.profit_x_tr,
            backtest1_upscale_by_tr_str_sytr.swap_x_tr,
            backtest1_upscale_by_tr_str_sytr.symbol_tunning_rate,
            backtest1_upscale_by_tr_str_sytr.commission_x_tr_str,
            backtest1_upscale_by_tr_str_sytr.profit_x_tr_str,
            backtest1_upscale_by_tr_str_sytr.swap_x_tr_str,
            backtest1_upscale_by_tr_str_sytr.system_tunning_rate,
            backtest1_upscale_by_tr_str_sytr.commission_x_tr_str_sytr,
            backtest1_upscale_by_tr_str_sytr.profit_x_tr_str_sytr,
            backtest1_upscale_by_tr_str_sytr.swap_x_tr_str_sytr,
            'backtest1'::text AS backtest_name
           FROM backtest1_upscale_by_tr_str_sytr
        UNION ALL
         SELECT backtest2_upscale_by_tr_str_sytr."time",
            backtest2_upscale_by_tr_str_sytr.deal,
            backtest2_upscale_by_tr_str_sytr.symbol,
            backtest2_upscale_by_tr_str_sytr.type,
            backtest2_upscale_by_tr_str_sytr.direction,
            backtest2_upscale_by_tr_str_sytr.volume,
            backtest2_upscale_by_tr_str_sytr.price,
            backtest2_upscale_by_tr_str_sytr."order",
            backtest2_upscale_by_tr_str_sytr.commission,
            backtest2_upscale_by_tr_str_sytr.swap,
            backtest2_upscale_by_tr_str_sytr.profit,
            backtest2_upscale_by_tr_str_sytr.comment,
            backtest2_upscale_by_tr_str_sytr.strategy_id,
            backtest2_upscale_by_tr_str_sytr.lot_threshold,
            backtest2_upscale_by_tr_str_sytr.cumulative_profit,
            backtest2_upscale_by_tr_str_sytr.drawdown,
            backtest2_upscale_by_tr_str_sytr.pd,
            backtest2_upscale_by_tr_str_sytr.total_orders,
            backtest2_upscale_by_tr_str_sytr.strategy_type,
            backtest2_upscale_by_tr_str_sytr.strategy_tunning_rate,
            backtest2_upscale_by_tr_str_sytr.commission_x_tr,
            backtest2_upscale_by_tr_str_sytr.profit_x_tr,
            backtest2_upscale_by_tr_str_sytr.swap_x_tr,
            backtest2_upscale_by_tr_str_sytr.symbol_tunning_rate,
            backtest2_upscale_by_tr_str_sytr.commission_x_tr_str,
            backtest2_upscale_by_tr_str_sytr.profit_x_tr_str,
            backtest2_upscale_by_tr_str_sytr.swap_x_tr_str,
            backtest2_upscale_by_tr_str_sytr.system_tunning_rate,
            backtest2_upscale_by_tr_str_sytr.commission_x_tr_str_sytr,
            backtest2_upscale_by_tr_str_sytr.profit_x_tr_str_sytr,
            backtest2_upscale_by_tr_str_sytr.swap_x_tr_str_sytr,
            'backtest2'::text AS backtest_name
           FROM backtest2_upscale_by_tr_str_sytr
        ), white_lotus_cumulative_profit AS (
         SELECT white_lotus_upscale."time",
            white_lotus_upscale.deal,
            white_lotus_upscale.symbol,
            white_lotus_upscale.type,
            white_lotus_upscale.direction,
            white_lotus_upscale.volume,
            white_lotus_upscale.price,
            white_lotus_upscale."order",
            white_lotus_upscale.commission,
            white_lotus_upscale.swap,
            white_lotus_upscale.profit,
            white_lotus_upscale.comment,
            white_lotus_upscale.strategy_id,
            white_lotus_upscale.lot_threshold,
            white_lotus_upscale.cumulative_profit,
            white_lotus_upscale.drawdown,
            white_lotus_upscale.pd,
            white_lotus_upscale.total_orders,
            white_lotus_upscale.strategy_type,
            white_lotus_upscale.strategy_tunning_rate,
            white_lotus_upscale.commission_x_tr,
            white_lotus_upscale.profit_x_tr,
            white_lotus_upscale.swap_x_tr,
            white_lotus_upscale.symbol_tunning_rate,
            white_lotus_upscale.commission_x_tr_str,
            white_lotus_upscale.profit_x_tr_str,
            white_lotus_upscale.swap_x_tr_str,
            white_lotus_upscale.system_tunning_rate,
            white_lotus_upscale.commission_x_tr_str_sytr,
            white_lotus_upscale.profit_x_tr_str_sytr,
            white_lotus_upscale.swap_x_tr_str_sytr,
            white_lotus_upscale.backtest_name,
            sum(((white_lotus_upscale.profit_x_tr_str_sytr + white_lotus_upscale.commission_x_tr_str_sytr) + white_lotus_upscale.swap_x_tr_str_sytr)) OVER (ORDER BY white_lotus_upscale."time", white_lotus_upscale.backtest_name, white_lotus_upscale.strategy_id, white_lotus_upscale.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS wl_cumulative_profit
           FROM white_lotus_upscale
          ORDER BY white_lotus_upscale."time"
        ), white_lotus_drawdown AS (
         SELECT white_lotus_cumulative_profit."time",
            white_lotus_cumulative_profit.deal,
            white_lotus_cumulative_profit.symbol,
            white_lotus_cumulative_profit.type,
            white_lotus_cumulative_profit.direction,
            white_lotus_cumulative_profit.volume,
            white_lotus_cumulative_profit.price,
            white_lotus_cumulative_profit."order",
            white_lotus_cumulative_profit.commission,
            white_lotus_cumulative_profit.swap,
            white_lotus_cumulative_profit.profit,
            white_lotus_cumulative_profit.comment,
            white_lotus_cumulative_profit.strategy_id,
            white_lotus_cumulative_profit.lot_threshold,
            white_lotus_cumulative_profit.cumulative_profit,
            white_lotus_cumulative_profit.drawdown,
            white_lotus_cumulative_profit.pd,
            white_lotus_cumulative_profit.total_orders,
            white_lotus_cumulative_profit.strategy_type,
            white_lotus_cumulative_profit.strategy_tunning_rate,
            white_lotus_cumulative_profit.commission_x_tr,
            white_lotus_cumulative_profit.profit_x_tr,
            white_lotus_cumulative_profit.swap_x_tr,
            white_lotus_cumulative_profit.symbol_tunning_rate,
            white_lotus_cumulative_profit.commission_x_tr_str,
            white_lotus_cumulative_profit.profit_x_tr_str,
            white_lotus_cumulative_profit.swap_x_tr_str,
            white_lotus_cumulative_profit.system_tunning_rate,
            white_lotus_cumulative_profit.commission_x_tr_str_sytr,
            white_lotus_cumulative_profit.profit_x_tr_str_sytr,
            white_lotus_cumulative_profit.swap_x_tr_str_sytr,
            white_lotus_cumulative_profit.backtest_name,
            white_lotus_cumulative_profit.wl_cumulative_profit,
            (GREATEST(max(white_lotus_cumulative_profit.wl_cumulative_profit) OVER (ORDER BY white_lotus_cumulative_profit."time", white_lotus_cumulative_profit.backtest_name, white_lotus_cumulative_profit.strategy_id, white_lotus_cumulative_profit.deal ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), (0)::numeric) - white_lotus_cumulative_profit.wl_cumulative_profit) AS wl_drawdown
           FROM white_lotus_cumulative_profit
        ), white_lotus_daily_stats AS (
         SELECT date(white_lotus_drawdown."time") AS date,
            sum(((white_lotus_drawdown.profit_x_tr_str_sytr + white_lotus_drawdown.commission_x_tr_str_sytr) + white_lotus_drawdown.swap_x_tr_str_sytr)) AS daily_profit
           FROM white_lotus_drawdown
          GROUP BY (date(white_lotus_drawdown."time"))
        ), white_lotus_weekly_stats AS (
         SELECT date_trunc('week'::text, white_lotus_drawdown."time") AS trade_week,
            sum(((white_lotus_drawdown.profit_x_tr_str_sytr + white_lotus_drawdown.commission_x_tr_str_sytr) + white_lotus_drawdown.swap_x_tr_str_sytr)) AS weekly_profit
           FROM white_lotus_drawdown
          GROUP BY (date_trunc('week'::text, white_lotus_drawdown."time"))
        ), white_lotus_sharpe_daily_calc AS (
         SELECT count(white_lotus_daily_stats.date) AS no_days,
            avg(white_lotus_daily_stats.daily_profit) AS avg_daily_return,
            stddev(white_lotus_daily_stats.daily_profit) AS std_daily_dev,
            (avg(white_lotus_daily_stats.daily_profit) / NULLIF(stddev(white_lotus_daily_stats.daily_profit), (0)::numeric)) AS sharpe_daily,
            (((avg(white_lotus_daily_stats.daily_profit) / NULLIF(stddev(white_lotus_daily_stats.daily_profit), (0)::numeric)))::double precision * sqrt((365)::double precision)) AS sharpe_d_anualized
           FROM white_lotus_daily_stats
        ), white_lotus_sharpe_weekly_calc AS (
         SELECT count(white_lotus_weekly_stats.trade_week) AS no_weeks,
            avg(white_lotus_weekly_stats.weekly_profit) AS avg_daily_return,
            stddev(white_lotus_weekly_stats.weekly_profit) AS std_daily_dev,
            (avg(white_lotus_weekly_stats.weekly_profit) / NULLIF(stddev(white_lotus_weekly_stats.weekly_profit), (0)::numeric)) AS sharpe_weekly,
            (((avg(white_lotus_weekly_stats.weekly_profit) / NULLIF(stddev(white_lotus_weekly_stats.weekly_profit), (0)::numeric)))::double precision * sqrt((52)::double precision)) AS sharpe_w_annualized
           FROM white_lotus_weekly_stats
        ), white_lotus_add_tp_mdd AS (
         SELECT sum(((white_lotus_drawdown.profit_x_tr_str_sytr + white_lotus_drawdown.commission_x_tr_str_sytr) + white_lotus_drawdown.swap_x_tr_str_sytr)) AS total_profit_wl,
            max(white_lotus_drawdown.wl_drawdown) AS mdd,
            count(DISTINCT ROW(white_lotus_drawdown.strategy_id, white_lotus_drawdown.backtest_name)) AS no_strategies,
            (count(*) / 2) AS total_trades,
            (((avg(((white_lotus_drawdown.profit_x_tr_str_sytr + white_lotus_drawdown.commission_x_tr_str_sytr) + white_lotus_drawdown.swap_x_tr_str_sytr)) / NULLIF(stddev(((white_lotus_drawdown.profit_x_tr_str_sytr + white_lotus_drawdown.commission_x_tr_str_sytr) + white_lotus_drawdown.swap_x_tr_str_sytr)), (0)::numeric)))::double precision * sqrt((count(*))::double precision)) AS sqn_score
           FROM white_lotus_drawdown
        ), white_lotus_add_tunning_rate AS (
         SELECT a.total_profit_wl,
            a.mdd,
            a.no_strategies,
            a.total_trades,
            a.sqn_score,
            (a.total_profit_wl / a.mdd) AS pd,
            ((100000)::numeric / a.mdd) AS wl_tunning_rate,
            b.no_days,
            c.no_weeks,
            ((b.avg_daily_return * (100000)::numeric) / a.mdd) AS avg_daily_return,
            ((b.std_daily_dev * (100000)::numeric) / a.mdd) AS std_daily_dev,
            b.sharpe_daily,
            b.sharpe_d_anualized,
            c.sharpe_weekly,
            c.sharpe_w_annualized
           FROM ((white_lotus_add_tp_mdd a
             CROSS JOIN white_lotus_sharpe_daily_calc b)
             CROSS JOIN white_lotus_sharpe_weekly_calc c)
        )
 SELECT total_profit_wl,
    mdd,
    no_strategies,
    total_trades,
    sqn_score,
    pd,
    wl_tunning_rate,
    no_days,
    no_weeks,
    avg_daily_return,
    std_daily_dev,
    sharpe_daily,
    sharpe_d_anualized,
    sharpe_weekly,
    sharpe_w_annualized
   FROM white_lotus_add_tunning_rate;
```

