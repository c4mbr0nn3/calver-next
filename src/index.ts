const CALVER_RE_SYNTAX = /^[0-9]{4}(-[0-9]{1,2}(-[0-9]{1,2})?)?(\.[0-9]+)?$/
const CALVER_SEARCH_RE_SYNTAX =
    /[0-9]{4}(-[0-9]{1,2}(-[0-9]{1,2})?)?(\.[0-9]+)?/
const CALVER_CALENDAR_PORTION_SEPARATOR = '-'
const CALVER_MINOR_PORTION_SEPARATOR = '.'
const CALVER_NUMBER_OF_WEEKS_IN_A_YEAR = 54
const CALVER_NUMBER_OF_MONTHS_IN_A_YEAR = 12
const CALVER_NUMBER_OF_DAYS_IN_A_MONTH = 31
export const CALVER_CYCLES: CalVerCycle[] = [
    'auto',
    'year',
    'month',
    'week',
    'day',
]

export function clean(str: string) {
    const result = str.match(CALVER_SEARCH_RE_SYNTAX)

    if (!result) {
        throw new Error(
            'Failed to clean the text that was supposed to contain a calver version.',
        )
    }

    return result[0]
}

export function suffix(str: string, suffix: string) {
    return str + (suffix ?? '')
}

export function prefix(str: string, prefix: string = 'v') {
    return (prefix ?? '') + str
}

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

    if (settings.format !== undefined) {
        const fmt = parseFormat(settings.format)
        const inferred = inferCycleFromFormat(fmt)
        if (settings.cycle !== 'auto' && settings.cycle !== inferred) {
            throw new Error('Version and cycle mismatch.')
        }
        const tagSet: ReadonlySet<string> = new Set(fmt.tags)
        if (tagSet.has('MM') || tagSet.has('0M'))
            result.month = currentDate.month
        if (tagSet.has('WW') || tagSet.has('0W')) result.week = currentDate.week
        if (tagSet.has('DD') || tagSet.has('0D')) {
            result.month = currentDate.month
            result.day = currentDate.day
        }
        return toString(result, fmt, settings.showZeroMinor ?? false)
    }

    if (cycle === 'month') result.month = currentDate.month
    if (cycle === 'week') result.week = currentDate.week
    if (cycle === 'day') {
        result.month = currentDate.month
        result.day = currentDate.day
    }

    return toString(result)
}

export function nt(
    newer: string,
    older: string,
    settings: CalVerCycleSettings = { cycle: 'auto' },
) {
    const n = parse(newer, {
        cycle: settings.cycle,
        ...(settings.format !== undefined ? { format: settings.format } : {}),
    })
    const o = parse(older, {
        cycle: settings.cycle,
        ...(settings.format !== undefined ? { format: settings.format } : {}),
    })

    const isWeek =
        settings.cycle === 'week' ||
        (settings.cycle === 'auto' &&
            settings.format !== undefined &&
            inferCycleFromFormat(parseFormat(settings.format)) === 'week')

    if (isWeek) {
        if (typeof n.week !== 'number') n.week = 0
        if (typeof o.week !== 'number') o.week = 0

        if (n.year !== o.year) return n.year > o.year
        if (n.week !== o.week) return n.week > o.week
        return settings.format !== undefined && n.minor > o.minor
    }

    const versionDateNative = new Date(
        n.year,
        typeof n.month === 'number' ? n.month - 1 : 0,
        n.day ?? 0,
    )
    const currentDateNative = new Date(
        o.year,
        typeof o.month === 'number' ? o.month - 1 : 0,
        o.day ?? 0,
    )
    const cmp = versionDateNative.getTime() - currentDateNative.getTime()
    if (cmp > 0) return true
    if (cmp < 0) return false
    return settings.format !== undefined && n.minor > o.minor
}

export function ot(
    older: string,
    newer: string,
    settings: CalVerCycleSettings = { cycle: 'auto' },
) {
    return nt(newer, older, settings)
}

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
        if (fmt !== undefined && !fmt.tags.includes('MINOR')) {
            throw new Error(
                'Cannot increment: the format has no MINOR tag. Add MINOR to the format string to allow same-period increments.',
            )
        }
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

export function valid(
    str: string,
    settings: CalVerValidSettings = { cycle: 'auto' },
) {
    try {
        parse(str, {
            cycle: settings.cycle,
            ...(settings.format !== undefined
                ? { format: settings.format }
                : {}),
        })
        return str
    } catch (e) {
        throw e
    }
}

function getCurrentDate(): CalVerCurrentDateObject {
    const date = new Date(Date.now())

    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        week: getUtcWeek(date),
        day: date.getUTCDate(),
    }

    function getUtcWeek(date: Date) {
        const _date = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
        )
        const dayNum = _date.getUTCDay() || 7

        _date.setUTCDate(_date.getUTCDate() + 4 - dayNum)

        const yearStart = new Date(Date.UTC(_date.getUTCFullYear(), 0, 1))

        // @ts-ignore
        return Math.ceil(((_date - yearStart) / 86400000 + 1) / 7)
    }
}

export function parse(
    str: string,
    settings: CalVerCycleSettings = { cycle: 'auto' },
) {
    if (settings.format !== undefined) {
        const fmt = parseFormat(settings.format)
        const re = compileFormatRegex(fmt)
        const match = str.match(re)
        if (!match) {
            throw new Error(
                "Invalid calver string: doesn't match format " +
                    settings.format,
            )
        }
        return parseWithFormatMatch(settings, fmt, match)
    }

    return parseStandard(str, settings)
}

function parseStandard(
    str: string,
    settings: CalVerCycleSettings,
): CalVerObject {
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

function parseWithFormatMatch(
    settings: CalVerCycleSettings,
    fmt: CalVerFormat,
    match: RegExpMatchArray,
): CalVerObject {
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

export function isCycleValid(
    str: string,
    allowAuto: boolean = true,
): str is CalVerCycle {
    return (
        CALVER_CYCLES.includes(str as any) &&
        (allowAuto ? true : str !== 'auto')
    )
}

export interface CalVerObject {
    year: number
    month?: number
    week?: number
    day?: number
    minor: number
}

export type CalVerCycle = 'year' | 'month' | 'week' | 'day' | 'auto'

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

export interface CalVerCurrentDateObject {
    year: number
    month: number
    week: number
    day: number
}

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
