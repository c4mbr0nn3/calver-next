# Issue #26 — Calver formats

> Source: https://github.com/muratgozel/node-calver/issues/26
> Reporter: @SayakMukhopadhyay
> Status: Open

## Request

> The library rework has removed some functionalities like being able to set the
> format. Is it something that you intend to bring back or is the `YYYY-MM.stuff`
> the opinion going forward?

The reporter asks whether the ability to **configure a custom version format**
(removed during the library rework) will return, or whether the fixed
`YYYY-MM.MINOR` shape is now the only supported one.

## Current state (post-rework, commit `3d4146d` and later)

After the `refactor: remake of the library` commit, the public API
(`src/index.ts`) supports a **single, fixed** calendar structure:

-   Calendar portion: components joined by `-` (`CALVER_CALENDAR_PORTION_SEPARATOR`)
-   Minor counter joined by `.` (`CALVER_MINOR_PORTION_SEPARATOR`)
-   Regex: `/^[0-9]{4}(-[0-9]{1,2}(-[0-9]{1,2})?)?(\.[0-9]+)?$/`
-   The only knob is the `cycle` setting (`year` | `month` | `week` | `day` | `auto`),
    passed via `CalVerCycleSettings`.

There is **no `format` parameter** anywhere in the current API:

-   `cycle(str, settings?)`
-   `minor(str)`
-   `initial(settings)`
-   `valid(str, settings?)`
-   `nt(newer, older, settings?)` / `ot(older, newer, settings?)`
-   `parse(str, settings?)`, `toString(obj)`
-   `prefix`, `suffix`, `clean`, `isCycleValid`, `CALVER_CYCLES`

## What the rework removed (pre-rework API, commit `3d4146d^`)

The legacy implementation exposed a fully user-configurable format string passed
to every operation, e.g. `calver.inc(format, version, levels)`. Supported format
tags (from `DateVersion.js`, `SemanticVersion.js`, `ModifierVersion.js`):

### Calendar tags (DateVersion)

-   `YYYY` — 4-digit year
-   `YY` — 2-digit year (zero based)
-   `0Y` — zero-padded 2-digit year
-   `MM` — month (zero based, max 2 digit)
-   `0M` — zero-padded month
-   `WW` — week of year (zero based, max 2 digit)
-   `0W` — zero-padded week
-   `DD` — day of month (zero based, max 2 digit)
-   `0D` — zero-padded day

### Semantic tags (SemanticVersion)

-   `MAJOR` — breaking changes counter
-   `MINOR` — new features counter
-   `PATCH` — bug-fix counter

### Modifier tags (ModifierVersion), joined with `-`

-   `DEV`, `ALPHA`, `BETA`, `RC` — pre-release counters

### Increment `level`

A string such as `calendar`, `major`, `minor`, `patch`, `dev`, `alpha`, `beta`,
`rc`, or composites like `calendar.minor`, `patch.alpha`.

### Legacy capabilities lost in the rework

1. **Custom format string** — user composes the version shape from any
   combination of the tags above (e.g. `yyyy.mm.minor.patch`, `yy.0w.minor`).
2. **Zero-padding** — `0Y`, `0M`, `0W`, `0D` produced zero-padded values; the
   current API never pads.
3. **2-digit year** — `YY` / `0Y` tags; current API only emits 4-digit `YYYY`.
4. **Separate semantic counters** — `MAJOR`, `MINOR`, `PATCH` as distinct,
   user-controllable fields with reset semantics (e.g. bumping MAJOR resets
   MINOR/PATCH). The current API collapses everything into a single `minor`
   counter.
5. **Pre-release modifiers** — `dev`, `alpha`, `beta`, `rc` suffixes with their
   own incrementing counters (e.g. `2021.1.1.0-dev.2`). Not present at all in the
   current API.
6. **Composite increment levels** — `calendar.minor`, `patch.alpha`, etc.
   Current `cycle`/`minor` functions do only one thing each.
7. **`isValid(format, version)`** — validation against a specific format string.
   Current `valid(str, settings?)` validates only against the fixed regex.
8. **`useLocalTime` toggle** — legacy supported opting into local time; current
   API is UTC-only (AGENTS.md documents this as a deliberate choice).
9. **Configurable separator** — legacy used a `seperator` member (`.`); current
   separators are hardcoded constants.

## Gap analysis — what is missing to fulfill the request

To restore the requested "set the format" capability, the following would need to
be (re)introduced. Listed from most to least fundamental.

| #   | Missing piece                                          | Notes                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Format string parameter on the public API              | No `format` argument on `cycle`/`minor`/`initial`/`valid`/`nt`/`ot`/`parse`/`toString`. Either add it everywhere, or introduce a new factory/stateful API that holds the format once.                                                                                                                              |
| 2   | Format parser/validator                                | A function that turns a format string (e.g. `yyyy.0m.minor.patch`) into an ordered list of tags with their types (calendar/semantic/modifier) and rendering rules (pad/width). Legacy `validateFormat` did this.                                                                                                   |
| 3   | Calendar tag set + rendering                           | Support `YYYY`, `YY`, `0Y`, `MM`, `0M`, `WW`, `0W`, `DD`, `0D` including zero-padding and 2-digit-year variants. Current `toString` only emits unpadded `YYYY`, `MM`, `WW`, `DD` joined by `-`.                                                                                                                    |
| 4   | Configurable separators                                | Allow calendar separator and minor separator to be chosen (legacy used `.` for both; current hardcodes `-` and `.`). A format string implies per-tag separators.                                                                                                                                                   |
| 5   | Semantic counters (`MAJOR`/`MINOR`/`PATCH`)            | Distinct semantic fields with reset-on-higher-bump semantics. Current single `minor` counter cannot represent a `MAJOR.MINOR.PATCH` triplet.                                                                                                                                                                       |
| 6   | Pre-release modifiers (`dev`/`alpha`/`beta`/`rc`)      | Modifier segment with its own counter and `-` separator. Entirely absent from current types (`CalVerObject` has no modifier field) and regex.                                                                                                                                                                      |
| 7   | Composite increment `level`                            | Level strings like `calendar.minor`, `patch.alpha`. Current functions each perform exactly one operation and take only `cycle`.                                                                                                                                                                                    |
| 8   | `isValid(format, version)`                             | Format-scoped validation (e.g. rejecting `0W = "1"` because it must be `"01"`). Current `valid` only checks the fixed regex + cycle match.                                                                                                                                                                         |
| 9   | Tests for the format feature                           | `src/index.test.ts` covers only the fixed-format API. Legacy `tests/index.js` (deleted in the rework) tested format combinations; equivalent coverage must be added.                                                                                                                                               |
| 10  | CLI support for `--format`                             | `src/cli.ts` exposes `--cycle` only. Passing a format through the CLI (and reconciling it with the current default-command behavior) is needed for feature parity.                                                                                                                                                 |
| 11  | Documentation update                                   | README currently describes only the fixed `YYYY-MM-DD.MINOR` template; the tag table and format examples (present in the pre-rework README) must be restored.                                                                                                                                                      |
| 12  | Decision: keep `cycle`-based API alongside format API? | The rework introduced an opinionated, simpler model (`cycle` + single `minor`). Restoring formats reintroduces complexity. A design decision is required: deprecate the `cycle` API, keep both, or layer the format on top of `cycle`. This is the open question the maintainer must answer before implementation. |

## Open design questions (not answerable from the code)

-   Does the maintainer want the **full legacy format system** back, or only a
    subset (e.g. just custom calendar tags, without modifiers/semantic triplets)?
-   Should the format be a **per-call argument** (legacy style) or a **configured
    instance** (e.g. `calver.create(format)`) to avoid threading it through every
    call?
-   Is the UTC-only behavior (and the fixed `-`/`.` separators) a hard opinion, or
    negotiable as part of restoring formats?

These must be resolved before implementation begins.
