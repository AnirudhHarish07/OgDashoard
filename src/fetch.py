"""Stage 1: raw data.

This build is fully synthetic: no real government files are downloaded or used.
fetch.py prepares data/raw/, reports any files a user has placed there, and
writes MANUAL_DOWNLOADS.md listing official sources to add later.
"""
from common import RAW

MANUAL = """# Official sources (not used in the current all-synthetic build)

Place downloaded files in this folder (data/raw/). They are not read by the
current pipeline; a real-data loader would be needed to use them.

| Data | Where |
|---|---|
| India Tourism Statistics / Data Compendium PDFs | https://data.tourism.gov.in/tourismdata |
| Ministry of Tourism raw data (.doc, 2019-2023) | https://data.tourism.gov.in/rawdata |
| OGD India tourism datasets | https://data.gov.in (search "tourist visits") |
| RBI Handbook of Statistics on Indian States (tourist visits, GSDP) | https://www.rbi.org.in |
| ASI monument footfall | Parliament answers / https://asi.nic.in |
| UNESCO World Heritage list (India) | https://whc.unesco.org/en/statesparties/in |
"""


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / "MANUAL_DOWNLOADS.md").write_text(MANUAL)
    found = [p.name for p in RAW.iterdir() if p.name != "MANUAL_DOWNLOADS.md"]
    print(f"[fetch] data/raw/ files found: {found or 'none'}")
    print("[fetch] mode: ALL-SYNTHETIC (no real data downloaded or used)")


if __name__ == "__main__":
    main()
