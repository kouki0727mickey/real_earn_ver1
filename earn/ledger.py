"""売上の純粋計算。手数料はココナラの出品者負担 22%（税込）。"""
import argparse
import json
import math
import re
import sys
import unicodedata
from datetime import date, timedelta

FEE_RATE_PERCENT = 22  # 整数演算で端数誤差を避ける。FEE_RATE = 0.22 と同値
FEE_RATE = FEE_RATE_PERCENT / 100
DAILY_TARGET = 1000
_REFERENCE_PRICE = 5000

_SALE_RE = re.compile(r"\[売上\]\s*([0-9][0-9,]*)")


def net(gross: int) -> int:
    return gross - gross * FEE_RATE_PERCENT // 100


def parse_sale(subject: str):
    m = _SALE_RE.search(unicodedata.normalize("NFKC", subject))
    return int(m.group(1).replace(",", "")) if m else None


def summary(sales, today: date, window_days: int = 30) -> dict:
    start = today - timedelta(days=window_days)
    in_window = [g for d, g in sales if start < d <= today]
    gross = sum(in_window)
    total_net = sum(net(g) for g in in_window)
    avg = total_net / window_days
    target = DAILY_TARGET * window_days
    remaining = max(0, target - total_net)
    return {
        "orders": len(in_window),
        "gross": gross,
        "net": total_net,
        "daily_avg_net": round(avg, 1),
        "gap_per_day": round(max(0.0, DAILY_TARGET - avg), 1),
        "orders_needed_at_5000": math.ceil(remaining / net(_REFERENCE_PRICE)),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", required=True)
    args = ap.parse_args(argv)
    sales = []
    for line in sys.stdin.read().splitlines():
        if not line.strip():
            continue
        try:
            day, subject = line.split("\t", 1)
            amount = parse_sale(subject)
            if amount is None:
                raise ValueError
            sales.append((date.fromisoformat(day.strip()), amount))
        except ValueError:
            print(f"WARN: {line}", file=sys.stderr)
    print(json.dumps(summary(sales, date.fromisoformat(args.today)), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
