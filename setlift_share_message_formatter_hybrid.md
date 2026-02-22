# SetLift — Workout Share Message Formatter Upgrade (Hybrid “Premium” Layout)

You are Claude Code working inside the SetLift PWA repo.

## Goal

Upgrade the “share workout via text message” feature to use a **premium, scannable layout** (Wordle-like vibe) while safely handling **user-entered exercise names** (unknown length/format).

This change should be **pure formatting** (no data model changes required unless needed for correctness). It must be fast and deterministic.

---

## Target Output (Refined Format)

Use this as the default output style:

```text
💪 CHEST  •  Jan 22
⏱️ 42m  •  5 exercises
🏆 5 PRs  •  7,480 lb total

Barbell Bench Press        8×155 🏆
Incline Bench Press (30°)  8×115 🏆
OHP                        8×95  🏆
Tricep Extension          12×20  🏆
Lateral Raise             12×40  🏆

Logged with SetLift 🔥
```

Notes:
- Workout name should be uppercase (or “title-ish” if you have strong reason).
- Use a dot separator “ • ” between header fields.
- Use `×` for reps/weight.
- Use `🏆` only when it’s a PR (respect existing PR logic).
- Include total volume if available (and cheap to compute). If not available, omit that part cleanly.

---

## Key Requirement: Hybrid Name Compaction (No “Smart” Renaming)

Because exercise names are user-defined, we must **not** attempt semantic trimming. Instead implement a **hybrid compaction strategy** that keeps readability without changing meaning.

### Definitions
- `MAX_NAME_CHARS = 26` (tuneable constant)
- `PAD_WIDTH = 28` (tuneable constant; controls column alignment)

### Display rules for each exercise row
1) If `name.length <= MAX_NAME_CHARS`:
   - Use the name as-is on the same line as the set info.
2) Else if name contains `"("`:
   - Prefer the substring before the first `"("`.
   - If that substring is still too long, truncate with ellipsis.
   - This keeps the primary identifier (e.g., “Incline Bench Press”) and drops the verbose qualifier.
3) Else:
   - Truncate with ellipsis: `name.slice(0, MAX_NAME_CHARS - 1) + "…"`

### Fallback two-line mode (only if needed)
If alignment becomes unreadable due to many long names (heuristic), allow a two-line format:

```text
Bulgarian Split Squat (Front Rack)
  10×55 🏆
```

Heuristic suggestion:
- If 3+ exercise names exceed `MAX_NAME_CHARS`, switch to two-line mode for all rows.

Make this behavior deterministic and testable.

---

## Column Alignment

### One-line mode
Format each line as:

```
<nameCompacted padded to PAD_WIDTH><setString><prBadge?>
```

- Use spaces to pad.
- Do not rely on tabs (SMS clients vary).
- Ensure at least 2 spaces between end of name column and the set string even when name is at max width.

Example:
```text
Incline Bench Press (30°)  8×115 🏆
```

### Two-line mode
- Line 1: full name (unmodified)
- Line 2: two-space indent + set string + badge
Example:
```text
Bulgarian Split Squat (Front Rack)
  10×55 🏆
```

---

## Set String Rules

The existing app already has rules around sets/reps/weight. Keep those rules, but for the share output:

- Use the best “headline” set for each exercise:
  - Prefer the top/PR set if you track PR at set-level
  - Otherwise use the top set (max weight) or the last set logged (pick the best existing logic)
- Format:
  - `reps×weight` like `8×155`
  - Include unit as `lb` when output is in lbs (your app stores lbs internally)
  - If user has kg display enabled for share (if you support that), render `kg` accordingly
- If bodyweight-only exercise (no weight), render `reps×BW` or just `reps reps` depending on existing conventions (keep consistent).
- Round weights per app rule (nearest 0.5 lb) for display.

---

## Header Rules

### Line 1: Workout name + date
- Left: `💪 <WORKOUT_NAME_UPPER>`
- Right-ish: add ` • <MMM D>` if you have a workout end date; otherwise omit.

Example:
`💪 CHEST  •  Jan 22`

### Line 2: Duration + exercise count
`⏱️ 42m  •  5 exercises`
- Duration should be minutes; if >= 60m, use `1h 12m`.
- If duration unknown, omit it cleanly and keep exercise count.

### Line 3: PR count + volume
`🏆 5 PRs  •  7,480 lb total`
- If PR count is 0, omit the PR line entirely OR show:
  - `✨ Solid session`
  Choose whichever matches existing app tone (prefer omitting for minimalism).
- Volume:
  - total volume in lbs, formatted with comma separators
  - if volume is expensive to compute, use existing cached volume metrics; do not add heavy computation in the workout flow.

---

## Footer

Keep:
`Logged with SetLift 🔥`

If you have a share setting to choose “minimal footer,” keep existing behavior; otherwise use the above.

---

## Implementation Requirements

1) Locate the existing share formatter function/module.
2) Implement the hybrid compaction + alignment logic.
3) Add unit tests (or lightweight test harness) for:
   - short name
   - long name with parentheses
   - long name without parentheses
   - mixture triggering two-line mode
   - PR badge rendering
   - volume formatting
4) Ensure output contains only characters safe for SMS/iMessage (no special control chars). The `×` character is OK.

---

## Performance Requirements

- Formatting must be O(n) over exercises and fast.
- Do not add heavyweight libraries for formatting.
- Any volume computation should use existing data already in memory; avoid recomputing large histories.

---

## Acceptance Criteria

- Default share output matches the refined format.
- Handles arbitrary user-defined exercise names gracefully.
- Output remains readable in SMS clients.
- No lag introduced during workout flow.
- Tests cover formatting edge cases.

---

## Start By…

1) Show me the existing share formatter code path you found and what data it receives.
2) Propose exact constants (`MAX_NAME_CHARS`, `PAD_WIDTH`) after quick sample renders.
3) Implement and provide example outputs for:
   - a short-name workout
   - a long-name workout
   - a workout with 0 PRs

Do not commit without permission.
