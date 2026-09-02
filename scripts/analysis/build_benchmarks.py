#!/usr/bin/env python3
"""Compute consumer-retail benchmark percentiles from a committed CSV of raw
filing figures, and emit the JSON seed the app loads.

Run manually and offline. This is NOT wired into run.sh, reset.sh or test.sh,
and the app never shells out to Python at runtime: it reads the committed JSON.

    py scripts/analysis/build_benchmarks.py

Input:  scripts/analysis/sources/consumer_retail_peers_v1.csv
Output: packages/db/prisma/benchmarks.v1.json

Every figure in the CSV is an XBRL fact from one 10-K, with the concept name and
the filing index URL recorded alongside it, so each number traces to a filing.
"""

from __future__ import annotations

import csv
import json
from math import ceil, floor
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "scripts" / "analysis" / "sources" / "consumer_retail_peers_v1.csv"
JSON_PATH = REPO_ROOT / "packages" / "db" / "prisma" / "benchmarks.v1.json"

SET_VERSION = "consumer-retail-v1"
INDUSTRY_CODE = "CONSUMER_RETAIL"

# The band the subject engagement carries. The peer set is larger than this
# label (see SOURCE_NOTE); the mismatch is stated in the source string so it
# renders on screen next to every comparison rather than hiding in a commit.
SIZE_BAND = "$25M - $100M"

# Ratios round to 4dp, matching the single rounding choke point in the
# TypeScript engine (lib/metrics.ts). Comparisons happen on integer basis
# points derived from these.
RATIO_DECIMALS = 4

PERCENTILES = (10, 25, 50, 75, 90)


def percentile(sorted_values: list[float], p: float) -> float:
    """Linear interpolation between closest ranks (numpy's default method).

    Stated explicitly because the percentile definition is part of the
    benchmark set's identity: changing it changes every flag that compares
    against it, and would require a new setVersion.
    """
    if not sorted_values:
        raise ValueError("no values")
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * (p / 100)
    low, high = floor(rank), ceil(rank)
    if low == high:
        return sorted_values[int(rank)]
    return sorted_values[low] * (high - rank) + sorted_values[high] * (rank - low)


def load_peers() -> list[dict]:
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def metrics_for(peer: dict) -> dict[str, float]:
    revenue = float(peer["revenue_usd"])
    cogs = float(peer["cogs_usd"])
    sga = float(peer["sga_usd"])
    d_and_a = float(peer["d_and_a_usd"] or 0)

    # EBITDA is operating income plus D&A where operating income is tagged in
    # the filing. Where it is not, the income statement is Revenue - COGS -
    # SG&A = operating income, so the identity is used instead. The CSV records
    # which method each peer used.
    if peer["ebitda_method"] == "operating_income_plus_da":
        ebitda = float(peer["operating_income_usd"]) + d_and_a
    else:
        ebitda = revenue - cogs - sga + d_and_a

    return {
        "GROSS_MARGIN": (revenue - cogs) / revenue,
        "SGA_PCT_REVENUE": sga / revenue,
        "EBITDA_MARGIN": ebitda / revenue,
    }


def main() -> None:
    peers = load_peers()
    if not peers:
        raise SystemExit(f"No rows in {CSV_PATH}")

    per_peer = [(peer, metrics_for(peer)) for peer in peers]
    as_of_date = max(peer["period_end"] for peer in peers)

    revenues = sorted(float(peer["revenue_usd"]) for peer in peers)
    revenue_range = f"${revenues[0] / 1e6:.0f}M-${revenues[-1] / 1e6:.0f}M"
    tickers = ", ".join(sorted(peer["ticker"] for peer in peers))
    source = (
        f"SEC XBRL company facts, most recent 10-K per company ({tickers}). "
        f"{len(peers)} US-listed specialty retailers, revenue {revenue_range}, "
        f"larger than the {SIZE_BAND} label they are joined on."
    )

    rows = []
    for metric_code in ("GROSS_MARGIN", "SGA_PCT_REVENUE", "EBITDA_MARGIN"):
        values = sorted(metrics[metric_code] for _, metrics in per_peer)
        row = {
            "setVersion": SET_VERSION,
            "industryCode": INDUSTRY_CODE,
            "sizeBand": SIZE_BAND,
            "metricCode": metric_code,
            "source": source,
            "asOfDate": as_of_date,
            "sampleSize": len(peers),
        }
        for p in PERCENTILES:
            row[f"p{p}"] = round(percentile(values, p), RATIO_DECIMALS)
        rows.append(row)

    payload = {
        "setVersion": SET_VERSION,
        "generatedFrom": str(CSV_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
        "percentileMethod": "linear interpolation between closest ranks",
        "ratioDecimals": RATIO_DECIMALS,
        "asOfDate": as_of_date,
        "sampleSize": len(peers),
        "peers": [
            {
                "ticker": peer["ticker"],
                "company": peer["company"],
                "cik": peer["cik"],
                "fiscalYear": int(peer["fiscal_year"]),
                "periodEnd": peer["period_end"],
                "revenueUsd": int(peer["revenue_usd"]),
                "grossMargin": round(metrics["GROSS_MARGIN"], RATIO_DECIMALS),
                "sgaPctRevenue": round(metrics["SGA_PCT_REVENUE"], RATIO_DECIMALS),
                "ebitdaMargin": round(metrics["EBITDA_MARGIN"], RATIO_DECIMALS),
                "sourceUrl": peer["source_url"],
            }
            for peer, metrics in per_peer
        ],
        "stats": rows,
    }

    JSON_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {JSON_PATH.relative_to(REPO_ROOT)}")
    print(f"  set {SET_VERSION}  industry {INDUSTRY_CODE}  band {SIZE_BAND}")
    print(f"  as of {as_of_date}  n={len(peers)}  revenue {revenue_range}")
    for row in rows:
        spread = "  ".join(f"P{p} {row[f'p{p}'] * 100:6.2f}%" for p in PERCENTILES)
        print(f"  {row['metricCode']:<16} {spread}")


if __name__ == "__main__":
    main()
