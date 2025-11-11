# Quest UI Simplification Fix Report

Scope: UI-only adjustments in `app/quests/page.tsx`. No backend, DB helpers, or other pages were modified.

Goals met:
- Show a single completed state using existing `claimed` state only.
- Hide/disable Check/Claim buttons when `claimed === true`.
- Collapse the requirements into a compact read-only notice when completed.
- Keep reward card visible and change its text after completion.
- Do not alter free-attack logic or introduce new state chains.

## Edits

### 1) Remove added derived state and rely on `claimed`

```466:466:app/quests/page.tsx
// Removed previously added line:
// const isQuestCompleted = claimed === true
```

### 2) Reward card message uses `claimed`

```724:729:app/quests/page.tsx
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {claimed
                ? '✓ Reward claimed! You can launch your free attack below.'
                : 'Use it to attack any country without paying fees'
              }
            </div>
```

### 3) Requirements block collapses when `claimed`

```744:822:app/quests/page.tsx
        {/* Requirements List */}
        {claimed ? (
          <div
            style={{
              background: 'var(--bg-panel-soft)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              borderRadius: '1rem',
              padding: '1.25rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ margin: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span>📋</span>
              <span style={{ color: 'var(--gold)' }}>All requirements were verified for this quest.</span>
            </h3>
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-panel-soft)',
              border: allRequirementsMet && !claimed
                ? '2px solid var(--amber)'
                : '1px solid var(--stroke)',
              borderRadius: '1rem',
              padding: '1.5rem',
              marginBottom: '2rem',
              position: 'relative'
            }}
          >
            ... existing detailed checklist ...
          </div>
        )}
```

### 4) Action buttons render only a single success pill when `claimed`

```824:952:app/quests/page.tsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
          {!discordConnected ? (
            <a ...>Connect Discord</a>
          ) : claimed ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 1.5rem',
                background: 'var(--gold)',
                color: 'var(--text-dark)',
                borderRadius: '0.75rem',
                fontWeight: '600',
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>✅</span>
              Quest Completed!
            </div>
          ) : (
            <>
              <button
                onClick={handleCheck}
                disabled={loading || claimed}
                style={{ ... cursor: loading || claimed ? 'not-allowed' : 'pointer' ... }}
              >
                ... Check Status ...
              </button>

              {allRequirementsMet && !claimed && (
                <button onClick={handleClaim} disabled={loading} ...>
                  ... Claim Free Attack ...
                </button>
              )}
            </>
          )}
        </div>
```

## Notes
- No API hooks, free-attack logic, or backend files changed.
- Duplicate “Quest Completed!” banners are eliminated by centralizing the completed display in the action area.
- All conditionals now rely solely on `claimed` to avoid state-chain regressions.

## Lint/Build
- Lint: no issues on `app/quests/page.tsx`.


