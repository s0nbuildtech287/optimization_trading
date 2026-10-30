"""Read MT5 history through the MetaTrader5 Python package and upload it.

This process is intentionally separate from worker.mq5.  WebRequest calls in
an EA block MT5's event loop; this process can upload large history batches
without blocking the worker's socket heartbeats.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import MetaTrader5 as mt5
except ImportError as exc:  # pragma: no cover - depends on the host machine
    mt5 = None


LOG = logging.getLogger("mt5-history-sync")
DEAL_ENTRY_IN = 0
DEAL_ENTRY_OUT = 1
DEAL_ENTRY_INOUT = 2
DEAL_ENTRY_OUT_BY = 3


def as_dict(value: Any) -> dict[str, Any]:
    return value._asdict() if hasattr(value, "_asdict") else dict(value)


def ms(value: Any) -> int:
    return int(value or 0)


def iso_time_msc(value: Any) -> str | None:
    timestamp_ms = ms(value)
    if timestamp_ms <= 0:
        return None
    return datetime.fromtimestamp(timestamp_ms / 1000, timezone.utc).isoformat(timespec="milliseconds")


DEAL_TYPES = {
    0: "BUY", 1: "SELL", 2: "BALANCE", 3: "CREDIT", 4: "CHARGE",
    5: "CORRECTION", 6: "BONUS", 7: "COMMISSION", 8: "COMMISSION_DAILY",
    9: "COMMISSION_MONTHLY", 10: "COMMISSION_AGENT_DAILY",
    11: "COMMISSION_AGENT_MONTHLY", 12: "INTEREST", 13: "BUY_CANCELED",
    14: "SELL_CANCELED", 15: "DIVIDEND", 16: "DIVIDEND_FRANKED", 17: "TAX",
}

def mt5_type(value: Any, mapping: dict[int, str]) -> str:
    number = int(value or 0)
    return mapping.get(number, str(number))


DEAL_ENTRIES = {0: "IN", 1: "OUT", 2: "INOUT", 3: "OUT_BY"}


def deal_entry(value: Any) -> str:
    number = int(value or 0)
    return DEAL_ENTRIES.get(number, str(number))


def calculate_balance_at_time(
    deals: list[dict[str, Any]],
    current_balance: float,
    target_time_msc: int,
    target_ticket: int = 0,
) -> float:
    """Match worker.mq5 CalculateBalanceAtTimeMsc()."""
    balance = float(current_balance)
    for deal in deals:
        deal_time = ms(deal.get("time_msc"))
        deal_ticket = int(deal.get("ticket", 0))
        if deal_time < target_time_msc:
            continue
        if deal_time == target_time_msc and deal_ticket <= target_ticket:
            continue
        balance -= (
            float(deal.get("profit", 0))
            + float(deal.get("commission", 0))
            + float(deal.get("swap", 0))
        )
    return balance


def resolve_deal_sl_tp(
    deal: dict[str, Any],
    all_deals: list[dict[str, Any]],
    orders_by_ticket: dict[int, dict[str, Any]],
) -> tuple[float, float]:
    """Match worker.mq5 ResolveDealSlTp(). Orders are lookup-only; not uploaded."""
    order_ticket = int(deal.get("order", 0) or 0)
    order = orders_by_ticket.get(order_ticket)
    if order:
        sl = float(order.get("sl", 0) or 0)
        tp = float(order.get("tp", 0) or 0)
        if sl != 0 or tp != 0:
            return sl, tp

    position_id = int(deal.get("position_id", 0) or 0)
    if position_id == 0:
        return 0.0, 0.0

    for candidate in all_deals:
        if int(candidate.get("position_id", 0) or 0) != position_id:
            continue
        if int(candidate.get("entry", -1)) not in (DEAL_ENTRY_IN, DEAL_ENTRY_INOUT):
            continue
        candidate_order = orders_by_ticket.get(int(candidate.get("order", 0) or 0))
        if not candidate_order:
            continue
        sl = float(candidate_order.get("sl", 0) or 0)
        tp = float(candidate_order.get("tp", 0) or 0)
        if sl != 0 or tp != 0:
            return sl, tp

    return 0.0, 0.0


def cursor_after(item: dict[str, Any], time_key: str, ticket_key: str, state: dict[str, Any]) -> bool:
    item_time = ms(item.get(time_key))
    item_ticket = int(item.get(ticket_key) or 0)
    return (item_time, item_ticket) > (ms(state.get(time_key)), int(state.get(ticket_key) or 0))


def chunked(items: list[dict[str, Any]], size: int = 50):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def post_json(url: str, payload: dict[str, Any], agent_api_key: str = "") -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        # Cloudflare Browser Integrity Check may reject urllib's default
        # Python-urllib user agent before the request reaches Express.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 MT5HistorySync/1.0",
    }
    # History endpoints are intentionally public for EA/Python ingestion.
    # If a reverse proxy is configured to require the system-monitor agent
    # key, use its dedicated header. Do not send the MT5 trading api_key as
    # X-API-Key: that is not the authentication scheme used by this API.
    if agent_api_key:
        headers["X-Agent-API-Key"] = agent_api_key
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    retryable_codes = {429, 502, 503, 504, 530}
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"HTTP {response.status} from {url}")
            return
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace").strip()
            retry_after = 0
            # Prefer the server's Retry-After value, including Cloudflare's
            # JSON retry_after field when the header is absent.
            try:
                retry_after = int(exc.headers.get("Retry-After", "0") or 0)
            except (TypeError, ValueError):
                retry_after = 0
            try:
                parsed = json.loads(response_body)
                if isinstance(parsed, dict):
                    retry_after = retry_after or int(parsed.get("retry_after", 0) or 0)
                    server_error = parsed.get("error")
                    if isinstance(server_error, str) and server_error:
                        response_body = server_error
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

            if exc.code in retryable_codes and attempt < 3:
                delay = min(max(retry_after, 10), 120)
                LOG.warning(
                    "HTTP %s from %s; retry %d/2 after %ss",
                    exc.code, url, attempt, delay,
                )
                time.sleep(delay)
                continue

            # Keep the useful tail for long SQL error responses.
            if len(response_body) > 1800:
                response_body = "..." + response_body[-1800:]
            detail = f": {response_body}" if response_body else ""
            raise RuntimeError(f"HTTP {exc.code} from {url}{detail}") from exc


def send_records(account: dict[str, Any], data_type: str, records: list[dict[str, Any]], url: str) -> None:
    if not records:
        return
    monitor_id = account.get("monitor_id") or f"{account['account_number']}_PythonHistory"
    batch_id = f"{monitor_id}_{data_type}_{int(time.time() * 1000)}"
    batches = list(chunked(records))
    for index, batch in enumerate(batches, 1):
        payload = {
            "monitor_id": monitor_id,
            "account_number": int(account["account_number"]),
            "symbol": account.get("symbol", ""),
            "data_type": data_type,
            "batch_id": batch_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": batch,
        }
        post_json(url, payload, str(account.get("agent_api_key", "")))
        LOG.info("account=%s type=%s chunk=%d/%d records=%d", account["account_number"], data_type, index, len(batches), len(batch))


def deal_record(
    deal: dict[str, Any],
    account_number: int,
    balance: float,
    sl: float,
    tp: float,
) -> dict[str, Any]:
    return {
        "deal_ticket": int(deal.get("ticket", 0)),
        "position_id": int(deal.get("position_id", 0)),
        "account_number": account_number,
        "symbol": deal.get("symbol", ""),
        "type": mt5_type(deal.get("type", 0), DEAL_TYPES),
        "entry": deal_entry(deal.get("entry", 0)),
        "volume": float(deal.get("volume", 0)),
        "price": float(deal.get("price", 0)),
        "sl": sl,
        "tp": tp,
        "profit": float(deal.get("profit", 0)),
        "commission": float(deal.get("commission", 0)),
        "swap": float(deal.get("swap", 0)),
        "balance": balance,
        "time": iso_time_msc(deal.get("time_msc")),
        "comment": deal.get("comment", ""),
    }


def closed_position(
    position_deals: list[dict[str, Any]],
    all_deals: list[dict[str, Any]],
    account_number: int,
    current_balance: float,
    sl: float,
    tp: float,
) -> dict[str, Any] | None:
    entries = [d for d in position_deals if int(d.get("entry", -1)) in (DEAL_ENTRY_IN, DEAL_ENTRY_INOUT)]
    # MT5 also reports CLOSE-BY exits as DEAL_ENTRY_OUT_BY. The EA worker
    # includes these as closed trades; omitting them loses valid positions.
    exits = [d for d in position_deals if int(d.get("entry", -1)) in (DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY, DEAL_ENTRY_INOUT)]
    if not entries or not exits:
        return None
    entry_volume = sum(float(d.get("volume", 0)) for d in entries)
    exit_volume = sum(float(d.get("volume", 0)) for d in exits)
    if abs(entry_volume - exit_volume) > 1e-8:
        return None
    last_exit = max(exits, key=lambda d: (ms(d.get("time_msc")), int(d.get("ticket", 0))))
    first_entry = min(entries, key=lambda d: (ms(d.get("time_msc")), int(d.get("ticket", 0))))
    entry_type = int(first_entry.get("type", 0))
    entry_price = float(first_entry.get("price", 0))
    exit_price = float(last_exit.get("price", 0))
    change = 0.0
    if entry_price > 0:
        raw_change = ((entry_price - exit_price) if entry_type == 1 else (exit_price - entry_price))
        change = (raw_change / entry_price) * 100.0
    market_value = (1.0 if entry_type == 0 else -1.0) * exit_price * exit_volume
    return {
        "position_id": int(last_exit.get("position_id", 0)),
        "entry_deal_ticket": int(first_entry.get("ticket", 0)),
        "exit_deal_ticket": int(last_exit.get("ticket", 0)),
        "account_number": account_number,
        "symbol": last_exit.get("symbol", ""),
        "type": "BUY" if entry_type == 0 else "SELL",
        "volume": exit_volume,
        "entry_price": entry_price,
        "exit_price": exit_price,
        "sl": sl,
        "tp": tp,
        "magic": int(first_entry.get("magic", 0) or 0),
        "change": change,
        "market_value": market_value,
        "profit": sum(float(d.get("profit", 0)) for d in position_deals),
        "commission": sum(float(d.get("commission", 0)) for d in position_deals),
        "swap": sum(float(d.get("swap", 0)) for d in position_deals),
        "net_profit": sum(float(d.get("profit", 0)) + float(d.get("commission", 0)) + float(d.get("swap", 0)) for d in position_deals),
        "balance": calculate_balance_at_time(
            all_deals,
            current_balance,
            ms(last_exit.get("time_msc")),
            int(last_exit.get("ticket", 0)),
        ),
        "entry_time": iso_time_msc(first_entry.get("time_msc")),
        "exit_time": iso_time_msc(last_exit.get("time_msc")),
        "duration_seconds": max(0, int((ms(last_exit.get("time_msc")) - ms(first_entry.get("time_msc"))) / 1000)),
        # Internal cursor fields; the closed-position API ignores them.
        "entry_time_msc": ms(first_entry.get("time_msc")),
        "exit_time_msc": ms(last_exit.get("time_msc")),
        "entry_comment": first_entry.get("comment", ""),
        "exit_comment": last_exit.get("comment", ""),
    }


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        LOG.warning("Invalid state file, starting from empty state: %s", path)
        return {}


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def sync_account(account: dict[str, Any], state_dir: Path) -> None:
    if mt5 is None:
        raise RuntimeError("Install the MT5 package first: py -m pip install MetaTrader5")
    terminal_path = account.get("terminal_path") or None
    init_args: dict[str, Any] = {}
    if terminal_path:
        init_args["path"] = terminal_path
    for key in ("login", "server", "password"):
        if account.get(key):
            init_args[key] = account[key]

    if not mt5.initialize(**init_args):
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")

    try:
        info = mt5.account_info()
        if info is None:
            raise RuntimeError(f"account_info failed: {mt5.last_error()}")
        account["account_number"] = int(info.login)
        account.setdefault("symbol", "")

        start = datetime.fromisoformat(account.get("start_date", "2020-01-01T00:00:00+00:00"))
        end = datetime.now(timezone.utc)
        deals = [as_dict(x) for x in (mt5.history_deals_get(start, end) or [])]
        lookup_orders = [as_dict(x) for x in (mt5.history_orders_get(start, end) or [])]
        orders_by_ticket = {int(order.get("ticket", 0)): order for order in lookup_orders}
        current_balance = float(getattr(info, "balance", 0) or 0)
        state_path = state_dir / f"{account['account_number']}.json"
        state = load_state(state_path)

        new_deals = [d for d in deals if cursor_after(d, "time_msc", "ticket", {"time_msc": state.get("deal_time_msc", 0), "ticket": state.get("deal_ticket", 0)})]
        new_deals.sort(key=lambda d: (ms(d.get("time_msc")), int(d.get("ticket", 0))))

        send_records(
            account,
            "new_deals",
            [
                deal_record(
                    d,
                    account["account_number"],
                    calculate_balance_at_time(
                        deals,
                        current_balance,
                        ms(d.get("time_msc")),
                        int(d.get("ticket", 0)),
                    ),
                    *resolve_deal_sl_tp(d, deals, orders_by_ticket),
                )
                for d in new_deals
            ],
            account["history_url"],
        )

        position_ids = {int(d.get("position_id", 0)) for d in new_deals if int(d.get("position_id", 0)) > 0}
        closed: list[dict[str, Any]] = []
        for position_id in position_ids:
            position_history = [as_dict(x) for x in (mt5.history_deals_get(position=position_id) or [])]
            item = closed_position(
                position_history,
                deals,
                account["account_number"],
                current_balance,
                *resolve_deal_sl_tp(
                    min(
                        [
                            d for d in position_history
                            if int(d.get("entry", -1)) in (DEAL_ENTRY_IN, DEAL_ENTRY_INOUT)
                        ],
                        key=lambda d: (ms(d.get("time_msc")), int(d.get("ticket", 0))),
                    ),
                    deals,
                    orders_by_ticket,
                ) if any(
                    int(d.get("entry", -1)) in (DEAL_ENTRY_IN, DEAL_ENTRY_INOUT)
                    for d in position_history
                ) else (0.0, 0.0),
            )
            if item and (ms(item["exit_time_msc"],) > int(state.get("closed_time_msc", 0)) or
                         (ms(item["exit_time_msc"]) == int(state.get("closed_time_msc", 0)) and int(item["exit_deal_ticket"]) > int(state.get("closed_ticket", 0)))):
                closed.append(item)
        closed.sort(key=lambda x: (x["exit_time_msc"], x["exit_deal_ticket"]))
        send_records(account, "closed_positions", closed, account["closed_positions_url"])

        if new_deals:
            last = new_deals[-1]
            state["deal_time_msc"] = ms(last.get("time_msc"))
            state["deal_ticket"] = int(last.get("ticket", 0))
        if closed:
            last = closed[-1]
            state["closed_time_msc"] = int(last["exit_time_msc"])
            state["closed_ticket"] = int(last["exit_deal_ticket"])
        save_state(state_path, state)
        LOG.info("account=%s deals=%d closed=%d", account["account_number"], len(new_deals), len(closed))
    finally:
        mt5.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload MT5 history without blocking worker.mq5")
    parser.add_argument("--config", required=True, help="JSON config path")
    parser.add_argument("--once", action="store_true", help="Run one sync and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    state_dir = Path(config.get("state_dir", "./mt5-history-state"))
    interval = max(5, int(config.get("interval_seconds", 30)))
    accounts = config.get("accounts", [])
    if not accounts:
        raise SystemExit("No accounts configured")

    while True:
        for account in accounts:
            try:
                sync_account(account, state_dir)
            except Exception:
                LOG.exception("History sync failed for account=%s", account.get("account_number", account.get("login", "unknown")))
        if args.once:
            return 0
        time.sleep(interval)


if __name__ == "__main__":
    sys.exit(main())
