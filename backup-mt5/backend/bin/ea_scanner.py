#!/usr/bin/env python3
"""
ea_scanner.py â€“ Scan MT5 terminals for EA bots (.chr) vs target templates (.tpl).

Outputs a single JSON document to stdout when run with --json (default for Node.js).

Requirements:
    pip install psutil
"""

from __future__ import annotations

import argparse
import json
import os
import hashlib
import platform
import re
import socket
import sys

try:
    import psutil
except ImportError:
    sys.stderr.write("[ea_scanner] ERROR: psutil not installed. Run: pip install psutil\n")
    sys.exit(1)


DEBUG_CHR_SCAN = False
MT5_TERMINAL_PROCESS_NAMES = {"terminal.exe", "terminal64.exe"}
MACHINE_ID_CACHE_FILE = os.path.join(os.path.expanduser("~"), ".mt5-monitor", "machine-id")
LIVE_SNAPSHOT_FILE_NAME = "ea_scanner_live.json"
LIVE_SNAPSHOT_MAX_AGE_SECONDS = 30 * 60

def read_text_any_encoding(path: str) -> str:
    for encoding in ("utf-16", "utf-8", "utf-8-sig", "cp1258"):
        try:
            with open(path, "r", encoding=encoding, errors="ignore") as f:
                return f.read()
        except Exception:
            continue
    return ""


def inspect_live_snapshot(terminal_path: str) -> dict:
    snapshot_path = os.path.join(terminal_path, "MQL5", "Files", LIVE_SNAPSHOT_FILE_NAME)
    try:
        if not os.path.isfile(snapshot_path):
            return {"snapshot": None, "status": "MISSING", "age_seconds": None}
        content = read_text_any_encoding(snapshot_path)
        snapshot = json.loads(content) if content else None
        charts = snapshot.get("charts") if isinstance(snapshot, dict) else None
        if not isinstance(charts, list):
            return {"snapshot": None, "status": "INVALID", "age_seconds": None}
        file_age_seconds = max(0, int(__import__("time").time() - os.path.getmtime(snapshot_path)))
        if file_age_seconds > LIVE_SNAPSHOT_MAX_AGE_SECONDS:
            return {"snapshot": None, "status": "STALE", "age_seconds": file_age_seconds}
        return {"snapshot": snapshot, "status": "FRESH", "age_seconds": file_age_seconds}
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return {"snapshot": None, "status": "UNREADABLE", "age_seconds": None}


def read_live_snapshot(terminal_path: str) -> dict | None:
    return inspect_live_snapshot(terminal_path)["snapshot"]

def normalize_live_timeframe(value: object) -> str:
    timeframe = str(value or "").strip().upper()
    if timeframe.startswith("PERIOD_"):
        timeframe = timeframe[7:]
    return timeframe


def live_chart_matches_parsed(chart: dict, parsed: dict) -> bool:
    live_chart_id = str(chart.get("chart_id") or "").strip()
    parsed_chart_id = str(parsed.get("chart_id") or "").strip()
    if live_chart_id or parsed_chart_id:
        return bool(live_chart_id and parsed_chart_id and live_chart_id == parsed_chart_id)

    expert_name = str(chart.get("expert_name") or "").strip()
    symbol = str(chart.get("symbol") or "").strip().upper()
    timeframe = normalize_live_timeframe(chart.get("timeframe"))
    return (
        expert_name == parsed.get("name")
        and symbol == parsed.get("symbol")
        and timeframe == str(parsed.get("timeframe") or "").upper()
    )


def parse_input_value(value_str: str):
    s = value_str.strip()
    if re.match(r"^(true|false)$", s, re.IGNORECASE):
        return s.lower() == "true"
    try:
        if re.match(r"^-?\d+\.\d+$", s) or ("." in s and re.match(r"^-?\d+\.\d*([eE][+-]?\d+)?$", s)):
            return float(s)
        if re.match(r"^-?\d+$", s):
            return int(s)
    except Exception:
        pass
    return s


def parse_selected_timeframe(value_str: str) -> str:
    try:
        val = int(value_str)
        tf_map = {
            1: "M1",
            5: "M5",
            15: "M15",
            30: "M30",
            16385: "H1",
            16388: "H4",
            16408: "D1",
            32769: "W1",
            49153: "MN",
        }
        return tf_map.get(val, f"M{val}")
    except Exception:
        return "UNKNOWN"


def get_pc_name() -> str:
    return (os.environ.get("COMPUTERNAME") or socket.gethostname() or "UNKNOWN").strip()


def generate_hardware_based_id() -> str:
    primary_mac = ""
    try:
        for _, addrs in psutil.net_if_addrs().items():
            for addr in addrs:
                mac = getattr(addr, "address", "") or ""
                if re.match(r"^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$", mac) and mac != "00:00:00:00:00:00":
                    primary_mac = mac
                    break
            if primary_mac:
                break
    except Exception:
        pass

    if not primary_mac:
        primary_mac = "no-mac-found"

    hostname = socket.gethostname() or "unknown-host"
    platform_name = sys.platform
    arch = platform.machine() or "unknown-arch"
    cpu_model = platform.processor() or platform.uname().processor or "unknown-cpu"

    raw = f"{primary_mac}|{hostname}|{platform_name}|{arch}|{cpu_model}"
    hex_id = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"MT5-{hex_id[0:4]}-{hex_id[4:8]}-{hex_id[8:12]}-{hex_id[12:16]}"


def load_or_create_machine_id(provided: str | None = None) -> str:
    if provided:
        return provided.strip()

    try:
        if os.path.exists(MACHINE_ID_CACHE_FILE):
            with open(MACHINE_ID_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = f.read().strip()
            if cached:
                return cached
    except Exception:
        pass

    machine_id = generate_hardware_based_id()
    try:
        os.makedirs(os.path.dirname(MACHINE_ID_CACHE_FILE), exist_ok=True)
        with open(MACHINE_ID_CACHE_FILE, "w", encoding="utf-8") as f:
            f.write(machine_id)
    except Exception:
        pass
    return machine_id


def get_mt5_account_info(terminal_path: str) -> tuple[str, str]:
    ini_path = os.path.join(terminal_path, "config", "common.ini")
    account, server = "UNKNOWN", "UNKNOWN"
    if os.path.exists(ini_path):
        try:
            content = read_text_any_encoding(ini_path)
            if content:
                login_match = re.search(r"Login=(\d+)", content, re.IGNORECASE)
                server_match = re.search(r"Server=(.+)", content, re.IGNORECASE)
                if login_match:
                    account = login_match.group(1)
                if server_match:
                    server = server_match.group(1).strip()
        except Exception:
            pass
    return account, server


def extract_expert_block(content: str) -> str:
    match = re.search(r"(?is)<expert>(.*?)</expert>", content)
    if match:
        return match.group(1)

    match = re.search(r"(?is)<expert>(.*)", content)
    if not match:
        return ""
    return match.group(1)


def parse_expert_inputs(content: str) -> dict:
    inputs: dict = {}
    match = re.search(r"(?is)<inputs>(.*?)</inputs>", content)
    block = match.group(1) if match else extract_expert_block(content)

    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("<"):
            continue

        eq = line.find("=")
        if eq <= 0:
            continue

        key = line[:eq].strip()
        value = line[eq + 1 :].strip()
        if key:
            inputs[key] = parse_input_value(value)

    return inputs


def parse_chr_snapshot(chr_path: str) -> dict | None:
    content = read_text_any_encoding(chr_path)
    if not content or "<expert>" not in content.lower():
        return None

    symbol_match = re.search(r"(?im)^symbol=(.+)$", content)
    ea_name_match = re.search(r"(?im)^name=(.+)$", content)
    if not symbol_match or not ea_name_match:
        return None

    ea_full_name = ea_name_match.group(1).strip()
    chart_id_match = re.search(r"(?im)^id=(\d+)\s*$", content)
    chart_id = chart_id_match.group(1) if chart_id_match else ""
    ea_path_match = re.search(r"(?im)^path=(.+)$", extract_expert_block(content))
    ea_path = ea_path_match.group(1).strip() if ea_path_match else ""
    symbol_str = symbol_match.group(1).strip().upper()

    id_match = re.match(r"^(\d+)", ea_full_name)
    bot_id = id_match.group(1) if id_match else ea_full_name
    inputs = parse_expert_inputs(content)
    expertmode_raw = None
    expertmode_match = re.search(r"(?im)^expertmode=(\d+)\s*$", content)
    if expertmode_match:
        try:
            expertmode_raw = int(expertmode_match.group(1))
        except Exception:
            expertmode_raw = None
    else:
        maybe_expertmode = inputs.get("expertmode", inputs.get("ExpertMode"))
        if isinstance(maybe_expertmode, int):
            expertmode_raw = int(maybe_expertmode)

    algotrading = bool(expertmode_raw % 2 == 1) if isinstance(expertmode_raw, int) else False

    accept_buy = inputs.get("AcceptBuy")
    accept_sell = inputs.get("AcceptSell")
    if accept_buy is None:
        m = re.search(r"AcceptBuy=(true|false)", content, re.IGNORECASE)
        accept_buy = m.group(1).lower() == "true" if m else False
    if accept_sell is None:
        m = re.search(r"AcceptSell=(true|false)", content, re.IGNORECASE)
        accept_sell = m.group(1).lower() == "true" if m else False

    is_buy = bool(accept_buy)
    is_sell = bool(accept_sell)

    active_side = "UNKNOWN"
    errors: list[str] = []
    if is_buy and is_sell:
        errors.append(f"Bot {bot_id} ({symbol_str}) is enabling both Buy and Sell")
    elif not is_buy and not is_sell:
        errors.append(f"Bot {bot_id} ({symbol_str}) has both Buy and Sell disabled")
    elif is_buy and not is_sell:
        active_side = "OB"
    elif not is_buy and is_sell:
        active_side = "OS"

    tf_match = None
    for suffix in ("", "1", "2", "3"):
        tf_match = re.search(rf"SelectedTimeframe{suffix}=(\d+)", content, re.IGNORECASE)
        if tf_match:
            break

    active_tf = "UNKNOWN"
    if tf_match:
        active_tf = parse_selected_timeframe(tf_match.group(1))
    else:
        sel = inputs.get("SelectedTimeframe")
        if isinstance(sel, int):
            active_tf = parse_selected_timeframe(str(sel))
        else:
            errors.append(f"Bot {bot_id} ({symbol_str}) is missing SelectedTimeframe input")

    magic_raw = inputs.pop("Magic", inputs.pop("magic", inputs.pop("MagicNumber", "")))
    lot_threshold_raw = inputs.pop(
        "lot_threshold",
        inputs.pop("LotThreshold", inputs.pop("lotThreshold", 0.0)),
    )
    risk_money_raw = inputs.pop(
        "risk_money",
        inputs.pop("RiskMoney", inputs.pop("riskMoney", 0.0)),
    )

    try:
        lot_threshold = float(lot_threshold_raw)
    except (TypeError, ValueError):
        lot_threshold = 0.0

    try:
        risk_money = float(risk_money_raw)
    except (TypeError, ValueError):
        risk_money = 0.0

    return {
        "id": bot_id,
        "chart_id": chart_id,
        "name": ea_full_name,
        "expert_path": ea_path,
        "symbol": symbol_str,
        "timeframe": str(active_tf).upper(),
        "side": active_side,
        "magic": str(magic_raw).strip() if magic_raw is not None else "",
        "lot_threshold": lot_threshold,
        "risk_money": risk_money,
        "status": "ACTIVE",
        "expertmode": expertmode_raw,
        "algotrading": algotrading,
        "inputs": inputs,
        "errors": errors,
        "chr_file": os.path.basename(chr_path),
    }


def collect_target_templates(terminal_path: str, group_key: str) -> list[dict]:
    tpl_list: list[dict] = []
    tpl_folder = os.path.join(terminal_path, "MQL5", "Files")

    if not os.path.exists(tpl_folder):
        return tpl_list

    for file_name in os.listdir(tpl_folder):
        if not file_name.lower().endswith(".tpl"):
            continue

        name_without_ext = file_name[:-4].strip()
        match = re.match(
            r"^(\d+)(.*?)([HMDWwmdh]\d+|MN|mn)(OB|OS|ob|os)$",
            name_without_ext,
            re.IGNORECASE,
        )
        if not match:
            tpl_list.append(
                {
                    "id": name_without_ext,
                    "symbol": "",
                    "timeframe": "",
                    "side": "",
                    "group_key": group_key,
                    "file_name": file_name,
                    "is_valid_pattern": False,
                }
            )
            continue

        tpl_list.append(
            {
                "id": match.group(1),
                "symbol": match.group(2).strip("_- ").upper(),
                "timeframe": match.group(3).upper(),
                "side": match.group(4).upper(),
                "group_key": group_key,
                "file_name": file_name,
                "is_valid_pattern": True,
            }
        )

    return tpl_list


def collect_chr_state(terminal_path: str, group_key: str) -> tuple[list[dict], list[dict], list[str]]:
    active_list: list[dict] = []
    bot_records: list[dict] = []
    chart_config_errors: list[str] = []
    live_snapshot = read_live_snapshot(terminal_path)
    charts_folder = os.path.join(terminal_path, "MQL5", "Profiles", "Charts", "Default")

    if not os.path.isdir(charts_folder):
        if DEBUG_CHR_SCAN:
            print(f"   [debug] charts folder missing: {charts_folder}", file=sys.stderr)
        if live_snapshot is None:
            return active_list, bot_records, chart_config_errors

    chr_files = (
        [f for f in os.listdir(charts_folder) if f.lower().endswith(".chr")]
        if os.path.isdir(charts_folder)
        else []
    )

    if DEBUG_CHR_SCAN:
        print(f"   [debug] chr count: {len(chr_files)}", file=sys.stderr)

    for file_name in chr_files:
        chr_path = os.path.join(charts_folder, file_name)
        parsed = parse_chr_snapshot(chr_path)
        if not parsed:
            if DEBUG_CHR_SCAN:
                print(f"   [debug] ignored non-bot chr: {file_name}", file=sys.stderr)
            continue

        if DEBUG_CHR_SCAN:
            print(
                f"   [debug] parsed chr => id={parsed['id']} symbol={parsed['symbol']} "
                f"tf={parsed['timeframe']} side={parsed['side']} ({file_name})",
                file=sys.stderr,
            )

        # Helper/system EAs are still returned in bot_records for API sync,
        # but they are excluded from TPL-vs-CHR validation.
        bot_records.append(parsed)

    if live_snapshot is None:
        for parsed in bot_records:
            if not re.match(r"^\d+", parsed["name"]):
                continue
            active_list.append(
                {
                    "id": parsed["id"],
                    "symbol": parsed["symbol"],
                    "timeframe": parsed["timeframe"],
                    "side": parsed["side"],
                    "group_key": group_key,
                    "chr_file": parsed["chr_file"],
                }
            )
            chart_config_errors.extend(parsed["errors"])
        return active_list, bot_records, chart_config_errors

    live_charts = [
        chart for chart in live_snapshot.get("charts", [])
        if isinstance(chart, dict) and str(chart.get("expert_name") or "").strip()
    ]
    resolved_chr_by_chart: list[dict | None] = []
    used_chr_indexes: set[int] = set()
    for chart in live_charts:
        candidates = [
            (index, parsed)
            for index, parsed in enumerate(bot_records)
            if index not in used_chr_indexes and live_chart_matches_parsed(chart, parsed)
        ]
        if len(candidates) == 1:
            index, parsed = candidates[0]
            used_chr_indexes.add(index)
            resolved_chr_by_chart.append(parsed)
        else:
            resolved_chr_by_chart.append(None)

    live_bot_records = [parsed for parsed in resolved_chr_by_chart if parsed is not None]
    for parsed in live_bot_records:
        if re.match(r"^\d+", parsed["name"]):
            chart_config_errors.extend(parsed["errors"])

    # The service is authoritative for chart presence. CHR data is used only
    # to enrich the live chart with input-derived fields such as side and id.
    for chart_index, chart in enumerate(live_charts):
        expert_name = str(chart.get("expert_name") or "").strip()
        if not re.match(r"^\d+", expert_name):
            continue

        symbol = str(chart.get("symbol") or "").strip().upper()
        timeframe = normalize_live_timeframe(chart.get("timeframe"))
        parsed = resolved_chr_by_chart[chart_index]
        if parsed:
            active_list.append(
                {
                    "id": parsed["id"],
                    "symbol": parsed["symbol"],
                    "timeframe": parsed["timeframe"],
                    "side": parsed["side"],
                    "group_key": group_key,
                    "chr_file": parsed["chr_file"],
                }
            )
            continue

        id_match = re.match(r"^(\d+)", expert_name)
        active_list.append(
            {
                "id": id_match.group(1) if id_match else expert_name,
                "symbol": symbol,
                "timeframe": timeframe,
                "side": "",
                "group_key": group_key,
                "chr_file": "",
            }
        )
        if DEBUG_CHR_SCAN:
            print(
                f"   [debug] live chart has no matching chr details => "
                f"name={expert_name} symbol={symbol} tf={timeframe}",
                file=sys.stderr,
            )

    return active_list, live_bot_records, chart_config_errors


def describe_terminal_path(terminal_root: str) -> dict:
    """Build stable display metadata from a user-selected terminal folder."""
    normalized = os.path.normpath(terminal_root)
    parts = [part for part in re.split(r"[\\/]", normalized) if part]
    terminal_name = os.path.basename(normalized)
    cluster = "UNKNOWN"
    user_name = "UNKNOWN"

    # Infer the Windows profile owner from the path structure. Cluster and
    # terminal names are user-defined and must not follow a naming convention.
    for index, part in enumerate(parts[:-1]):
        if part.lower() in {"users", "user"} and index + 1 < len(parts):
            user_name = parts[index + 1]
            break

    # A directly selected terminal can belong to an arbitrarily named parent
    # cluster. Avoid treating common profile folders as cluster names.
    parent_name = os.path.basename(os.path.dirname(normalized))
    if parent_name.lower() not in {"desktop", "documents", "downloads", "users", "user"}:
        cluster = parent_name or cluster

    return {
        "user": user_name,
        "cluster": cluster,
        "terminal": terminal_name,
        "symbol_folder": cluster,
        "terminal_name": terminal_name,
        "path": normalized,
    }


def is_terminal_data_folder(folder_path: str) -> bool:
    try:
        child_names = {entry.name.lower() for entry in os.scandir(folder_path)}
    except OSError:
        return False
    return "config" in child_names and "mql5" in child_names


def expand_selected_path(raw_path: str) -> list[str]:
    selected_root = os.path.abspath(os.path.expanduser(str(raw_path).strip()))
    if not os.path.isdir(selected_root):
        return []
    if is_terminal_data_folder(selected_root):
        return [selected_root]

    # A non-terminal selection is valid only when it directly contains
    # terminal data folders. Deeper arbitrary selections are ignored.
    discovered: list[str] = []
    try:
        for entry in os.scandir(selected_root):
            if entry.is_dir() and is_terminal_data_folder(entry.path):
                discovered.append(os.path.abspath(entry.path))
    except OSError:
        return []
    return discovered


def collect_selected_terminals(selected_paths: list[str]) -> list[dict]:
    terminals: list[dict] = []
    seen_paths: set[str] = set()
    for raw_path in selected_paths:
        selected_root = os.path.abspath(os.path.expanduser(str(raw_path).strip()))
        selected_is_terminal = is_terminal_data_folder(selected_root)
        cluster_name = os.path.basename(os.path.normpath(selected_root)) if not selected_is_terminal else ""
        for terminal_root in expand_selected_path(selected_root):
            key = os.path.normcase(os.path.normpath(terminal_root))
            if key in seen_paths:
                continue
            term = describe_terminal_path(terminal_root)
            if cluster_name:
                # The selected parent defines the cluster; its name may be
                # arbitrary and does not need to follow a convention.
                term["cluster"] = cluster_name
                term["symbol_folder"] = cluster_name
            acc_num, srv_name = get_mt5_account_info(terminal_root)
            term["account"] = acc_num
            term["server"] = srv_name
            terminals.append(term)
            seen_paths.add(key)
    return terminals


def collect_active_terminals() -> list[dict]:
    active_terminals: list[dict] = []
    seen_paths: set[str] = set()

    for proc in psutil.process_iter(["name", "exe"]):
        try:
            process_name = (proc.info["name"] or "").lower()
            if process_name not in MT5_TERMINAL_PROCESS_NAMES:
                continue

            exe_path = proc.info["exe"]
            if not exe_path:
                continue

            terminal_root = os.path.dirname(exe_path)
            if terminal_root in seen_paths:
                continue

            term = describe_terminal_path(terminal_root)
            acc_num, srv_name = get_mt5_account_info(terminal_root)
            term["account"] = acc_num
            term["server"] = srv_name
            active_terminals.append(term)
            seen_paths.add(terminal_root)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return active_terminals


def collect_running_terminal_paths() -> set[str]:
    running_paths: set[str] = set()
    for proc in psutil.process_iter(["name", "exe"]):
        try:
            process_name = (proc.info["name"] or "").lower()
            if process_name not in MT5_TERMINAL_PROCESS_NAMES:
                continue
            exe_path = proc.info["exe"]
            if exe_path:
                running_paths.add(os.path.normcase(os.path.normpath(os.path.dirname(exe_path))))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return running_paths


def build_group_key(term: dict) -> str:
    return (
        f"{term['user']} -> {term['symbol_folder']} -> {term['terminal_name']} "
        f"(Acc: {term['account']} | {term['server']})"
    )


def build_bot_api_record(pc_name: str, machine_id: str, term: dict, parsed: dict) -> dict:
    bot_type = "EA" if re.match(r"^\d+", parsed["name"]) else "HELPER"
    identity_key = (
        f"EA:{term['account']}:{parsed['magic']}"
        if bot_type == "EA"
        else f"HELPER:{term['account']}:{machine_id}:{term['terminal']}:{parsed['id']}"
    )
    return {
        "pc_name": pc_name,
        "machine_id": machine_id,
        "user": term["user"],
        "cluster": term["cluster"],
        "terminal": term["terminal"],
        "account": term["account"],
        "server": term["server"],
        "terminal_path": term["path"],
        "terminal_group_key": build_group_key(term),
        "bot_id": parsed["id"],
        "chart_id": parsed.get("chart_id", ""),
        "bot_type": bot_type,
        "identity_key": identity_key,
        "name": parsed["name"],
        "expert_path": parsed["expert_path"],
        "magic": parsed["magic"],
        "lot_threshold": parsed["lot_threshold"],
        "risk_money": parsed["risk_money"],
        "status": parsed["status"],
        "expertmode": parsed["expertmode"],
        "algotrading": parsed["algotrading"],
        "symbol": parsed["symbol"],
        "tf": parsed["timeframe"],
        "side": parsed["side"],
        "inputs": parsed["inputs"],
    }


def run_scan(selected_paths: list[str] | None = None) -> dict:
    pc_name = get_pc_name()
    machine_id = load_or_create_machine_id(os.environ.get("EA_SCANNER_MACHINE_ID"))
    total_tpl_list: list[dict] = []
    total_active_list: list[dict] = []
    all_bots: list[dict] = []
    offline_terminals: list[dict] = []
    if selected_paths is not None:
        selected_terminals = collect_selected_terminals(selected_paths)
        running_paths = collect_running_terminal_paths()
        active_terminals = []
        for term in selected_terminals:
            terminal_key = os.path.normcase(os.path.normpath(term["path"]))
            if terminal_key in running_paths:
                active_terminals.append(term)
            else:
                offline_terminals.append(term)
    else:
        active_terminals = collect_active_terminals()
    chart_config_errors: dict[str, list[str]] = {}
    terminal_reports: list[dict] = []

    if not active_terminals:
        offline_details = ", ".join(
            f"{term.get('terminal', 'Unknown')} [{term.get('path', '')}]"
            for term in offline_terminals
        )
        return {
            "pc_name": pc_name,
            "machine_id": machine_id,
            "timestamp": int(__import__("time").time() * 1000),
            "active_terminal_count": 0,
            "message": (
                f"Skipped {len(offline_terminals)} stopped terminal(s): {offline_details}; "
                "no running selected terminals were found."
                if offline_terminals
                else "No selected MT5 terminal folders were found." if selected_paths is not None else "No active MT5 terminals found."
            ),
            "terminals": [],
            "offline_terminals": offline_terminals,
            "bots": [],
            "summary": {
                "total_tpl": 0,
                "total_active": 0,
                "total_missing": 0,
                "total_errors": 0,
            },
        }

    for term in active_terminals:
        path = term["path"]
        group_key = build_group_key(term)
        chart_config_errors[group_key] = []

        tpl_for_term = collect_target_templates(path, group_key)
        total_tpl_list.extend(tpl_for_term)

        chr_list, bot_records, chr_errors = collect_chr_state(path, group_key)
        total_active_list.extend(chr_list)
        chart_config_errors[group_key].extend(chr_errors)
        live_state = inspect_live_snapshot(path)
        live_snapshot = live_state["snapshot"]

        for parsed in bot_records:
            all_bots.append(build_bot_api_record(pc_name, machine_id, term, parsed))

        terminal_reports.append(
            {
                "user": term["user"],
                "cluster": term["cluster"],
                "terminal": term["terminal"],
                "account": term["account"],
                "server": term["server"],
                "terminal_path": term["path"],
                "terminal_group_key": build_group_key(term),
                "machine_id": machine_id,
                "group_key": group_key,
                "path": path,
                "tpl_count": len(tpl_for_term),
                "active_count": len(chr_list),
                "algotrading": (
                    live_snapshot.get("algotrading")
                    if live_snapshot is not None
                    else None
                ),
                "live_snapshot": live_snapshot is not None,
                "realtime_source": "SERVICE" if live_snapshot is not None else "CHR_FALLBACK",
                "snapshot_status": live_state["status"],
                "snapshot_age_seconds": live_state["age_seconds"],
                "chart_config_errors": list(chr_errors),
            }
        )

    missing_raw_list: list[dict] = []
    active_used = [False] * len(total_active_list)

    for tpl in total_tpl_list:
        if not tpl.get("is_valid_pattern"):
            missing_raw_list.append(tpl)
            continue

        found = False
        for idx, active in enumerate(total_active_list):
            if active_used[idx]:
                continue
            if (
                tpl["id"] == active["id"]
                and tpl["symbol"] == active["symbol"]
                and tpl["timeframe"] == active["timeframe"]
                and tpl["side"] == active["side"]
                and tpl["group_key"] == active["group_key"]
            ):
                found = True
                active_used[idx] = True
                break

        if not found:
            missing_raw_list.append(tpl)

    extra_active: list[dict] = []
    for idx, active in enumerate(total_active_list):
        if not active_used[idx]:
            extra_active.append(active)

    for report in terminal_reports:
        location = report["group_key"]
        terminal_missing = [b for b in missing_raw_list if b["group_key"] == location and b.get("is_valid_pattern")]
        wrong_pattern = [b for b in missing_raw_list if b["group_key"] == location and not b.get("is_valid_pattern")]
        errors_on_chart = chart_config_errors.get(location, [])

        report["missing_tpl_files"] = [b["file_name"] for b in terminal_missing]
        report["wrong_pattern_files"] = [b["file_name"] for b in wrong_pattern]
        report["extra_chr_bots"] = [
            f"{b['id']}{b['symbol']}{b['timeframe']}{b['side']} ({b.get('chr_file', '')})"
            for b in extra_active
            if b["group_key"] == location
        ]
        report["status"] = (
            "ok"
            if (
                not terminal_missing
                and not wrong_pattern
                and not errors_on_chart
                and not report["extra_chr_bots"]
            )
            else "error"
        )

    total_errors = sum(len(r.get("chart_config_errors", [])) for r in terminal_reports)
    total_missing = sum(len(r.get("missing_tpl_files", [])) for r in terminal_reports)

    offline_details = ", ".join(
        f"{term.get('terminal', 'Unknown')} [{term.get('path', '')}]"
        for term in offline_terminals
    )

    return {
        "pc_name": pc_name,
        "machine_id": machine_id,
        "timestamp": int(__import__("time").time() * 1000),
        "active_terminal_count": len(active_terminals),
        "offline_terminals": offline_terminals,
        "message": (
            f"Skipped {len(offline_terminals)} stopped terminal(s): {offline_details}."
            if offline_terminals else None
        ),
        "terminals": terminal_reports,
        "bots": all_bots,
        "summary": {
            "total_tpl": len(total_tpl_list),
            "total_active": len(total_active_list),
            "total_missing": total_missing,
            "total_errors": total_errors,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="EA Scanner â€“ MT5 bot template vs chart audit")
    parser.add_argument("--json", action="store_true", default=True, help="Output JSON to stdout (default)")
    parser.add_argument("--debug", action="store_true", help="Enable CHR debug logging on stderr")
    parser.add_argument("--path", action="append", dest="paths", default=[], help="MT5 terminal data folder; may be repeated")
    args = parser.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    global DEBUG_CHR_SCAN
    if args.debug:
        DEBUG_CHR_SCAN = True

    # An empty selection means "scan nothing". Do not discover every running
    # MT5 terminal when the user has not selected any folders.
    result = run_scan(args.paths)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

