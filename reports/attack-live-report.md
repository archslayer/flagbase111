# Live Attack E2E Report

**Timestamp:** 2025-10-19T18:08:41.080Z
**Core Contract:** 0x781dd56430774e630dE83f98c29e7FB3cC61f36b
**Test Vector:** Attack 90 → 44, Amount: 0.1 TOKEN18

| Test | Status | Notes |
|------|--------|-------|
| ETH Balance Check | PASS | 0.890354259047920625 ETH |
| Initial State Read | PASS | From: 5, To: 5 |
| Attack Transaction | FAIL | The contract function "attack" reverted. |