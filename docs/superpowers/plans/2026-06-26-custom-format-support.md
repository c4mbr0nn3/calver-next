# Custom Format Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore custom format string support (e.g. `YYYY.0M.0D.MINOR`) to node-calver while remaining fully backward compatible with the existing cycle-based API.

**Architecture:** A new `src/format.ts` module owns format parsing (tag tokenization, regex compilation, serialization). `src/index.ts` existing functions check `settings.format` and delegate to format helpers when present, otherwise use the current hardcoded `YYYY-MM-DD.MINOR` path. `src/cli.ts` adds `-f/--format` and `-z/--show-zero-minor` flags.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, ESLint type-checked, Prettier (4-space indent, no semicolons, single quotes), `.js` specifiers in TS imports.

## Global Constraints

-   TypeScript strict mode with `verbatimModuleSyntax` — use `import { type X }` / `import type` for type-only imports; mixed value+type imports are `import { foo, type Bar } from './module.js'`.
-   Source uses `.js` specifiers in TS imports (e.g. `from './format.js'`).
-   Prettier: 4-space indent, no semicolons, single quotes. Match exactly.
-   `noUncheckedIndexedAccess` — array access returns `T | undefined`; guard or use non-null assertion only when certain.
-   `exactOptionalPropertyTypes` — optional fields cannot be set to `undefined`; only omit or set to a value.
-   `noPropertyAccessFromIndexSignature` — use bracket notation for index signatures.
-   Date math uses UTC (existing convention).
-   Conventional Commits enforced by commitlint. Types: feat, fix, test, refactor, docs, etc.
-   Run order before committing a task: `pnpm exec tsc --noEmit -p tsconfig.json` (typecheck) → `pnpm test` → `pnpm lint` → commit.

---

## File Structure

-   **Create:** `src/format.ts` — `parseFormat`, `compileFormatRegex`, `inferCycleFromFormat`, `toStringWithFormat`, and the `CalVerFormat` / `CalVerFormatTag` types. Pure functions, no side effects, independently testable.
-   **Modify:** `src/index.ts` — import from `./format.js`; extend `parse`, `toString`, `cycle`, `valid`, `initial`, `nt`, `ot` to delegate to format helpers when `settings.format` is set. Export `CalVerFormat`, `CalVerFormatTag` from here for the public API. Extend `CalVerCycleSettings` and `CalVerValidSettings` interfaces with `format?` and `showZeroMinor?`.
-   **Modify:** `src/index.test.ts` — add test groups for format parsing, `parse` with format, `toString` with format, `cycle`/`initial`/`valid`/`nt`/`ot` with format, including the three commenter scenarios.
-   **Modify:** `src/cli.ts` — add `-f, --format <string>` and `-z, --show-zero-minor` options to each command that has `-c, --cycle`.
-   **Modify:** `README.md` — document the format string feature with examples.

---

### Task 1: Format parsing — `parseFormat`

**Files:**

-   Create: `src/format.ts`
-   Test: `src/index.test.ts` (add a new `test('parseFormat', ...)` block)

**Interfaces:**

-   Consumes: nothing (leaf module)
-   Produces:

    -   `type CalVerFormatTag = 'YYYY' | 'MM' | '0M' | 'WW' | '0W' | 'DD' | '0D' | 'MINOR'`
    -   `interface CalVerFormat { tags: CalVerFormatTag[]; separators: string[] }` — `separators.length === tags.length - 1`; `separators[i]` is the literal between `tags[i]` and `tags[i+1]`.
    -   `function parseFormat(format: string): CalVerFormat`

-   [ ] **Step 1: Write the failing test**

Add to `src/index.test.ts` (new import + new test block). First, update the import at the top of the file:

```ts
import {
    type CalVerObject,
    type CalVerFormat,
    type CalVerFormatTag,
    cycle,
    initial,
    parse,
    parseFormat,
    toString,
    valid,
    nt,
    ot,
    prefix,
    suffix,
    clean,
} from './index.js'
```

Then add this test block at the end of the file:

```ts
test('parseFormat', () => {
    // Simple formats
    expect(parseFormat('YYYY')).toStrictEqual({
        tags: ['YYYY'],
        separators: [],
    })
    expect(parseFormat('YYYY.MM')).toStrictEqual({
        tags: ['YYYY', 'MM'],
        separators: ['.'],
    })
    expect(parseFormat('YYYY.MM-DD')).toStrictEqual({
        tags: ['YYYY', 'MM', 'DD'],
        separators: ['.', '-'],
    })
    expect(parseFormat('YYYY.0M.0D.MINOR')).toStrictEqual({
        tags: ['YYYY', '0M', '0D', 'MINOR'],
        separators: ['.', '.', '.'],
    })

    // Zero-padded tags
    expect(parseFormat('YYYY.0W.MINOR')).toStrictEqual({
        tags: ['YYYY', '0W', 'MINOR'],
        separators: ['.', '.'],
    })

    // Multi-char separators (greedy: consecutive non-tag chars accumulate)
    expect(parseFormat('YYYY..MM')).toStrictEqual({
        tags: ['YYYY', 'MM'],
        separators: ['..'],
    })

    // MINOR absent
    expect(parseFormat('YYYY.0M')).toStrictEqual({
        tags: ['YYYY', '0M'],
        separators: ['.'],
    })

    // Errors
    expect(() => parseFormat('')).toThrowError()
    expect(() => parseFormat('YYYY.YYYY.MINOR')).toThrowError()
    expect(() => parseFormat('YYYY.0M.0M')).toThrowError()
    expect(() => parseFormat('YYYY.MINOR.MINOR')).toThrowError()
})
```

-   [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "parseFormat"`
Expected: FAIL — `parseFormat` is not exported (undefined is not a function).

-   [ ] **Step 3: Write minimal implementation**

Create `src/format.ts`:

```ts
const CALVER_FORMAT_TAGS = [
    'YYYY',
    'MINOR',
    '0M',
    'MM',
    '0W',
    'WW',
    '0D',
    'DD',
] as const

export type CalVerFormatTag = (typeof CALVER_FORMAT_TAGS)[number]

export interface CalVerFormat {
    tags: CalVerFormatTag[]
    separators: string[]
}

export function parseFormat(format: string): CalVerFormat {
    if (format.length === 0) {
        throw new Error('Invalid calver format: format string is empty.')
    }

    const tags: CalVerFormatTag[] = []
    const separators: string[] = []
    const seen: Set<string> = new Set()

    let i = 0
    let atTagPosition = true

    while (i < format.length) {
        const tag = matchTag(format, i)

        if (tag !== null) {
            if (seen.has(tag)) {
                throw new Error(
                    'Invalid calver format: duplicate tag ' + tag + '.',
                )
            }
            seen.add(tag)
            tags.push(tag)
            i += tag.length
            atTagPosition = false
        } else {
            let sep = ''
            while (i < format.length && matchTag(format, i) === null) {
                sep += format[i]!
                i += 1
            }
            if (atTagPosition) {
                // Leading separator before the first tag.
                throw new Error(
                    'Invalid calver format: leading separator "' + sep + '".',
                )
            }
            separators.push(sep)
            atTagPosition = true
        }
    }

    if (tags.length === 0) {
        throw new Error(
            'Invalid calver format: no tags found in "' + format + '".',
        )
    }

    // separators collected only between tags (leading separators errored).
    // If format ends with a separator (trailing), we have one extra.
    // We want separators.length === tags.length - 1.
    // Trailing separator after last tag is currently in separators; drop it.
    if (separators.length > tags.length - 1) {
        separators.pop()
    }

    return { tags, separators }
}

function matchTag(str: string, pos: number): CalVerFormatTag | null {
    for (const tag of CALVER_FORMAT_TAGS) {
        if (str.slice(pos, pos + tag.length) === tag) {
            return tag
        }
    }
    return null
}
```

-   [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/index.test.ts -t "parseFormat"`
Expected: PASS

-   [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: No errors.

-   [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: No errors.

-   [ ] **Step 7: Commit**

```bash
git add src/format.ts src/index.test.ts
git commit -m "feat: add parseFormat for custom format string tokenization"
```

---

### Task 2: Format-to-regex compilation and cycle inference

**Files:**

-   Modify: `src/format.ts`
-   Test: `src/index.test.ts` (add test blocks for `compileFormatRegex` and `inferCycleFromFormat`)

**Interfaces:**

-   Consumes: `CalVerFormat`, `CalVerFormatTag` from Task 1
-   Produces:

    -   `function compileFormatRegex(fmt: CalVerFormat): RegExp` — returns anchored regex with capture groups in tag order.
    -   `function inferCycleFromFormat(fmt: CalVerFormat): 'year' | 'month' | 'week' | 'day'`

-   [ ] **Step 1: Write the failing test**

Add to the import in `src/index.test.ts`:

```ts
import {
    type CalVerObject,
    type CalVerFormat,
    type CalVerFormatTag,
    cycle,
    initial,
    parse,
    parseFormat,
    compileFormatRegex,
    inferCycleFromFormat,
    toString,
    valid,
    nt,
    ot,
    prefix,
    suffix,
    clean,
} from './index.js'
```

Add these test blocks at the end of the file:

```ts
test('compileFormatRegex', () => {
    // YYYY only
    const fmtYear = parseFormat('YYYY')
    const reYear = compileFormatRegex(fmtYear)
    expect(reYear.test('2024')).toBe(true)
    expect(reYear.test('2024.1')).toBe(false)
    expect(reYear.test('202')).toBe(false)

    // YYYY.0M.MINOR
    const fmtMonth = parseFormat('YYYY.0M.MINOR')
    const reMonth = compileFormatRegex(fmtMonth)
    expect(reMonth.test('2024.04.1')).toBe(true)
    expect(reMonth.test('2024.04')).toBe(false) // MINOR is required in format, so required in match? No — see spec: MINOR absent in string sets minor=0. But regex requires the group. We need to make MINOR optional in regex.
    // Actually per spec: "When MINOR is absent from the input string but present in the format, parse sets minor = 0."
    // So the MINOR group (and its preceding separator) must be optional in the regex.
    expect(reMonth.test('2024.04')).toBe(true)
    expect(reMonth.test('2024.4')).toBe(false) // 0M requires 2 digits
    expect(reMonth.test('2024.13.1')).toBe(true) // range check happens in parse, not regex
    expect(reMonth.test('2024.04.123')).toBe(true)

    // YYYY.MM-DD (no MINOR)
    const fmtMonthDay = parseFormat('YYYY.MM-DD')
    const reMonthDay = compileFormatRegex(fmtMonthDay)
    expect(reMonthDay.test('2024.4-16')).toBe(true)
    expect(reMonthDay.test('2024.04-16')).toBe(true)
    expect(reMonthDay.test('2024.4.16')).toBe(false)

    // YYYY.0W.MINOR
    const fmtWeek = parseFormat('YYYY.0W.MINOR')
    const reWeek = compileFormatRegex(fmtWeek)
    expect(reWeek.test('2024.06')).toBe(true) // MINOR optional, 0W present
    expect(reWeek.test('2024.06.1')).toBe(true)
    expect(reWeek.test('2024.6')).toBe(false) // 0W requires 2 digits
})

test('inferCycleFromFormat', () => {
    expect(inferCycleFromFormat(parseFormat('YYYY'))).toBe('year')
    expect(inferCycleFromFormat(parseFormat('YYYY.MM'))).toBe('month')
    expect(inferCycleFromFormat(parseFormat('YYYY.0M.MINOR'))).toBe('month')
    expect(inferCycleFromFormat(parseFormat('YYYY.0W'))).toBe('week')
    expect(inferCycleFromFormat(parseFormat('YYYY.WW.MINOR'))).toBe('week')
    expect(inferCycleFromFormat(parseFormat('YYYY.MM.DD'))).toBe('day')
    expect(inferCycleFromFormat(parseFormat('YYYY.0M.0D.MINOR'))).toBe('day')
})
```

-   [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "compileFormatRegex"`
Expected: FAIL — `compileFormatRegex` is not exported.

-   [ ] **Step 3: Write minimal implementation**

Add to `src/format.ts` (append below existing code):

```ts
const CALVER_TAG_REGEX_PARTS: ReadonlyMap<CalVerFormatTag, string> = new Map([
    ['YYYY', '(\\d{4})'],
    ['MM', '(\\d{1,2})'],
    ['0M', '(\\d{2})'],
    ['WW', '(\\d{1,2})'],
    ['0W', '(\\d{2})'],
    ['DD', '(\\d{1,2})'],
    ['0D', '(\\d{2})'],
    ['MINOR', '(\\d+)'],
])

export function compileFormatRegex(fmt: CalVerFormat): RegExp {
    let pattern = '^'
    for (let i = 0; i < fmt.tags.length; i++) {
        const tag = fmt.tags[i]!
        const part = CALVER_TAG_REGEX_PARTS.get(tag)
        if (part === undefined) {
            throw new Error('Invalid calver format: unknown tag ' + tag + '.')
        }

        if (tag === 'MINOR') {
            // MINOR and its preceding separator are optional (hide-when-zero).
            const sep = i > 0 ? fmt.separators[i - 1]! : ''
            const escapedSep = escapeRegex(sep)
            pattern += '(?:' + escapedSep + part + ')?'
        } else {
            if (i > 0) {
                pattern += escapeRegex(fmt.separators[i - 1]!)
            }
            pattern += part
        }
    }
    pattern += '$'
    return new RegExp(pattern)
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function inferCycleFromFormat(
    fmt: CalVerFormat,
): 'year' | 'month' | 'week' | 'day' {
    const tagSet: ReadonlySet<string> = new Set(fmt.tags)
    if (tagSet.has('DD') || tagSet.has('0D')) return 'day'
    if (tagSet.has('WW') || tagSet.has('0W')) return 'week'
    if (tagSet.has('MM') || tagSet.has('0M')) return 'month'
    return 'year'
}
```

-   [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/index.test.ts -t "compileFormatRegex" && pnpm exec vitest run src/index.test.ts -t "inferCycleFromFormat"`
Expected: PASS for both.

-   [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: No errors.

-   [ ] **Step 6: Commit**

```bash
git add src/format.ts src/index.test.ts
git commit -m "feat: add compileFormatRegex and inferCycleFromFormat"
```

---

### Task 3: Serialization — `toStringWithFormat`

**Files:**

-   Modify: `src/format.ts`
-   Test: `src/index.test.ts` (add `test('toStringWithFormat', ...)`)

**Interfaces:**

-   Consumes: `CalVerFormat` from Task 1, `CalVerObject` from `src/index.ts`
-   Produces:

    -   `function toStringWithFormat(obj: CalVerObject, fmt: CalVerFormat, showZeroMinor: boolean): string`

-   [ ] **Step 1: Write the failing test**

Add to the import in `src/index.test.ts`:

```ts
import {
    type CalVerObject,
    type CalVerFormat,
    type CalVerFormatTag,
    cycle,
    initial,
    parse,
    parseFormat,
    compileFormatRegex,
    inferCycleFromFormat,
    toStringWithFormat,
    toString,
    valid,
    nt,
    ot,
    prefix,
    suffix,
    clean,
} from './index.js'
```

Add this test block at the end of the file:

```ts
test('toStringWithFormat', () => {
    // YYYY.0M.0D.MINOR — hide zero minor (default)
    const fmt1 = parseFormat('YYYY.0M.0D.MINOR')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 7, minor: 0 },
            fmt1,
            false,
        ),
    ).toBe('2024.04.07')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 7, minor: 1 },
            fmt1,
            false,
        ),
    ).toBe('2024.04.07.1')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 7, minor: 205 },
            fmt1,
            false,
        ),
    ).toBe('2024.04.07.205')

    // YYYY.0M.0D.MINOR — show zero minor
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 7, minor: 0 },
            fmt1,
            true,
        ),
    ).toBe('2024.04.07.0')

    // YYYY.MM-DD (no MINOR tag)
    const fmt2 = parseFormat('YYYY.MM-DD')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 16, minor: 0 },
            fmt2,
            false,
        ),
    ).toBe('2024.4-16')

    // YYYY only
    const fmt3 = parseFormat('YYYY')
    expect(toStringWithFormat({ year: 2024, minor: 0 }, fmt3, false)).toBe(
        '2024',
    )

    // YYYY.0W.MINOR
    const fmt4 = parseFormat('YYYY.0W.MINOR')
    expect(
        toStringWithFormat({ year: 2024, week: 6, minor: 0 }, fmt4, false),
    ).toBe('2024.06')
    expect(
        toStringWithFormat({ year: 2024, week: 6, minor: 3 }, fmt4, false),
    ).toBe('2024.06.3')
    expect(
        toStringWithFormat({ year: 2024, week: 6, minor: 0 }, fmt4, true),
    ).toBe('2024.06.0')

    // YYYY.MM.DD-MINOR with showZeroMinor (c4mbr0nn3's case)
    const fmt5 = parseFormat('YYYY.MM.DD-MINOR')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 16, minor: 0 },
            fmt5,
            true,
        ),
    ).toBe('2024.4.16-0')
    expect(
        toStringWithFormat(
            { year: 2024, month: 4, day: 16, minor: 5 },
            fmt5,
            false,
        ),
    ).toBe('2024.4.16-5')
})
```

-   [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "toStringWithFormat"`
Expected: FAIL — `toStringWithFormat` is not exported.

-   [ ] **Step 3: Write minimal implementation**

Add to `src/format.ts`. We need to import `CalVerObject` type. Add at the top of `src/format.ts` (after the existing const declarations):

```ts
import type { CalVerObject } from './index.js'
```

Wait — this creates a circular import (`index.ts` will import from `format.ts` in a later task, and `format.ts` imports type from `index.ts`). Since it's a `type`-only import with `verbatimModuleSyntax`, TypeScript erases it at compile time, so no runtime circular dependency. This is fine.

Add the function to `src/format.ts`:

```ts
export function toStringWithFormat(
    obj: CalVerObject,
    fmt: CalVerFormat,
    showZeroMinor: boolean,
): string {
    let result = ''
    for (let i = 0; i < fmt.tags.length; i++) {
        const tag = fmt.tags[i]!

        if (tag === 'MINOR') {
            if (showZeroMinor || obj.minor > 0) {
                const sep = i > 0 ? fmt.separators[i - 1]! : ''
                result += sep + obj.minor.toString(10)
            }
            continue
        }

        if (i > 0) {
            result += fmt.separators[i - 1]!
        }

        const value = getTagValue(obj, tag)
        if (value === null) {
            // Tag present in format but value missing from obj — treat as 0
            // padded or unpadded based on tag.
            result += tag.startsWith('0') ? '00' : '0'
        } else {
            result += tag.startsWith('0')
                ? value.toString(10).padStart(2, '0')
                : value.toString(10)
        }
    }
    return result
}

function getTagValue(obj: CalVerObject, tag: CalVerFormatTag): number | null {
    switch (tag) {
        case 'YYYY':
            return obj.year
        case 'MM':
        case '0M':
            return typeof obj.month === 'number' ? obj.month : null
        case 'WW':
        case '0W':
            return typeof obj.week === 'number' ? obj.week : null
        case 'DD':
        case '0D':
            return typeof obj.day === 'number' ? obj.day : null
        default:
            return null
    }
}
```

-   [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/index.test.ts -t "toStringWithFormat"`
Expected: PASS

-   [ ] **Step 5: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: No errors.

-   [ ] **Step 6: Commit**

```bash
git add src/format.ts src/index.test.ts
git commit -m "feat: add toStringWithFormat for format-aware serialization"
```

---

### Task 4: Extend `parse` and `toString` in `index.ts` with format support

**Files:**

-   Modify: `src/index.ts` (extend `parse`, `toString`, extend interfaces, re-export format types)
-   Test: `src/index.test.ts` (add `test('parse with format', ...)` and `test('toString with format', ...)`)

**Interfaces:**

-   Consumes: `parseFormat`, `compileFormatRegex`, `inferCycleFromFormat`, `toStringWithFormat`, `CalVerFormat`, `CalVerFormatTag` from `src/format.ts`
-   Produces:

    -   `parse(str, settings)` — extended; when `settings.format` is set, uses format path.
    -   `toString(obj, fmt?, showZeroMinor?)` — extended; when `fmt` is set, delegates to `toStringWithFormat`.
    -   Extended `CalVerCycleSettings` and `CalVerValidSettings` with `format?` and `showZeroMinor?`.
    -   Re-exported `parseFormat`, `compileFormatRegex`, `inferCycleFromFormat`, `toStringWithFormat`, `CalVerFormat`, `CalVerFormatTag` from `src/index.ts`.

-   [ ] **Step 1: Write the failing test**

Add these test blocks at the end of `src/index.test.ts`:

```ts
test('parse with format', () => {
    // YYYY.0M.0D.MINOR
    expect(
        parse('2024.04.07.1', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toStrictEqual({ year: 2024, month: 4, day: 7, minor: 1 })
    expect(
        parse('2024.04.07', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toStrictEqual({ year: 2024, month: 4, day: 7, minor: 0 })

    // YYYY.MM-DD (day cycle, no MINOR)
    expect(
        parse('2024.4-16', { cycle: 'auto', format: 'YYYY.MM-DD' }),
    ).toStrictEqual({ year: 2024, month: 4, day: 16, minor: 0 })

    // YYYY.0W.MINOR (week cycle inferred)
    expect(
        parse('2024.06.3', { cycle: 'auto', format: 'YYYY.0W.MINOR' }),
    ).toStrictEqual({ year: 2024, week: 6, minor: 3 })
    expect(
        parse('2024.06', { cycle: 'auto', format: 'YYYY.0W.MINOR' }),
    ).toStrictEqual({ year: 2024, week: 6, minor: 0 })

    // Explicit cycle overrides inference (must match)
    expect(
        parse('2024.04.07.1', {
            cycle: 'day',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toStrictEqual({ year: 2024, month: 4, day: 7, minor: 1 })
    expect(() =>
        parse('2024.04.07.1', {
            cycle: 'week' as const,
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toThrowError()

    // Range validation still applies
    expect(() =>
        parse('2024.13.07.1', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toThrowError()
    expect(() =>
        parse('2024.04.32.1', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toThrowError()

    // Format mismatch (0M requires 2 digits)
    expect(() =>
        parse('2024.4.07.1', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toThrowError()

    // YYYY only (year cycle)
    expect(parse('2024', { cycle: 'auto', format: 'YYYY' })).toStrictEqual({
        year: 2024,
        minor: 0,
    })
})

test('toString with format', () => {
    // YYYY.0M.0D.MINOR — hide zero minor
    expect(
        toString(
            { year: 2024, month: 4, day: 7, minor: 0 },
            parseFormat('YYYY.0M.0D.MINOR'),
            false,
        ),
    ).toBe('2024.04.07')
    expect(
        toString(
            { year: 2024, month: 4, day: 7, minor: 5 },
            parseFormat('YYYY.0M.0D.MINOR'),
            false,
        ),
    ).toBe('2024.04.07.5')

    // YYYY.MM-DD (no MINOR)
    expect(
        toString(
            { year: 2024, month: 4, day: 16, minor: 0 },
            parseFormat('YYYY.MM-DD'),
            false,
        ),
    ).toBe('2024.4-16')

    // No format — backward compatible
    expect(toString({ year: 2024, month: 4, minor: 0 })).toBe('2024-4')
    expect(toString({ year: 2024, month: 4, minor: 123 })).toBe('2024-4.123')
})
```

-   [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "parse with format" && pnpm exec vitest run src/index.test.ts -t "toString with format"`
Expected: FAIL — `parse` doesn't accept `format` in settings; `toString` signature doesn't accept format arg.

-   [ ] **Step 3: Write minimal implementation**

Modify `src/index.ts`. First, add imports and re-exports at the top of the file (after existing consts, before the first export):

```ts
import {
    parseFormat as parseFormatImpl,
    compileFormatRegex,
    inferCycleFromFormat,
    toStringWithFormat,
    type CalVerFormat,
    type CalVerFormatTag,
} from './format.js'

export {
    parseFormat,
    compileFormatRegex,
    inferCycleFromFormat,
    toStringWithFormat,
}
export type { CalVerFormat, CalVerFormatTag }
```

Wait — `verbatimModuleSyntax` requires `export { type X }` syntax for re-exporting types and `export type` for type-only re-exports. Let me use the correct syntax. Also, `parseFormat` is imported as `parseFormatImpl` to avoid name clash if we re-export. Actually, let me just re-export cleanly:

```ts
import {
    parseFormat,
    compileFormatRegex,
    inferCycleFromFormat,
    toStringWithFormat,
} from './format.js'
import type { CalVerFormat, CalVerFormatTag } from './format.js'

export {
    parseFormat,
    compileFormatRegex,
    inferCycleFromFormat,
    toStringWithFormat,
}
export type { CalVerFormat, CalVerFormatTag }
```

Now extend the interfaces (replace the existing `CalVerCycleSettings` and `CalVerValidSettings`):

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

Now extend `parse`. Replace the existing `parse` function:

```ts
export function parse(
    str: string,
    settings: CalVerCycleSettings = { cycle: 'auto' },
) {
    if (settings.format !== undefined) {
        return parseWithFormat(str, settings)
    }

    if (!CALVER_RE_SYNTAX.test(str)) {
        throw new Error('Invalid calver string: standard regex check failed')
    }

    const result: CalVerObject = {
        year: parseInt(str.slice(0, 4), 10),
        minor: str.includes(CALVER_MINOR_PORTION_SEPARATOR)
            ? parseInt(
                  str.slice(str.indexOf(CALVER_MINOR_PORTION_SEPARATOR) + 1),
                  10,
              )
            : 0,
    }

    const dateText =
        result.minor === 0
            ? str
            : str.slice(0, str.indexOf(CALVER_MINOR_PORTION_SEPARATOR))
    const datePortions = dateText.split(CALVER_CALENDAR_PORTION_SEPARATOR)

    if (datePortions.length === 1) {
        if (!['auto', 'year'].includes(settings.cycle)) {
            throw new Error('Version and cycle mismatch.')
        }
        return result
    } else if (datePortions.length === 2) {
        if (!['auto', 'month', 'week'].includes(settings.cycle)) {
            throw new Error('Version and cycle mismatch.')
        }

        const key = settings.cycle === 'week' ? 'week' : 'month'
        const value = parseInt(datePortions[1]!, 10)

        if (key === 'week' && value > CALVER_NUMBER_OF_WEEKS_IN_A_YEAR + 1) {
            throw new Error(
                'The week ' +
                    value.toString() +
                    ' is not a valid week number for a year.',
            )
        }

        if (key === 'month' && value > CALVER_NUMBER_OF_MONTHS_IN_A_YEAR) {
            throw new Error(
                'The month ' +
                    value.toString() +
                    ' is not a valid month number for a year.',
            )
        }

        result[key] = value
        return result
    } else if (datePortions.length === 3) {
        if (!['auto', 'day'].includes(settings.cycle)) {
            throw new Error('Version and cycle mismatch.')
        }

        const month = parseInt(datePortions[1]!, 10)
        const day = parseInt(datePortions[2]!, 10)

        if (month > CALVER_NUMBER_OF_MONTHS_IN_A_YEAR) {
            throw new Error(
                'The month ' +
                    month.toString() +
                    ' is not a valid month number for a year.',
            )
        }

        if (day > CALVER_NUMBER_OF_DAYS_IN_A_MONTH) {
            throw new Error(
                'The day ' +
                    day.toString() +
                    ' is not a valid day number for a month.',
            )
        }

        result.month = month
        result.day = day
        return result
    } else {
        throw new Error('Invalid calver string: invalid date portion.')
    }
}

function parseWithFormat(
    str: string,
    settings: CalVerCycleSettings,
): CalVerObject {
    const fmt = parseFormat(settings.format!)
    const re = compileFormatRegex(fmt)
    const match = str.match(re)

    if (!match) {
        throw new Error(
            "Invalid calver string: doesn't match format " + settings.format!,
        )
    }

    const result: CalVerObject = {
        year: 0,
        minor: 0,
    }

    let groupIndex = 1
    for (const tag of fmt.tags) {
        const captured = match[groupIndex]
        groupIndex += 1

        if (captured === undefined) {
            // MINOR was optional and absent — minor stays 0.
            continue
        }

        const value = parseInt(captured, 10)

        switch (tag) {
            case 'YYYY':
                result.year = value
                break
            case 'MM':
            case '0M':
                if (value > CALVER_NUMBER_OF_MONTHS_IN_A_YEAR) {
                    throw new Error(
                        'The month ' +
                            value.toString() +
                            ' is not a valid month number for a year.',
                    )
                }
                result.month = value
                break
            case 'WW':
            case '0W':
                if (value > CALVER_NUMBER_OF_WEEKS_IN_A_YEAR + 1) {
                    throw new Error(
                        'The week ' +
                            value.toString() +
                            ' is not a valid week number for a year.',
                    )
                }
                result.week = value
                break
            case 'DD':
            case '0D':
                if (value > CALVER_NUMBER_OF_DAYS_IN_A_MONTH) {
                    throw new Error(
                        'The day ' +
                            value.toString() +
                            ' is not a valid day number for a month.',
                    )
                }
                result.day = value
                break
            case 'MINOR':
                result.minor = value
                break
        }
    }

    // Validate cycle against inferred or explicit cycle.
    const inferred = inferCycleFromFormat(fmt)
    if (settings.cycle !== 'auto') {
        if (settings.cycle !== inferred) {
            throw new Error('Version and cycle mismatch.')
        }
    }

    return result
}
```

Now extend `toString`. Replace the existing `toString`:

```ts
export function toString(
    obj: CalVerObject,
    fmt?: CalVerFormat,
    showZeroMinor: boolean = false,
): string {
    if (fmt !== undefined) {
        return toStringWithFormat(obj, fmt, showZeroMinor)
    }

    let result = ''

    result += obj.year.toString(10)
    if (typeof obj.month === 'number')
        result += CALVER_CALENDAR_PORTION_SEPARATOR + obj.month.toString(10)
    if (typeof obj.week === 'number')
        result += CALVER_CALENDAR_PORTION_SEPARATOR + obj.week.toString(10)
    if (typeof obj.day === 'number')
        result += CALVER_CALENDAR_PORTION_SEPARATOR + obj.day.toString(10)
    if (obj.minor > 0)
        result += CALVER_MINOR_PORTION_SEPARATOR + obj.minor.toString(10)

    return result
}
```

-   [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/index.test.ts -t "parse with format" && pnpm exec vitest run src/index.test.ts -t "toString with format"`
Expected: PASS

-   [ ] **Step 5: Run all tests to verify backward compatibility**

Run: `pnpm test`
Expected: All tests PASS (existing + new).

-   [ ] **Step 6: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: No errors.

-   [ ] **Step 7: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: extend parse and toString with custom format support"
```

---

### Task 5: Extend `cycle`, `valid`, `initial`, `nt`, `ot` with format support

**Files:**

-   Modify: `src/index.ts` (extend `cycle`, `valid`, `initial`, `nt`, `ot`)
-   Test: `src/index.test.ts` (add integration test blocks for each function with format)

**Interfaces:**

-   Consumes: `parseWithFormat` (internal), `toStringWithFormat`, `inferCycleFromFormat`, `parseFormat` from prior tasks
-   Produces: `cycle`, `valid`, `initial`, `nt`, `ot` all accept `format` and `showZeroMinor` in settings

-   [ ] **Step 1: Write the failing test**

Add these test blocks at the end of `src/index.test.ts`:

```ts
test('cycle with format', () => {
    const currentDate = new Date(Date.UTC(2000, 1, 10, 12, 0, 0))
    vi.setSystemTime(currentDate)

    // YYYY.0M.0D.MINOR — day cycle inferred, hide zero minor
    expect(
        cycle('2000-01-05', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toBe('2000.02.10')
    expect(
        cycle('2000.02.10', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toBe('2000.02.10.1')
    expect(
        cycle('2000.02.10.5', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toBe('2000.02.10.6')

    // YYYY.0M.0D.MINOR — show zero minor
    expect(
        cycle('2000-01-05', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
            showZeroMinor: true,
        }),
    ).toBe('2000.02.10.0')

    // YYYY.MM.DD-MINOR (c4mbr0nn3's case)
    expect(
        cycle('2000-02-10', { cycle: 'auto', format: 'YYYY.MM.DD-MINOR' }),
    ).toBe('2000-2-10-1')
    expect(
        cycle('2000-01-05', {
            cycle: 'auto',
            format: 'YYYY.MM.DD-MINOR',
            showZeroMinor: true,
        }),
    ).toBe('2000-2-10-0')

    // YYYY.0W.MINOR — week cycle inferred
    expect(cycle('1999.06', { cycle: 'auto', format: 'YYYY.0W.MINOR' })).toBe(
        '2000.06',
    )
    expect(cycle('2000.06', { cycle: 'auto', format: 'YYYY.0W.MINOR' })).toBe(
        '2000.06.1',
    )

    // YYYY.MM (month cycle, no MINOR)
    expect(cycle('1999.01', { cycle: 'auto', format: 'YYYY.MM' })).toBe(
        '2000.2',
    )
    expect(cycle('2000.01', { cycle: 'auto', format: 'YYYY.MM' })).toBe(
        '2000.2',
    )
    expect(cycle('2000.02', { cycle: 'auto', format: 'YYYY.MM' })).toBe(
        '2000.2',
    ) // same month, no minor tag — stays same
    // Note: without MINOR tag, same-period bumps can't increment. This
    // is a limitation — users wanting minor bumps must include MINOR in format.
})

test('initial with format', () => {
    const currentDate = new Date(Date.UTC(2000, 1, 10, 12, 0, 0))
    vi.setSystemTime(currentDate)

    expect(initial({ cycle: 'year', format: 'YYYY' })).toBe('2000')
    expect(initial({ cycle: 'month', format: 'YYYY.0M.MINOR' })).toBe('2000.02')
    expect(initial({ cycle: 'day', format: 'YYYY.0M.0D.MINOR' })).toBe(
        '2000.02.10',
    )
    expect(
        initial({
            cycle: 'day',
            format: 'YYYY.0M.0D.MINOR',
            showZeroMinor: true,
        }),
    ).toBe('2000.02.10.0')
    expect(initial({ cycle: 'month', format: 'YYYY.MM.DD-MINOR' })).toBe(
        '2000.2.10',
    )
    expect(
        initial({
            cycle: 'month',
            format: 'YYYY.MM.DD-MINOR',
            showZeroMinor: true,
        }),
    ).toBe('2000.2.10-0')
})

test('valid with format', () => {
    expect(
        valid('2024.04.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toBe('2024.04.07.1')
    expect(
        valid('2024.04.07', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toBe('2024.04.07')
    expect(() =>
        valid('2024.4.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' }),
    ).toThrowError()
    expect(() =>
        valid('2024.04.07', { cycle: 'week', format: 'YYYY.0M.0D.MINOR' }),
    ).toThrowError()
})

test('nt with format', () => {
    expect(
        nt('2024.04.07.2', '2024.04.07.1', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toBe(true)
    expect(
        nt('2024.04.07.1', '2024.04.07.2', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toBe(false)
    expect(
        nt('2024.05.01', '2024.04.30', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toBe(true)
    expect(
        ot('2024.04.07.1', '2024.04.07.2', {
            cycle: 'auto',
            format: 'YYYY.0M.0D.MINOR',
        }),
    ).toBe(true)
})
```

-   [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/index.test.ts -t "cycle with format"`
Expected: FAIL — `cycle` doesn't use format for serialization.

-   [ ] **Step 3: Write minimal implementation**

Modify `src/index.ts`. First, update `cycle` to use format-aware serialization. Replace the existing `cycle` function:

```ts
export function cycle(
    str: string,
    settings: CalVerCycleSettings = { cycle: 'auto' },
) {
    const version = parse(str, settings)
    const fmt =
        settings.format !== undefined ? parseFormat(settings.format) : undefined
    const cycle =
        fmt !== undefined
            ? settings.cycle !== 'auto'
                ? settings.cycle
                : inferCycleFromFormat(fmt)
            : settings.cycle !== 'auto'
              ? settings.cycle
              : findCycle(version)
    const currentDate = getCurrentDate()
    const next: CalVerObject = Object.assign({}, version)
    const isFuture = newerThan(version, currentDate)

    if (isFuture) {
        next.minor += 1
    } else if (cycle === 'year' && version.year !== currentDate.year) {
        next.year = currentDate.year
        next.minor = 0
    } else if (
        cycle === 'month' &&
        (version.month !== currentDate.month ||
            version.year !== currentDate.year)
    ) {
        next.year = currentDate.year
        next.month = currentDate.month
        next.minor = 0
    } else if (
        cycle === 'week' &&
        (version.week !== currentDate.week || version.year !== currentDate.year)
    ) {
        next.year = currentDate.year
        next.week = currentDate.week
        next.minor = 0
    } else if (
        cycle === 'day' &&
        (version.day !== currentDate.day ||
            version.month !== currentDate.month ||
            version.year !== currentDate.year)
    ) {
        next.year = currentDate.year
        next.month = currentDate.month
        next.day = currentDate.day
        next.minor = 0
    } else {
        next.minor += 1
    }

    return toString(next, fmt, settings.showZeroMinor ?? false)

    function newerThan(
        version: CalVerObject,
        currentDate: CalVerCurrentDateObject,
    ) {
        if (typeof version.week === 'number') {
            return (
                (version.year >= currentDate.year &&
                    version.week > currentDate.week) ||
                version.year > currentDate.year
            )
        }

        const versionDateNative = new Date(
            version.year,
            typeof version.month === 'number' ? version.month - 1 : 0,
            version.day ?? 0,
        )
        const currentDateNative = new Date(
            currentDate.year,
            currentDate.month - 1,
            currentDate.day,
        )
        return versionDateNative.getTime() > currentDateNative.getTime()
    }

    function findCycle(v: CalVerObject): CalVerCycle {
        if (typeof v.day === 'number') return 'day'
        else if (typeof v.week === 'number') return 'week'
        else if (typeof v.month === 'number') return 'month'
        else return 'year'
    }
}
```

Now update `initial`:

```ts
export function initial(settings: CalVerCycleSettings) {
    if (!isCycleValid(settings.cycle, false)) {
        throw new Error('Invalid release cycle')
    }

    const cycle = settings.cycle
    const currentDate = getCurrentDate()
    const result: CalVerObject = {
        year: currentDate.year,
        minor: 0,
    }

    if (cycle === 'month') result.month = currentDate.month
    if (cycle === 'week') result.week = currentDate.week
    if (cycle === 'day') {
        result.month = currentDate.month
        result.day = currentDate.day
    }

    const fmt =
        settings.format !== undefined ? parseFormat(settings.format) : undefined
    return toString(result, fmt, settings.showZeroMinor ?? false)
}
```

`valid` already calls `parse`, which now handles format. No changes needed to `valid` itself — it delegates to `parse`.

`nt` and `ot` already call `parse`, which now handles format. No changes needed.

-   [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/index.test.ts -t "cycle with format" && pnpm exec vitest run src/index.test.ts -t "initial with format" && pnpm exec vitest run src/index.test.ts -t "valid with format" && pnpm exec vitest run src/index.test.ts -t "nt with format"`
Expected: All PASS.

-   [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: All PASS.

-   [ ] **Step 6: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: No errors.

-   [ ] **Step 7: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: extend cycle, initial, valid, nt, ot with format support"
```

---

### Task 6: CLI — add `--format` and `--show-zero-minor` flags

**Files:**

-   Modify: `src/cli.ts`
-   Test: manual verification (no CLI test harness in repo)

**Interfaces:**

-   Consumes: `CalVerCycleSettings` extended interface from Task 4
-   Produces: CLI commands accept `-f, --format <string>` and `-z, --show-zero-minor`

-   [ ] **Step 1: Implement CLI changes**

Modify `src/cli.ts`. The settings objects passed to library functions need to include `format` and `showZeroMinor` from CLI options. Replace each command's option/action block. Here is the full updated `src/cli.ts`:

```ts
import { Command } from 'commander'
import pkg from '../package.json'
import {
    isCycleValid,
    CALVER_CYCLES,
    cycle,
    valid,
    initial,
    nt,
    ot,
    prefix,
    suffix,
    clean,
    type CalVerCycle,
} from './index.js'

const program = new Command()

program.name(pkg.name).description(pkg.description).version(pkg.version)

program
    .command('cycle', { isDefault: true })
    .argument('<string>', 'version string')
    .option(
        '-c, --cycle <string>',
        'release cycle. one of ' + CALVER_CYCLES.join(', '),
        parseCycleArg,
        'auto',
    )
    .option(
        '-f, --format <string>',
        'custom format string (e.g. YYYY.0M.0D.MINOR)',
    )
    .option(
        '-z, --show-zero-minor',
        'always emit MINOR even when it is 0',
        false,
    )
    .action(
        (
            str: string,
            options: {
                cycle: CalVerCycle
                format?: string
                showZeroMinor: boolean
            },
        ) => {
            const next = cycle(str, {
                cycle: options.cycle,
                ...(options.format !== undefined
                    ? { format: options.format }
                    : {}),
                ...(options.showZeroMinor
                    ? { showZeroMinor: options.showZeroMinor }
                    : {}),
            })
            console.log(next)
        },
    )

program
    .command('initial')
    .requiredOption(
        '-c, --cycle <string>',
        'release cycle. one of ' + CALVER_CYCLES.join(', '),
        parseCycleArgStrict,
    )
    .option(
        '-f, --format <string>',
        'custom format string (e.g. YYYY.0M.0D.MINOR)',
    )
    .option(
        '-z, --show-zero-minor',
        'always emit MINOR even when it is 0',
        false,
    )
    .action(
        (options: {
            cycle: CalVerCycle
            format?: string
            showZeroMinor: boolean
        }) => {
            const initialVersion = initial({
                cycle: options.cycle,
                ...(options.format !== undefined
                    ? { format: options.format }
                    : {}),
                ...(options.showZeroMinor
                    ? { showZeroMinor: options.showZeroMinor }
                    : {}),
            })
            console.log(initialVersion)
        },
    )

program
    .command('valid')
    .argument('<string>', 'version string')
    .option(
        '-c, --cycle <string>',
        'release cycle. one of ' + CALVER_CYCLES.join(', '),
        parseCycleArg,
        'auto',
    )
    .option(
        '-f, --format <string>',
        'custom format string (e.g. YYYY.0M.0D.MINOR)',
    )
    .action((str: string, options: { cycle: CalVerCycle; format?: string }) => {
        const validVersion = valid(str, {
            cycle: options.cycle,
            ...(options.format !== undefined ? { format: options.format } : {}),
        })
        console.log(validVersion)
    })

program
    .command('nt')
    .argument('<string>', 'version string')
    .argument('<string>', 'version string')
    .option(
        '-c, --cycle <string>',
        'release cycle. one of ' + CALVER_CYCLES.join(', '),
        parseCycleArg,
        'auto',
    )
    .option(
        '-f, --format <string>',
        'custom format string (e.g. YYYY.0M.0D.MINOR)',
    )
    .action(
        (
            str: string,
            str2: string,
            options: { cycle: CalVerCycle; format?: string },
        ) => {
            const isNewer = nt(str, str2, {
                cycle: options.cycle,
                ...(options.format !== undefined
                    ? { format: options.format }
                    : {}),
            })
            if (!isNewer) {
                throw new Error(
                    'The version ' + str + ' is not newer than the ' + str2,
                )
            }
            console.log(str)
        },
    )

program
    .command('ot')
    .argument('<string>', 'version string')
    .argument('<string>', 'version string')
    .option(
        '-c, --cycle <string>',
        'release cycle. one of ' + CALVER_CYCLES.join(', '),
        parseCycleArg,
        'auto',
    )
    .option(
        '-f, --format <string>',
        'custom format string (e.g. YYYY.0M.0D.MINOR)',
    )
    .action(
        (
            str: string,
            str2: string,
            options: { cycle: CalVerCycle; format?: string },
        ) => {
            const isNewer = ot(str, str2, {
                cycle: options.cycle,
                ...(options.format !== undefined
                    ? { format: options.format }
                    : {}),
            })
            if (!isNewer) {
                throw new Error(
                    'The version ' + str + ' is not older than the ' + str2,
                )
            }
            console.log(str)
        },
    )

program
    .command('prefix')
    .argument('<string>', 'version string')
    .option('--prefix <string>', 'The prefix.', 'v')
    .action((str: string, options: { prefix: string }) => {
        console.log(prefix(str, options.prefix))
    })

program
    .command('suffix')
    .argument('<string>', 'version string')
    .option('--suffix <string>', 'The suffix.')
    .action((str: string, options: { suffix: string }) => {
        console.log(suffix(str, options.suffix))
    })

program
    .command('clean')
    .argument('<string>', 'version string')
    .action((str: string) => {
        console.log(clean(str))
    })

program.parse()

function parseCycleArg(value: string) {
    if (!isCycleValid(value)) {
        throw new Error(
            'Invalid release cycle: the valid values are ' +
                CALVER_CYCLES.join(', '),
        )
    }
    return value
}

function parseCycleArgStrict(value: string) {
    if (!isCycleValid(value, false)) {
        throw new Error(
            'Invalid release cycle: the valid values are ' +
                CALVER_CYCLES.filter((v) => v !== 'auto').join(', '),
        )
    }
    return value
}
```

-   [ ] **Step 2: Typecheck + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json && pnpm lint`
Expected: No errors.

-   [ ] **Step 3: Build and manually verify**

Run: `pnpm run build`
Then test the CLI:

```sh
# cycle with format (date is 2000-02-10 in tests, but real date applies here)
node dist/cli.js 2024.04.07.1 -f YYYY.0M.0D.MINOR
node dist/cli.js 2024.04.07 -f YYYY.0M.0D.MINOR
node dist/cli.js initial -c day -f YYYY.0M.0D.MINOR -z
node dist/cli.js valid 2024.04.07.1 -f YYYY.0M.0D.MINOR
```

Expected: outputs a version string matching the format, no errors.

-   [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: All PASS.

-   [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add --format and --show-zero-minor CLI flags"
```

---

### Task 7: Documentation — README

**Files:**

-   Modify: `README.md`

-   [ ] **Step 1: Add documentation**

Add a new section to `README.md` after the "Cycles" section (before "Minor releases"). The new section documents the format string feature:

````markdown
### Custom formats

By default, node-calver uses the `YYYY-MM-DD.MINOR` format (dash-separated
calendar portion, dot-separated minor counter). You can specify a custom
format string using the `format` option in the settings object (or the
`-f, --format` CLI flag).

A format string is a sequence of **tags** and **literal separators**.
Tags are drawn from this vocabulary:

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

Any characters between tags are literal separators, preserved verbatim in
the output.

```ts
import * as calver from 'calver'

calver.cycle('2024.04.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' })
// → '2024.04.07.2' (or next day/month/year depending on current date)

calver.initial({ cycle: 'day', format: 'YYYY.0M.0D.MINOR' })
// → '2024.06.26' (current UTC date, zero minor hidden by default)

calver.valid('2024.04.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' })
// → '2024.04.07.1'
```
````

```sh
calver 2024.04.07.1 --format YYYY.0M.0D.MINOR
calver initial --cycle day --format YYYY.0M.0D.MINOR
calver valid 2024.04.07.1 --format YYYY.0M.0D.MINOR
```

When a `format` is provided, the release cycle is inferred from the
calendar tags present (`YYYY` → year, `+MM/0M` → month, `+WW/0W` → week,
`+DD/0D` → day). An explicit `--cycle` option overrides inference and is
validated against the format.

#### Showing zero minor

By default, the `MINOR` tag (and its preceding separator) is omitted from
the output when the minor counter is `0`, matching the library's default
behavior. Use the `showZeroMinor` option (or the `-z, --show-zero-minor`
CLI flag) to always emit `MINOR`, even when it is `0`:

```ts
calver.initial({
    cycle: 'day',
    format: 'YYYY.0M.0D.MINOR',
    showZeroMinor: true,
})
// → '2024.06.26.0'
```

```sh
calver initial --cycle day --format YYYY.0M.0D.MINOR --show-zero-minor
```

````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document custom format string support"
````

---

### Task 8: Final verification — full build and release readiness

-   [ ] **Step 1: Run full verification suite**

Run in order:

```sh
pnpm exec tsc --noEmit -p tsconfig.json
pnpm test
pnpm lint
pnpm run build
```

Expected: All pass, `dist/` regenerated cleanly.

-   [ ] **Step 2: Verify dist output includes format module**

Check that `dist/` contains the compiled format module:

```sh
ls dist/
```

Expected: `cli.js`, `cli.cjs`, `index.js`, `index.cjs`, `index.d.ts`, `index.d.cts`, and `format.js`, `format.cjs`, `format.d.ts` (or bundled into index — depends on pkgroll behavior).

-   [ ] **Step 3: Smoke test the built CLI**

```sh
node dist/cli.js 2024.04.07.1 -f YYYY.0M.0D.MINOR
node dist/cli.js initial -c day -f YYYY.0M.0D.MINOR -z
node dist/cli.js valid 2024.04.07.1 -f YYYY.0M.0D.MINOR
```

Expected: correct outputs, no errors.

-   [ ] **Step 4: Commit if dist changed**

```sh
git add dist/
git commit -m "build: regenerate dist with custom format support"
```

If no changes, skip the commit.
