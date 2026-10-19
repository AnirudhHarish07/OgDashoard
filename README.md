# India Tourism Dashboard Dataset

State-wise tourism dataset for India (28 states + 8 UTs, 2015–2025). **All data is synthetic**: illustrative,
seeded (seed=42), and flagged `is_synthetic=true` on every row. See `DATA_DICTIONARY.md`.

```
python src/build.py   # fetch -> clean -> synthesize -> data/processed/*.csv + data/india_tourism.db
python validate.py    # integrity checks and % synthetic per table
```

Requires Python 3 with `numpy` and `pandas`.
