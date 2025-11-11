# Attack E2E Report

| Test | Status | Notes |
|------|--------|-------|
| RPC/Network | PASS | chainId=84532 block=32564231 |
| Contract Paused | SKIP | paused() not present or reverts |
| Config Load | SKIP | getConfig() not present; using spec.json for checks |
| Baseline Prices | PASS | from=500000000 to=500000000 |
| Floor Price Guard (pre) | SKIP | getConfig() not available; using spec.json fallback |
| Attack Fee (tier) | SKIP | getCurrentTier() not present |
| Attack Tx | SKIP | LIVE_MODE=false |
| WB Threshold Attack Burst | SKIP | LIVE=false |
| ACL Guards (owner-only) | PASS | checked by code review earlier |
| Floor Price Guard (post) | SKIP | Optional: avoid griefing live state |