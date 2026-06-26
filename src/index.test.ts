import { expect, test, vi } from 'vitest'
import {
    type CalVerObject,
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

const samples: [string, CalVerObject][] = [
    ['2024', { year: 2024, minor: 0 }],
    ['2024-4', { year: 2024, month: 4, minor: 0 }],
    ['2024-4.123', { year: 2024, month: 4, minor: 123 }],
    ['2024-4-30', { year: 2024, month: 4, day: 30, minor: 0 }],
    ['2024-4-30.123', { year: 2024, month: 4, day: 30, minor: 123 }],
]

test('parse', () => {
    expect(() => parse('')).toThrowError()
    expect(() => parse('1.2.3')).toThrowError()
    expect(() => parse('2024-13')).toThrowError()
    expect(() => parse('2024-13.123')).toThrowError()
    expect(() => parse('2024-56', { cycle: 'week' })).toThrowError()
    expect(() => parse('2024-12-32')).toThrowError()
    expect(parse(samples[0]![0])).toStrictEqual(samples[0]![1])
    expect(parse(samples[1]![0])).toStrictEqual(samples[1]![1])
    expect(parse(samples[2]![0])).toStrictEqual(samples[2]![1])
    expect(parse(samples[1]![0], { cycle: 'week' })).toStrictEqual({
        year: 2024,
        week: 4,
        minor: 0,
    })
    expect(parse(samples[2]![0], { cycle: 'week' })).toStrictEqual({
        year: 2024,
        week: 4,
        minor: 123,
    })
    expect(parse(samples[3]![0])).toStrictEqual(samples[3]![1])
    expect(parse(samples[4]![0])).toStrictEqual(samples[4]![1])
})

test('to string', () => {
    expect(toString(samples[0]![1])).toBe(samples[0]![0])
    expect(toString(samples[1]![1])).toBe(samples[1]![0])
    expect(toString(samples[2]![1])).toBe(samples[2]![0])
    expect(toString({ year: 2024, week: 4, minor: 0 })).toBe(samples[1]![0])
    expect(toString({ year: 2024, week: 4, minor: 123 })).toBe(samples[2]![0])
    expect(toString(samples[3]![1])).toBe(samples[3]![0])
    expect(toString(samples[4]![1])).toBe(samples[4]![0])
})

test('valid', () => {
    expect(() => valid('')).toThrowError()
    expect(() => valid('202')).toThrowError()
    expect(() => valid('202409')).toThrowError()
    expect(valid(samples[0]![0])).toBe(samples[0]![0])
    expect(valid(samples[1]![0])).toBe(samples[1]![0])
    expect(valid(samples[2]![0])).toBe(samples[2]![0])
    expect(valid(samples[3]![0])).toBe(samples[3]![0])

    expect(valid(samples[0]![0], { cycle: 'year' })).toBe(samples[0]![0])
    expect(() => valid(samples[0]![0], { cycle: 'month' })).toThrowError()

    expect(valid(samples[1]![0], { cycle: 'month' })).toBe(samples[1]![0])
    expect(valid(samples[1]![0], { cycle: 'week' })).toBe(samples[1]![0])
    expect(() => valid(samples[1]![0], { cycle: 'year' })).toThrowError()
    expect(() => valid(samples[1]![0], { cycle: 'day' })).toThrowError()

    expect(valid(samples[2]![0], { cycle: 'month' })).toBe(samples[2]![0])
    expect(valid(samples[2]![0], { cycle: 'week' })).toBe(samples[2]![0])
    expect(() => valid(samples[2]![0], { cycle: 'year' })).toThrowError()
    expect(() => valid(samples[2]![0], { cycle: 'day' })).toThrowError()

    expect(valid(samples[3]![0], { cycle: 'day' })).toBe(samples[3]![0])
    expect(valid(samples[3]![0], { cycle: 'auto' })).toBe(samples[3]![0])
    expect(() => valid(samples[3]![0], { cycle: 'month' })).toThrowError()
    expect(() => valid(samples[3]![0], { cycle: 'year' })).toThrowError()
    expect(() => valid(samples[3]![0], { cycle: 'week' })).toThrowError()
})

test('cycle', () => {
    const currentDate = new Date(Date.UTC(2000, 1, 10, 12, 0, 0))
    vi.setSystemTime(currentDate)

    expect(() => cycle('')).toThrowError()
    expect(() => cycle('222')).toThrowError()

    expect(cycle('2000')).toBe('2000.1')
    expect(cycle('2000.123')).toBe('2000.124')
    expect(cycle('1999')).toBe('2000')
    expect(cycle('1999.123')).toBe('2000')
    expect(cycle('2025')).toBe('2025.1')
    expect(cycle('2025.123')).toBe('2025.124')

    expect(cycle('1999-1')).toBe('2000-2')
    expect(cycle('1999-2')).toBe('2000-2')
    expect(cycle('1999-2.123')).toBe('2000-2')
    expect(cycle('1999-3')).toBe('2000-2')
    expect(cycle('2000-1')).toBe('2000-2')
    expect(cycle('2000-1.123')).toBe('2000-2')
    expect(cycle('2000-2')).toBe('2000-2.1')
    expect(cycle('2000-2.123')).toBe('2000-2.124')
    expect(cycle('2025-2')).toBe('2025-2.1')
    expect(cycle('2025-2.123')).toBe('2025-2.124')

    expect(cycle('1999-1', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('1999-2', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('1999-2.123', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('1999-3', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('2000-1', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('2000-1.123', { cycle: 'week' })).toBe('2000-6')
    expect(cycle('2000-6', { cycle: 'week' })).toBe('2000-6.1')
    expect(cycle('2000-6.123', { cycle: 'week' })).toBe('2000-6.124')
    expect(cycle('2025-6', { cycle: 'week' })).toBe('2025-6.1')
    expect(cycle('2025-6.123', { cycle: 'week' })).toBe('2025-6.124')

    expect(cycle('1999-1-29')).toBe('2000-2-10')
    expect(cycle('1999-1-10')).toBe('2000-2-10')
    expect(cycle('2000-1-10')).toBe('2000-2-10')
    expect(cycle('2000-2-9')).toBe('2000-2-10')
    expect(cycle('2000-2-10')).toBe('2000-2-10.1')
    expect(cycle('2000-2-10.123')).toBe('2000-2-10.124')
    expect(cycle('2025-2-10')).toBe('2025-2-10.1')
    expect(cycle('2025-2-10.123')).toBe('2025-2-10.124')
})

test('initial', () => {
    const currentDate = new Date(Date.UTC(2000, 1, 10, 12, 0, 0))
    vi.setSystemTime(currentDate)

    // @ts-ignore
    expect(() => initial({ cycle: 'invalid' })).toThrowError()
    expect(() => initial({ cycle: 'auto' })).toThrowError()
    expect(initial({ cycle: 'year' })).toBe('2000')
    expect(initial({ cycle: 'month' })).toBe('2000-2')
    expect(initial({ cycle: 'day' })).toBe('2000-2-10')
})

test('newer than', () => {
    expect(() => nt('200000', '299999')).toThrowError()
    expect(nt('2020', '2020')).toBe(false)
    expect(nt('2020', '2019')).toBe(true)
    expect(nt('2020', '2021')).toBe(false)
    expect(nt('2020.123', '2020')).toBe(false)
    expect(nt('2020.123', '2019')).toBe(true)
    expect(nt('2020.123', '2021')).toBe(false)
    expect(nt('2020.123', '2020.124')).toBe(false)
    expect(nt('2020.123', '2019.124')).toBe(true)
    expect(nt('2020.123', '2021.124')).toBe(false)

    expect(nt('2020-4', '2020-4')).toBe(false)
    expect(() => nt('2020-13', '2020-12')).toThrowError()
    expect(nt('2020-4', '2020-3')).toBe(true)
    expect(nt('2020-4', '2021-3')).toBe(false)
    expect(nt('2019-4', '2021-3')).toBe(false)
    expect(nt('2020-3', '2020-4')).toBe(false)
    expect(nt('2020-4.123', '2020-4.124')).toBe(false)
    expect(nt('2020-4.123', '2020-3.125')).toBe(true)
    expect(nt('2020-3.123', '2020-4.126')).toBe(false)

    expect(nt('2020-4-20', '2020-4-20')).toBe(false)
    expect(nt('2020-4-20', '2020-4-19')).toBe(true)
    expect(nt('2020-4-20', '2020-4-21')).toBe(false)
    expect(nt('2020-3-20', '2020-4-20')).toBe(false)
    expect(nt('2019-4-20', '2020-4-20')).toBe(false)
    expect(nt('2020-4-20.123', '2020-4-20.129')).toBe(false)
    expect(nt('2020-4-20.123', '2020-4-19.129')).toBe(true)
    expect(nt('2020-4-20.123', '2020-4-21.129')).toBe(false)
})

test('older than', () => {
    expect(ot('2020', '2020')).toBe(false)
    expect(ot('2020', '2019')).toBe(false)
    expect(ot('2020', '2021')).toBe(true)
})

test('prefix', () => {
    expect(prefix('2024-4.123')).toBe('v2024-4.123')
    expect(prefix('2024-4.123', 'ver')).toBe('ver2024-4.123')
    expect(prefix('2024-4.123', 'ver-')).toBe('ver-2024-4.123')
})

test('suffix', () => {
    expect(suffix('2024-4.123', '-something')).toBe('2024-4.123-something')
})

test('clean', () => {
    expect(clean(' a=2024-4.123-something ')).toBe('2024-4.123')
})

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
    // MINOR absent in string sets minor=0; the MINOR group (and its preceding separator) must be optional in the regex.
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

    // YYYY-MM-DD-MINOR (c4mbr0nn3's case)
    expect(
        cycle('2000-02-10', { cycle: 'auto', format: 'YYYY-MM-DD-MINOR' }),
    ).toBe('2000-2-10-1')
    expect(
        cycle('2000-01-05', {
            cycle: 'auto',
            format: 'YYYY-MM-DD-MINOR',
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
