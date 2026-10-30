from __future__ import annotations

import html
import json
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, fields
from pathlib import Path
import os
import shutil


@dataclass
class FilterConfig:
    min_profit: float = 10000
    min_trades: float = 100
    max_trades: float = 1200
    min_recovery_factor: float = 2
    min_profit_factor: float = 1
    max_profit_factor: float = 4
    min_equity_dd: float = 8
    max_equity_dd: float = 13
    min_pd_ratio: float = 0
    max_pd_ratio: float = 0
    min_sharpe_ratio: float = 0
    max_sharpe_ratio: float = 0
    top_n: int = 10

    def __init__(self, **kwargs):
        # Set default values first
        self.min_profit = 10000
        self.min_trades = 100
        self.max_trades = 1200
        self.min_recovery_factor = 2
        self.min_profit_factor = 1
        self.max_profit_factor = 4
        self.min_equity_dd = 8
        self.max_equity_dd = 13
        self.min_pd_ratio = 0
        self.max_pd_ratio = 0
        self.min_sharpe_ratio = 0
        self.max_sharpe_ratio = 0
        self.top_n = 10

        names = {f.name for f in fields(self.__class__)}
        for k, v in kwargs.items():
            if k in names and v is not None and v != "":
                try:
                    if k == "top_n":
                        setattr(self, k, int(v))
                    else:
                        setattr(self, k, float(v))
                except (ValueError, TypeError):
                    pass

    @classmethod
    def from_dict(cls, data: dict) -> "FilterConfig":
        if not data:
            return cls()
        return cls(**data)

    def to_dict(self) -> dict:
        return asdict(self)


def parse_mt5_xml_report(xml_path: Path) -> list[dict[str, object]]:
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        rows: list[list[str]] = []

        # MT5 exports both namespaced SpreadsheetML and valid XML without the
        # expected ss prefix. Match by local tag name so both variants parse.
        for row in (node for node in root.iter() if _xml_local_name(node.tag) == "Row"):
            cells = [node for node in row if _xml_local_name(node.tag) == "Cell"]
            row_data: list[str] = []
            for cell in cells:
                index_value = next(
                    (value for key, value in cell.attrib.items() if _xml_local_name(key) == "Index"),
                    None,
                )
                if index_value:
                    try:
                        while len(row_data) < max(0, int(index_value) - 1):
                            row_data.append("")
                    except ValueError:
                        pass
                data_node = next(
                    (node for node in cell.iter() if _xml_local_name(node.tag) == "Data"),
                    None,
                )
                row_data.append(data_node.text if data_node is not None and data_node.text is not None else "")
            if row_data and any(row_data):
                rows.append(row_data)

        if not rows:
            return _parse_mt5_html_report(xml_path)

        header_index = next(
            (
                index for index, values in enumerate(rows)
                if "Pass" in values and any(name in values for name in ("Result", "Profit", "Trades"))
            ),
            -1,
        )
        if header_index < 0:
            return _parse_mt5_html_report(xml_path)

        header = rows[header_index]
        parsed_rows: list[dict[str, object]] = []
        for values in rows[header_index + 1:]:
            row = {
                key: values[idx] if idx < len(values) else ""
                for idx, key in enumerate(header)
                if key
            }
            if row and any(value not in (None, "") for value in row.values()):
                parsed_rows.append(_normalize_row(row))
        return parsed_rows
    except ET.ParseError:
        return _parse_mt5_html_report(xml_path)


def _xml_local_name(tag: object) -> str:
    value = str(tag)
    return value.rsplit("}", 1)[-1].split(":", 1)[-1]


def merge_result_rows(result_sets: list[list[dict[str, object]]]) -> list[dict[str, object]]:
    merged: list[dict[str, object]] = []
    for result_set in result_sets:
        merged.extend(result_set)
    return merged


def classify_rows(rows: list[dict[str, object]], config: FilterConfig) -> list[dict[str, object]]:
    classified: list[dict[str, object]] = []
    for row in rows:
        profit = _num(row.get("Profit"))
        trades = _num(row.get("Trades"))
        recovery = _num(row.get("Recovery Factor"))
        profit_factor = _num(row.get("Profit Factor"))
        equity_dd = _num(row.get("Equity DD %"))

        enriched = dict(row)
        enriched["selected"] = False
        enriched["filter_reason"] = None
        enriched["DD_Deviation"] = abs(equity_dd - 10) if equity_dd is not None else None
        result_value = _num(row.get("Result"), default=0)
        enriched["Result_Value"] = result_value
        if profit is not None and equity_dd is not None and equity_dd > 0:
            dd_amount = 1000000.0 * (equity_dd / 100.0)
            enriched["pd_ratio"] = round(profit / dd_amount, 2)
        else:
            enriched["pd_ratio"] = None

        if profit is None or trades is None or recovery is None or profit_factor is None or equity_dd is None:
            enriched["filter_reason"] = "missing_metric"
        elif profit < config.min_profit:
            enriched["filter_reason"] = "profit_too_low"
        elif not (config.min_trades <= trades < config.max_trades):
            enriched["filter_reason"] = "trades_out_of_range"
        elif recovery <= config.min_recovery_factor:
            enriched["filter_reason"] = "recovery_factor_too_low"
        elif not (config.min_profit_factor <= profit_factor <= config.max_profit_factor):
            enriched["filter_reason"] = "profit_factor_out_of_range"
        elif not (config.min_equity_dd <= equity_dd <= config.max_equity_dd):
            enriched["filter_reason"] = "equity_dd_out_of_range"
        elif config.min_pd_ratio > 0 and enriched.get("pd_ratio") is not None and (enriched["pd_ratio"] < config.min_pd_ratio or (config.max_pd_ratio > 0 and enriched["pd_ratio"] > config.max_pd_ratio)):
            enriched["filter_reason"] = "pd_ratio_out_of_range"
        else:
            enriched["selected"] = True

        classified.append(enriched)

    classified.sort(
        key=lambda row: (
            0 if row.get("selected") else 1,
            -_num(row.get("Result"), default=0),
            -_num(row.get("Trades"), default=0),
            _num(row.get("DD_Deviation"), default=999999),
            -_num(row.get("Profit"), default=0),
        )
    )
    return classified


def filter_rows(rows: list[dict[str, object]], config: FilterConfig) -> list[dict[str, object]]:
    classified = classify_rows(rows, config)
    return [row for row in classified if row.get("selected")][: config.top_n]


def select_top_selected_rows(
    rows: list[dict[str, object]],
    config: FilterConfig,
    limit: int,
) -> list[dict[str, object]]:
    classified = classify_rows(rows, config)
    selected = [row for row in classified if row.get("selected")]
    if limit <= 0:
        return selected
    return selected[:limit]


def write_filtered_snapshot(rows: list[dict[str, object]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def generate_backtest_ini_files(
    template_ini_path: Path,
    selected_rows: list[dict[str, object]],
    output_dir: Path,
) -> list[Path]:
    if not selected_rows:
        return []

    source_lines = _read_ini_lines(template_ini_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    excluded_columns = {
        "template_ini_name",
        "template_ini_relpath",
        "optimize_run_no",
        "rank_no",
        "selected",
        "job_id",
        "run_id",
        "summary",
        "Pass",
        "Result",
        "Profit",
        "Expected Payoff",
        "Profit Factor",
        "Recovery Factor",
        "Sharpe Ratio",
        "Custom",
        "Equity DD %",
        "Trades",
        "DD_Deviation",
        "Result_Priority",
    }
    params = [column for column in selected_rows[0].keys() if column not in excluded_columns]

    generated: list[Path] = []
    base_name = template_ini_path.stem
    for index, row in enumerate(selected_rows, start=1):
        profit_value = int(_num(row.get("Profit"), default=0))
        file_name = f"{base_name}_{profit_value}_{index}.ini"
        target_path = output_dir / file_name
        rendered_lines: list[str] = []

        for line in source_lines:
            if line.startswith("Optimization="):
                rendered_lines.append("Optimization=0\n")
            elif line.startswith("Model="):
                rendered_lines.append("Model=0\n")
            elif line.startswith("ShutdownTerminal="):
                rendered_lines.append("ShutdownTerminal=1\n")
            elif line.startswith("Report=") or line.startswith("ReplaceReport="):
                continue
            else:
                updated_line = _render_parameter_line(line, params, row)
                rendered_lines.append(updated_line if updated_line is not None else line)

        target_path.write_text("".join(rendered_lines), encoding="utf-16")
        generated.append(target_path)

    return generated


def _read_ini_lines(ini_path: Path) -> list[str]:
    return _read_text_fallback(ini_path).splitlines(keepends=True)


def _read_text_fallback(path: Path) -> str:
    for encoding in ("utf-16", "utf-8-sig", "utf-8", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeError:
            continue
    raise RuntimeError(f"Cannot read text file: {path}")


def _parse_mt5_html_report(report_path: Path) -> list[dict[str, object]]:
    text = _read_text_fallback(report_path)
    row: dict[str, object] = {}

    sections = list(
        re.finditer(
            r"<tr[^>]*>\s*<td[^>]*colspan\s*=\s*[\"']?13[\"']?[^>]*><div[^>]*><b>([^<]+)</b>",
            text,
            flags=re.IGNORECASE,
        )
    )
    settings_start = None
    results_start = None
    for match in sections:
        title = _clean_html_text(match.group(1))
        if title == "Settings":
            settings_start = match.start()
        elif title == "Results":
            results_start = match.start()
            break

    if settings_start is not None and results_start is not None:
        settings_html = text[settings_start:results_start]
        _extract_input_parameters(settings_html, row)

    if results_start is not None:
        results_html = text[results_start:]
        _extract_result_metrics(results_html, row)

    return [_normalize_row(row)] if row else []


def _extract_input_parameters(section_html: str, row: dict[str, object], input_keys: set[str] | None = None) -> None:
    current_input_block = False
    global_meta_labels = {
        "Expert", "Symbol", "Period", "Company", "Currency", "Initial Deposit", "Leverage"
    }

    for tr_html in re.findall(r"<tr[^>]*>(.*?)</tr>", section_html, flags=re.IGNORECASE | re.DOTALL):
        cells = [_clean_html_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", tr_html, flags=re.IGNORECASE | re.DOTALL)]
        cells = [cell for cell in cells if cell]
        if not cells:
            continue
        label = cells[0].rstrip(":")
        value = cells[-1]

        if label in global_meta_labels:
            row[label] = value
            continue

        if label == "Inputs":
            current_input_block = True
            _maybe_store_input(value, row, input_keys)
            continue

        if current_input_block and "=" in value:
            _maybe_store_input(value, row, input_keys)
            continue

        if current_input_block and "=" not in value:
            current_input_block = False


def _extract_result_metrics(section_html: str, row: dict[str, object]) -> None:
    label_map = {
        "Total Net Profit": "Profit",
        "Gross Profit": "Gross Profit",
        "Gross Loss": "Gross Loss",
        "Profit Factor": "Profit Factor",
        "Recovery Factor": "Recovery Factor",
        "Expected Payoff": "Expected Payoff",
        "Sharpe Ratio": "Sharpe Ratio",
        # MT5 distinguishes positions/trades from execution deals.
        # Keep both values; mapping both labels to ``Trades`` made the
        # latter row overwrite the former and caused the UI to show deals
        # as total trades.
        "Total Deals": "Total Deals",
        "Total Trades": "Total Trades",
        "Largest loss trade": "Largest Loss Trade",
        "Largest profit trade": "Largest Profit Trade",
        "Average profit trade": "Average profit trade",
        "Average loss trade": "Average loss trade",
        "History Quality": "History Quality",
        "Bars": "Bars",
        "Ticks": "Ticks",
        "Symbols": "Symbols",
        "Margin Level": "Margin Level",
        "Z-Score": "Z-Score",
        "AHPR": "AHPR",
        "GHPR": "GHPR",
        "LR Correlation": "LR Correlation",
        "LR Standard Error": "LR Standard Error",
        "OnTester result": "OnTester result",
        "Minimal position holding time": "Minimal position holding time",
        "Maximal position holding time": "Maximal position holding time",
        "Average position holding time": "Average position holding time",
        "Balance Drawdown Absolute": "Balance Drawdown Absolute",
        "Equity Drawdown Absolute": "Equity Drawdown Absolute",
        "Balance Drawdown Maximal": "Balance Drawdown Maximal",
        "Equity Drawdown Maximal": "Equity Drawdown Maximal",
        "Balance Drawdown Relative": "Balance Drawdown Relative",
        "Equity Drawdown Relative": "Equity Drawdown Relative",
        "Short Trades (won %)": "Short Trades (won %)",
        "Long Trades (won %)": "Long Trades (won %)",
        "Profit Trades (% of total)": "Profit Trades (% of total)",
        "Loss Trades (% of total)": "Loss Trades (% of total)",
        "Correlation (Profits,MFE)": "Correlation (Profits,MFE)",
        "Correlation (Profits,MAE)": "Correlation (Profits,MAE)",
        "Correlation (MFE,MAE)": "Correlation (MFE,MAE)",
        "Maximum consecutive wins ($)": "Maximum consecutive wins ($)",
        "Maximum consecutive losses ($)": "Maximum consecutive losses ($)",
        "Maximal consecutive profit (count)": "Maximal consecutive profit (count)",
        "Maximal consecutive loss (count)": "Maximal consecutive loss (count)",
        "Average consecutive wins": "Average consecutive wins",
        "Average consecutive losses": "Average consecutive losses",
    }
    percent_map = {
        "Equity Drawdown Relative": "Equity DD %",
        "Equity Drawdown Maximal": "Equity DD %",
    }

    for tr_html in re.findall(r"<tr[^>]*>(.*?)</tr>", section_html, flags=re.IGNORECASE | re.DOTALL):
        cells = [_clean_html_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", tr_html, flags=re.IGNORECASE | re.DOTALL)]
        if len(cells) < 2:
            continue
        cleaned = [cell for cell in cells if cell]
        for index in range(0, len(cleaned) - 1, 2):
            label = cleaned[index].rstrip(":")
            value = cleaned[index + 1]
            if label in label_map:
                row[label_map[label]] = value
            elif label in percent_map:
                percent = _extract_percent(value)
                if percent is not None:
                    row[percent_map[label]] = percent

    # The optimization pipeline historically consumes ``Trades`` for its
    # trade-count filters. Preserve that compatibility, but make it mean
    # MT5 Total Trades (not Total Deals) whenever the explicit field exists.
    if "Total Trades" in row:
        row["Trades"] = row["Total Trades"]


def _maybe_store_input(raw_value: str, row: dict[str, object], input_keys: set[str] = None) -> None:
    if "=" not in raw_value:
        return
    key, value = raw_value.split("=", 1)
    k = key.strip()
    row[k] = value.strip()
    if input_keys is not None:
        input_keys.add(k)


def _extract_percent(value: str) -> str | None:
    match = re.search(r"([-+]?\d+(?:\.\d+)?)\s*%", value)
    if match:
        return match.group(1)
    return None


def _clean_html_text(value: str) -> str:
    without_tags = re.sub(r"<[^>]+>", "", value)
    return html.unescape(without_tags).replace("\xa0", " ").strip()


def _render_parameter_line(
    line: str,
    params: list[str],
    row: dict[str, object],
) -> str | None:
    for parameter in params:
        if line.startswith(f"{parameter}="):
            try:
                parts = line.split("=", 1)[1].split("||")
                if len(parts) < 5:
                    return None
                value = row.get(parameter, "")
                rendered_value = _render_value(value)
                return f"{parameter}={rendered_value}||{parts[1]}||{parts[2]}||{parts[3]}||{parts[4]}"
            except Exception:
                return None
    return None


def _normalize_row(row: dict[str, object]) -> dict[str, object]:
    normalized: dict[str, object] = {}
    for key, value in row.items():
        normalized[key] = _maybe_number(value)
    return normalized


def _maybe_number(value: object) -> object:
    if not isinstance(value, str):
        return value
    stripped = value.replace("%", "").replace("\xa0", "").replace(" ", "").replace(",", "")
    if stripped == "":
        return value
    try:
        number = float(stripped)
    except ValueError:
        return value
    if math.isfinite(number) and number.is_integer():
        return int(number)
    return number


def _num(value: object, default: float | None = None) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        converted = _maybe_number(value)
        if isinstance(converted, (int, float)):
            return float(converted)
    return default


def _render_value(value: object) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def parse_mt5_single_backtest_report(report_path: Path) -> dict:
    text = _read_text_fallback(report_path)
    row: dict[str, object] = {}
    input_keys = set()

    # 1. Bóc tách Settings và Results
    sections = list(
        re.finditer(
            r"<tr[^>]*>\s*<(?:td|th)[^>]*colspan\s*=\s*[\"']?(?:11|12|13)[\"']?[^>]*><div[^>]*><b>([^<]+)</b>",
            text,
            flags=re.IGNORECASE,
        )
    )
    settings_start = None
    results_start = None
    deals_start = None
    orders_start = None
    
    for match in sections:
        title = _clean_html_text(match.group(1))
        if title == "Settings":
            settings_start = match.start()
        elif title == "Results":
            results_start = match.start()
        elif title == "Deals" or title == "Transactions":
            deals_start = match.start()
        elif title == "Orders" or title == "Working Orders":
            orders_start = match.start()

    if settings_start is not None and results_start is not None:
        settings_html = text[settings_start:results_start]
        _extract_input_parameters(settings_html, row, input_keys)

    if results_start is not None:
        if orders_start is not None and orders_start > results_start:
            end_idx = orders_start
        elif deals_start is not None and deals_start > results_start:
            end_idx = deals_start
        else:
            end_idx = len(text)
        results_html = text[results_start:end_idx]
        _extract_result_metrics(results_html, row)

    # 2. Bóc tách danh sách Deals thô
    # Fallback: Nếu không tìm thấy Deals nhưng có Orders (chứa danh sách khớp lệnh)
    if deals_start is None and orders_start is not None:
        deals_start = orders_start

    deals = []
    if deals_start is not None:
        deals_html = text[deals_start:]
        
        # Quét các thẻ TR trong bảng Deals
        for tr_html in re.findall(r"<tr[^>]*>(.*?)</tr>", deals_html, flags=re.IGNORECASE | re.DOTALL):
            cells = [_clean_html_text(cell) for cell in re.findall(r"<td[^>]*>(.*?)</td>", tr_html, flags=re.IGNORECASE | re.DOTALL)]
            if len(cells) < 8:
                continue
            
            # Bỏ qua dòng tiêu đề cột
            if "Time" in cells or "Order" in cells or "Deal" in cells:
                continue
                
            try:
                deal_time = cells[0]
                deal_id_val = cells[1]
                deal_symbol = cells[2]
                deal_type = cells[3]
                deal_direction = cells[4]
                deal_volume = cells[5]
                deal_price = cells[6]
                deal_order = cells[7]
                deal_commission = cells[8] if len(cells) > 8 else ""
                deal_swap = cells[9] if len(cells) > 9 else ""
                deal_profit = cells[10] if len(cells) > 10 else ""
                deal_balance = cells[11] if len(cells) > 11 else ""
                deal_comment = cells[12] if len(cells) > 12 else ""
                
                # Bỏ qua dòng tổng cộng ở cuối bảng deals (dòng không có Deal ID dạng số)
                cleaned_deal = deal_id_val.replace(" ", "").strip()
                if not re.match(r"^\d+$", cleaned_deal):
                    continue
                
                deals.append({
                    "time": deal_time,
                    "deal": _maybe_number(deal_id_val),
                    "order": _maybe_number(deal_order),
                    "symbol": deal_symbol,
                    "type": deal_type,
                    "direction": deal_direction,
                    "volume": _maybe_number(deal_volume),
                    "price": _maybe_number(deal_price),
                    "commission": _maybe_number(deal_commission),
                    "swap": _maybe_number(deal_swap),
                    "profit": _maybe_number(deal_profit),
                    "balance": _maybe_number(deal_balance),
                    "comment": deal_comment
                })
            except Exception as e:
                print(f"[worker] warning: failed to parse deal row: {e}", flush=True)
                continue

    # 3. Chuẩn hóa Settings / Results
    normalized_row = _normalize_row(row)
    
    # Phân biệt các trường kết quả chính với tham số EA cài đặt
    meta_keys = {"Expert", "Symbol", "Period", "Company", "Currency", "Initial Deposit", "Leverage"}
    params_json = {}
    results_json = {}
    
    for k, v in normalized_row.items():
        if k in meta_keys or k in input_keys:
            params_json[k] = v
        else:
            results_json[k] = v

    return {
        "params_json": params_json,
        "results_json": results_json,
        "deals_json": deals
    }




