# Social Warrior Quest Integration Report

## Overview
- Added the second quest, **Social Warrior**, allowing players to earn the second free attack by completing X follow and tweet actions for @flagbasefun and #FlagBase.
- Extended quest flows to remain consistent with the existing Communication Specialist quest, including authentication, rate limiting, and atomic free attack awards.
- Introduced a reusable social popup flow that listens to X widget events and communicates completion back to the main window via `postMessage`.

## Frontend (`app/quests/page.tsx`, `app/social/popup/page.tsx`)
- New Social Warrior card appears below the Communication Specialist quest with a visual divider.
- Tracks quest progress locally and via `/api/quests/my`, enabling and disabling buttons dynamically.
- Implemented popup handler (`openSocialPopup`) and claim logic that interact with the backend using `meta.method` (`follow`, `tweet`, `claim`).
- Added state management for social quest readiness, step detection toasts, and claim feedback.
- Created `/social/popup` page that loads X widgets, listens for `twttr.events` follow/tweet callbacks, and notifies the opener.

## Backend (`app/api/quests/claim/route.ts`, `app/api/quests/my/route.ts`)
- Rebuilt `POST /api/quests/claim` to support multiple quest types, SIWE session enforcement, and per-IP/per-wallet rate limits.
- Implemented atomic awarding logic shared between quests, capped by `MAX_FREE_ATTACKS_PER_USER`.
- Introduced `quest_progress` collection to store Social Warrior step completion and ensure idempotent behavior.
- Extended `GET /api/quests/my` to return both completed quest keys and current progress `{ follow, tweet }`.

## Database & Indexes (`lib/initDb.ts`)
- Added a unique index on `{ wallet, questKey }` for the new `quest_progress` collection.
- Existing `free_attacks` and `quest_claims` indexes remain unchanged; award logic now reuses them for both quests.

## API Responses
- Social quest responses now include:
  - `steps`/`progress` indicating follow & tweet completion.
  - `freeGiven` to signal whether a free attack increment occurred.
  - `code` values (`MISSING_STEPS`, `ALREADY_CLAIMED`, etc.) for frontend messaging.
- Communication Specialist retains its existing shape for backward compatibility but now requires a valid session wallet.

## Testing Checklist
- Follow-only and tweet-only flows mark progress without awarding.
- Claim succeeds only after both steps (or returns `MISSING_STEPS` otherwise).
- Repeated claims return `ALREADY_CLAIMED` without double-awarding.
- Free attack award does not exceed global limit; quest still marks as completed without extra grants.
- Popup listener closes automatically on success or after 30s timeout.

## Notes & Warnings
- Popups must be allowed in the browser; otherwise the UI surfaces a toast informing the user.
- Rate limiting will return HTTP 429 with `{ error: 'RATE_LIMIT_EXCEEDED' }`.
- Existing Communication Specialist flow is preserved but now validates session wallet consistency.

