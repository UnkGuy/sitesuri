#!/usr/bin/env python3
"""SiteSuri ML command line (run from the ml/ folder).

  python train.py selftest     # score formulas vs the spec's worked examples
  python train.py generate     # write the synthetic tables to data/synthetic/
  python train.py run          # synthetic data -> validation -> model -> artifacts/
  python train.py run --training-csv training.csv --locations-csv locations.csv \
      --rain-climatology-csv rain.csv     # same pipeline on supplied data

`python train.py run --help` lists every option. To score one point with the trained model:
  python -m sitesuri_ml.inference --lat 14.6508 --lon 121.03 --business-type "sari-sari store"
"""

import argparse
import sys
from pathlib import Path

from sitesuri_ml.config import BUSINESS_TYPES
from sitesuri_ml.pipeline import TrainOptions, run
from sitesuri_ml.synthetic import write_synthetic
from sitesuri_ml.validation import selftest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MSME Location Opportunity Score (architecture revision 2)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("selftest", help="check the formulas against the spec's worked examples")

    gen = sub.add_parser("generate", help="write the synthetic training and location tables")
    gen.add_argument("--out-dir", default="data/synthetic")
    gen.add_argument("--seed", type=int, default=42)
    gen.add_argument("--start-date", default="2026-05-01", help="first day of the 90-day synthetic history")

    r = sub.add_parser("run", help="validate, train, score and write scores.json")
    r.add_argument("--out-dir", default="artifacts", help="model, serving artifacts and reports")
    r.add_argument("--data-dir", default="data/synthetic", help="where synthetic tables are written")
    r.add_argument("--training-csv", help="21-column training table (§4.2); synthetic data if omitted")
    r.add_argument("--locations-csv", help="location table (§4.3) for the addresses to score")
    r.add_argument("--rain-climatology-csv", help="month,hour,rainfall_mm; synthetic climatology if omitted")
    r.add_argument("--source-type", help="keep only training rows with this source_type")
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--start-date", default="2026-05-01", help="first day of the synthetic history")
    r.add_argument("--business-types", nargs="+", default=list(BUSINESS_TYPES))
    r.add_argument("--open-hours", default="8-20", help="opening-closing hour, e.g. 8-20 for 08:00-20:00")
    r.add_argument("--open-days", default="0-6", help="weekdays open, 0 = Monday")
    r.add_argument("--months", default="1-12")
    r.add_argument("--train-days", type=int, default=63, help="days 1..N train, the rest test")
    r.add_argument("--objective", choices=["count:poisson", "reg:tweedie"], default="count:poisson")
    r.add_argument("--monotone-rain", action="store_true", help="also constrain rainfall_mm to be non-increasing")
    r.add_argument("--use-congestion", action="store_true",
                   help="add vehicle_congestion_index; scored with the typical value by type, hour and weekday")
    r.add_argument("--ped-scale", choices=["linear", "log"], default="linear")
    r.add_argument("--ped-bounds", type=float, nargs=2, metavar=("P_LO", "P_HI"),
                   help="fixed scaling bounds from an earlier run, so scores stay stable as addresses are added")
    r.add_argument("--skip-sensitivity", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "selftest":
        return selftest()
    if args.command == "generate":
        write_synthetic(Path(args.out_dir), args.seed, args.start_date)
        return 0
    return run(TrainOptions(**{k: v for k, v in vars(args).items() if k != "command"}))


if __name__ == "__main__":
    sys.exit(main())
