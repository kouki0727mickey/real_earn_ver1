import json
import subprocess
import sys
from datetime import date

from earn.ledger import net, parse_sale, summary


def test_net_deducts_22_percent_floor():
    assert net(5000) == 3900
    assert net(3000) == 2340
    assert net(3333) == 2600  # fee = floor(733.26) = 733


def test_parse_sale_variants():
    assert parse_sale("[売上] 5000") == 5000
    assert parse_sale("[売上] 5,000円") == 5000
    assert parse_sale("[売上]　５０００") == 5000
    assert parse_sale("Re: [売上] 3000") == 3000
    assert parse_sale("[売上]") is None
    assert parse_sale("[依頼] 5000") is None


def test_summary_uses_only_window():
    sales = [(date(2026, 12, 20), 5000), (date(2026, 12, 1), 5000), (date(2026, 11, 1), 5000)]
    s = summary(sales, today=date(2026, 12, 21))
    assert s["orders"] == 2 and s["gross"] == 10000 and s["net"] == 7800
    assert s["daily_avg_net"] == 260.0
    assert s["gap_per_day"] == 740.0
    assert s["orders_needed_at_5000"] == 6  # ceil((30000 - 7800) / 3900)


def test_summary_empty():
    s = summary([], today=date(2026, 12, 21))
    assert s["orders"] == 0 and s["daily_avg_net"] == 0.0 and s["orders_needed_at_5000"] == 8


def test_cli_prints_json_and_warns_on_unparseable_line():
    stdin = "2026-12-20\t[売上] 5000\n2026-12-20\t[売上]\n"
    r = subprocess.run(
        [sys.executable, "-m", "earn.ledger", "--today", "2026-12-21"],
        input=stdin, capture_output=True, text=True, encoding="utf-8",
    )
    assert r.returncode == 0
    assert json.loads(r.stdout)["orders"] == 1
    assert "WARN" in r.stderr


def test_parse_sale_rejects_ambiguous_amounts_instead_of_guessing():
    assert parse_sale("[売上] 5千円") is None
    assert parse_sale("[売上] 12/20 5000") is None
    assert parse_sale("[売上] 0") is None
    assert parse_sale("[売上] 5000円") == 5000
    assert parse_sale("[売上] ¥5,000") == 5000
