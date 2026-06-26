# Custom Format Support — Design Spec

**Issue:** [muratgozel/node-calver#26](https://github.com/muratgozel/node-calver/issues/26)
**Date:** 2026-06-26
**Status:** Draft

## Problem

The library rework (commit `3d4146d`, May 2024) removed the ability to define a custom version format. The current library hardcodes `YYYY-MM-DD.MINOR` (dash-separated calendar portion, dot-separated minor counter, no zero-padding). Users on issue #26 need:

-   `YYYY.MM-DD` (custom separators between calendar tags) — onlywei
-   `YYYY.MM.DD-MINOR` (dot calendar, dash minor, MINOR structurally present) — c4mbr0nn3
-   `YYYY.0M.0D.MINOR` (zero-padded month/day) — recursingfeynman

These formats cannot be expressed or validated with the current API.

## Goal

Restore custom format string support to node-calver, covering all three commenter use-cases, while remaining fully backward compatible with the existing cycle-based API.

## Non-goals

-   Semantic levels (MAJOR/MINOR/PATCH). The current single `MINOR` counter is retained.
-   Modifiers (DEV/ALPHA/BETA/RC). Not requested by any commenter.
-   Short-year tags (`YY`, `0Y`). The full 4-digit `YYYY` is sufficient for all requested formats; `YY`/`0Y` introduce parsing ambiguity with `0M`/`MM` and add complexity without demonstrated need.
-   Changes to `clean`, `prefix`, `suffix`. These operate on raw strings and are format-agnostic.

## Design

### 1. Format string

A format string is a sequence of **tags** and **literal separators**. Tags are drawn from a fixed vocabulary; everything else is a literal separator preserved verbatim.

**Tags:**

| Tag     | Meaning                              | Example |
| ------- | ------------------------------------ | ------- |
| `YYYY`  | 4-digit year                         | `2024`  |
| `MM`    | 1–2 digit month (1-12)               | `4`     |
| `0M`    | 2-digit zero-padded month            | `04`    |
| `WW`    | 1–2 digit ISO week (1-54)            | `32`    |
| `0W`    | 2-digit zero-padded week             | `09`    |
| `DD`    | 1–2 digit day (1-31)                 | `7`     |
| `0D`    | 2-digit zero-padded day              | `07`    |
| `MINOR` | minor counter (non-negative integer) | `205`   |

**Examples of valid formats:**

-   `YYYY.MM-DD` → `2024.04-16`
-   `YYYY.MM.DD-MINOR` → `2024.04.16-205`
-   `YYYY.0M.0D.MINOR` → `2024.04.07.1`
-   `YYYY.0W.MINOR` → `2024.32.0`
-   `YYYY` → `2024` (year-only, no minor)

**Rules:**

-   Tags are case-sensitive (uppercase only, matching calver.org conventions and the old library).
-   `MINOR` is optional in the format. If absent, no minor counter is parsed or emitted.
-   Duplicate tags in a format are an error (e.g. `YYYY.YYYY.MINOR`).
-   Empty format string is an error.
-   Tokenization uses greedy longest-match against the known tag vocabulary. Consecutive unknown characters accumulate into a single literal separator token. Unknown tokens are not individually errors — they are treated as literal separators. This means a typo like `MINR` (intending `MINOR`) becomes a literal `MINR` separator rather than a recognized tag; the error surfaces at version-match time (the generated regex won't match the intended input). This is the pragmatic choice: it keeps tokenization unambiguous (greedy match), and malformed formats fail loudly when no version matches them.

### 2. Cycle inference

When a `format` is provided, the cycle is inferred from the calendar tags present:

| Tags present   | Inferred cycle |
| -------------- | -------------- |
| `YYYY` only    | `year`         |
| `+ MM` or `0M` | `month`        |
| `+ WW` or `0W` | `week`         |
| `+ DD` or `0D` | `day`          |

-   An explicit `cycle` setting (other than `'auto'`) overrides inference and is validated against the format (e.g. passing `{ cycle: 'week', format: 'YYYY.0M.MINOR' }` is a mismatch error).
-   `'auto'` (the default) means "infer from format."
-   The existing week-auto-detection ambiguity (`YYYY-32` ambiguous between month 32 and week 32) no longer applies when a format is given, because the format declares whether the tag is `0W`/`WW` (week) or `0M`/`MM` (month).
-   When no `format` is provided, the existing behavior is unchanged: `auto` infers from the parsed structure, and `week` still requires an explicit `{ cycle: 'week' }` setting.

### 3. API changes

The `format` and `showZeroMinor` options are added to each settings object. All changes are **backward compatible** — omitting both keeps the current hardcoded `YYYY-MM-DD.MINOR` behavior.

```ts
export interface CalVerCycleSettings {
    cycle: CalVerCycle
    format?: string
    showZeroMinor?: boolean
}
export interface CalVerValidSettings {
    cycle: CalVerCycle
    format?: string
    showZeroMinor?: boolean
}
```

**New types:**

```ts
export type CalVerFormatTag =
    | 'YYYY'
    | 'MM'
    | '0M'
    | 'WW'
    | '0W'
    | 'DD'
    | '0D'
    | 'MINOR'

export interface CalVerFormat {
    tags: CalVerFormatTag[] // ordered list of tags present in the format
    separators: string[] // separators[i] is the literal between tags[i] and tags[i+1]
    // separators.length === tags.length - 1 (one per gap)
}
```

**Functions affected:**

| Function                                 | Change                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `cycle(str, settings)`                   | When `settings.format` is set, parses with format, infers/validates cycle, computes next, serializes with format.     |
| `valid(str, settings)`                   | When `settings.format` is set, validates against format.                                                              |
| `initial(settings)`                      | When `settings.format` is set, produces initial version string in format (zero minor, controlled by `showZeroMinor`). |
| `nt(a, b, settings)` / `ot(...)`         | Parses both arguments with format before comparing.                                                                   |
| `parse(str, settings)`                   | Extended; when `format` is set, uses a format-derived regex instead of `CALVER_RE_SYNTAX`.                            |
| `toString(obj, format?, showZeroMinor?)` | Extended to accept optional format; when absent, uses current behavior.                                               |
| `clean(str)`                             | Unchanged.                                                                                                            |
| `prefix(str, p)`                         | Unchanged.                                                                                                            |
| `suffix(str, s)`                         | Unchanged.                                                                                                            |

**CLI:** Each command that already has `-c, --cycle` gains:

-   `-f, --format <string>` — the format string.
-   `-z, --show-zero-minor` — boolean flag (no value); when set, `MINOR` is always emitted even when `0`.

### 4. Parsing with a format

`parse(str, { cycle, format })` when `format` is set:

1. **Compile the format into a regex.** Replace each tag with a capture group of the appropriate width range; escape literal separators as regex literals.
    - `YYYY` → `(\d{4})`
    - `MM` / `WW` / `DD` → `(\d{1,2})`
    - `0M` / `0W` / `0D` → `(\d{2})`
    - `MINOR` → `(\d+)`
2. **Anchor** with `^...$`.
3. **Match** the input; on failure throw `"Invalid calver string: doesn't match format <format>"`.
4. **Map captures** to `CalVerObject` fields: `0M`/`MM` → `month`, `0W`/`WW` → `week`, `0D`/`DD` → `day`. Validate ranges (month ≤ 12, week ≤ 54, day ≤ 31) using the existing error messages.
5. If `MINOR` is absent from the format, set `minor = 0` and never emit it.
6. **Infer or validate cycle** against the tags found and the `cycle` setting.

**`toString(obj, format?, showZeroMinor?)` when `format` is set:**

1. Walk the format tags in order, emitting each tag's value from `obj`.
2. Zero-pad `0M` / `0W` / `0D` to 2 digits; emit `MM` / `WW` / `DD` / `YYYY` as-is.
3. Emit `MINOR` (and its preceding separator) only if `showZeroMinor` is `true` or `obj.minor > 0`. When `MINOR` is omitted, its preceding separator is also dropped.

### 5. `showZeroMinor` option

The current library hides the minor when it's `0`. With a custom format, the minor separator is part of the format literal (e.g. `YYYY.MM.DD-MINOR`). We add an explicit `showZeroMinor` option to control this.

**Behavior:**

-   `showZeroMinor: false` (default) — when `obj.minor === 0`, the `MINOR` tag **and its preceding separator** are omitted from output. E.g. format `YYYY.0M.0D.MINOR`, version `2024.04.07.0` → outputs `2024.04.07`. Matches current library behavior and keeps existing tests passing.
-   `showZeroMinor: true` — `MINOR` is always emitted, even when `0`. E.g. format `YYYY.0M.0D.MINOR`, version `2024.04.07.0` → outputs `2024.04.07.0`. This is what c4mbr0nn3's `YYYY.MM.DD-MINOR` use-case needs when the minor counter is at zero.

**Parsing:** When `MINOR` is absent from the input string but present in the format, `parse` sets `minor = 0` (already the case). `showZeroMinor` only affects serialization, not parsing.

**Rationale:** Defaulting to `false` keeps existing tests passing and matches the documented "Minor counter is 0 by default and it's hidden from the output if it's zero" convention. The `true` opt-in serves users whose format explicitly includes `MINOR` as a structural element.

### 6. Error handling

New error cases, all thrown with descriptive messages in the existing style:

| Error case                                                                | Message                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| Invalid format string (unknown tag, empty, duplicate tag)                 | `"Invalid calver format: <detail>"`                      |
| Version doesn't match format regex                                        | `"Invalid calver string: doesn't match format <format>"` |
| Cycle/format mismatch (e.g. `{ cycle: 'week', format: 'YYYY.0M.MINOR' }`) | `"Version and cycle mismatch."` (reuse existing message) |
| Range violations (month > 12, week > 54, day > 31)                        | Reuse existing month/week/day range error messages.      |

### 7. Testing

`src/index.test.ts` is the single test file. New test groups, following existing patterns:

-   **Format parsing:** valid/invalid format strings, tag extraction, separator extraction, duplicate-tag rejection, unknown-tag rejection.
-   **`parse` with format:** each tag variant (`YYYY`, `0M`, `MM`, `0W`, `WW`, `0D`, `DD`, `MINOR`), zero-padding, separators, error cases.
-   **`toString` with format:** round-trip, zero-padding, hide-zero-minor (default), show-zero-minor.
-   **`cycle`/`initial`/`valid`/`nt`/`ot` with format:** the three commenter scenarios as integration tests:
    -   `YYYY.MM-DD` (onlywei)
    -   `YYYY.MM.DD-MINOR` with `showZeroMinor: true` (c4mbr0nn3)
    -   `YYYY.0M.0D.MINOR` (recursingfeynman)
-   **CLI:** `-f/--format` and `-z/--show-zero-minor` flags (added if CLI testing is trivial; current repo has no CLI tests — skip if adding them requires a new test harness).
-   **Backward compatibility:** every existing test passes unchanged.

### 8. Implementation structure

The format logic is isolated in a new internal module to keep `src/index.ts` focused:

-   **`src/format.ts`** — `parseFormat(format: string): CalVerFormat`, `formatToRegex(fmt: CalVerFormat): RegExp`, `toStringWithFormat(obj, fmt, showZeroMinor)`. Pure functions, no side effects, independently testable.
-   **`src/index.ts`** — imports from `./format.js`; existing functions check `settings.format` and delegate to format helpers when present, otherwise use the current hardcoded path. Types (`CalVerFormat`, `CalVerFormatTag`) are exported from `index.ts` for the public API.
-   **`src/cli.ts`** — adds `-f/--format` and `-z/--show-zero-minor` options to each command, threading them into the settings object.

This isolation means the format subsystem can be understood and tested without reading `index.ts`, and `index.ts` changes are minimal (delegation, not reimplementation).
