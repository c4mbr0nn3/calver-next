'use strict'

const CALVER_FORMAT_TAGS = ['YYYY', 'MINOR', '0M', 'MM', '0W', 'WW', '0D', 'DD']
function parseFormat(format) {
    if (format.length === 0) {
        throw new Error('Invalid calver format: format string is empty.')
    }
    const tags = []
    const separators = []
    const seen = /* @__PURE__ */ new Set()
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
                sep += format[i]
                i += 1
            }
            if (atTagPosition) {
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
    if (separators.length > tags.length - 1) {
        separators.pop()
    }
    return { tags, separators }
}
function matchTag(str, pos) {
    for (const tag of CALVER_FORMAT_TAGS) {
        if (str.slice(pos, pos + tag.length) === tag) {
            return tag
        }
    }
    return null
}
const CALVER_TAG_REGEX_PARTS = /* @__PURE__ */ new Map([
    ['YYYY', '(\\d{4})'],
    ['MM', '(\\d{1,2})'],
    ['0M', '(\\d{2})'],
    ['WW', '(\\d{1,2})'],
    ['0W', '(\\d{2})'],
    ['DD', '(\\d{1,2})'],
    ['0D', '(\\d{2})'],
    ['MINOR', '(\\d+)'],
])
function compileFormatRegex(fmt) {
    let pattern = '^'
    for (let i = 0; i < fmt.tags.length; i++) {
        const tag = fmt.tags[i]
        const part = CALVER_TAG_REGEX_PARTS.get(tag)
        if (part === void 0) {
            throw new Error('Invalid calver format: unknown tag ' + tag + '.')
        }
        if (tag === 'MINOR') {
            const sep = i > 0 ? fmt.separators[i - 1] : ''
            const escapedSep = escapeRegex(sep)
            pattern += '(?:' + escapedSep + part + ')?'
        } else {
            if (i > 0) {
                pattern += escapeRegex(fmt.separators[i - 1])
            }
            pattern += part
        }
    }
    pattern += '$'
    return new RegExp(pattern)
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function inferCycleFromFormat(fmt) {
    const tagSet = new Set(fmt.tags)
    if (tagSet.has('DD') || tagSet.has('0D')) return 'day'
    if (tagSet.has('WW') || tagSet.has('0W')) return 'week'
    if (tagSet.has('MM') || tagSet.has('0M')) return 'month'
    return 'year'
}
function toStringWithFormat(obj, fmt, showZeroMinor) {
    let result = ''
    for (let i = 0; i < fmt.tags.length; i++) {
        const tag = fmt.tags[i]
        if (tag === 'MINOR') {
            if (showZeroMinor || obj.minor > 0) {
                const sep = i > 0 ? fmt.separators[i - 1] : ''
                result += sep + obj.minor.toString(10)
            }
            continue
        }
        if (i > 0) {
            result += fmt.separators[i - 1]
        }
        const value = getTagValue(obj, tag)
        if (value === null) {
            result += tag.startsWith('0') ? '00' : '0'
        } else {
            result += tag.startsWith('0')
                ? value.toString(10).padStart(2, '0')
                : value.toString(10)
        }
    }
    return result
}
function getTagValue(obj, tag) {
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

const CALVER_RE_SYNTAX = /^[0-9]{4}(-[0-9]{1,2}(-[0-9]{1,2})?)?(\.[0-9]+)?$/
const CALVER_SEARCH_RE_SYNTAX =
    /[0-9]{4}(-[0-9]{1,2}(-[0-9]{1,2})?)?(\.[0-9]+)?/
const CALVER_CALENDAR_PORTION_SEPARATOR = '-'
const CALVER_MINOR_PORTION_SEPARATOR = '.'
const CALVER_NUMBER_OF_WEEKS_IN_A_YEAR = 54
const CALVER_NUMBER_OF_MONTHS_IN_A_YEAR = 12
const CALVER_NUMBER_OF_DAYS_IN_A_MONTH = 31
const CALVER_CYCLES = ['auto', 'year', 'month', 'week', 'day']
function clean(str) {
    const result = str.match(CALVER_SEARCH_RE_SYNTAX)
    if (!result) {
        throw new Error(
            'Failed to clean the text that was supposed to contain a calver version.',
        )
    }
    return result[0]
}
function suffix(str, suffix2) {
    return str + (suffix2 ?? '')
}
function prefix(str, prefix2 = 'v') {
    return (prefix2 ?? '') + str
}
function initial(settings) {
    if (!isCycleValid(settings.cycle, false)) {
        throw new Error('Invalid release cycle')
    }
    const cycle2 = settings.cycle
    const currentDate = getCurrentDate()
    const result = {
        year: currentDate.year,
        minor: 0,
    }
    if (settings.format !== void 0) {
        const fmt = parseFormat(settings.format)
        const tagSet = new Set(fmt.tags)
        if (tagSet.has('MM') || tagSet.has('0M'))
            result.month = currentDate.month
        if (tagSet.has('WW') || tagSet.has('0W')) result.week = currentDate.week
        if (tagSet.has('DD') || tagSet.has('0D')) {
            result.month = currentDate.month
            result.day = currentDate.day
        }
        return toString(result, fmt, settings.showZeroMinor ?? false)
    }
    if (cycle2 === 'month') result.month = currentDate.month
    if (cycle2 === 'week') result.week = currentDate.week
    if (cycle2 === 'day') {
        result.month = currentDate.month
        result.day = currentDate.day
    }
    return toString(result)
}
function nt(newer, older, settings = { cycle: 'auto' }) {
    const n = parse(newer, {
        cycle: settings.cycle,
        ...(settings.format !== void 0 ? { format: settings.format } : {}),
    })
    const o = parse(older, {
        cycle: settings.cycle,
        ...(settings.format !== void 0 ? { format: settings.format } : {}),
    })
    const isWeek =
        settings.cycle === 'week' ||
        (settings.cycle === 'auto' &&
            settings.format !== void 0 &&
            inferCycleFromFormat(parseFormat(settings.format)) === 'week')
    if (isWeek) {
        if (typeof n.week !== 'number') n.week = 0
        if (typeof o.week !== 'number') o.week = 0
        if (n.year !== o.year) return n.year > o.year
        if (n.week !== o.week) return n.week > o.week
        return settings.format !== void 0 && n.minor > o.minor
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
    return settings.format !== void 0 && n.minor > o.minor
}
function ot(older, newer, settings = { cycle: 'auto' }) {
    return nt(newer, older, settings)
}
function cycle(str, settings = { cycle: 'auto' }) {
    const version = parse(str, settings)
    const fmt =
        settings.format !== void 0 ? parseFormat(settings.format) : void 0
    const cycle2 =
        fmt !== void 0
            ? settings.cycle !== 'auto'
                ? settings.cycle
                : inferCycleFromFormat(fmt)
            : settings.cycle !== 'auto'
              ? settings.cycle
              : findCycle(version)
    const currentDate = getCurrentDate()
    const next = Object.assign({}, version)
    const isFuture = newerThan(version, currentDate)
    if (isFuture) {
        next.minor += 1
    } else if (cycle2 === 'year' && version.year !== currentDate.year) {
        next.year = currentDate.year
        next.minor = 0
    } else if (
        cycle2 === 'month' &&
        (version.month !== currentDate.month ||
            version.year !== currentDate.year)
    ) {
        next.year = currentDate.year
        next.month = currentDate.month
        next.minor = 0
    } else if (
        cycle2 === 'week' &&
        (version.week !== currentDate.week || version.year !== currentDate.year)
    ) {
        next.year = currentDate.year
        next.week = currentDate.week
        next.minor = 0
    } else if (
        cycle2 === 'day' &&
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
    function newerThan(version2, currentDate2) {
        if (typeof version2.week === 'number') {
            return (
                (version2.year >= currentDate2.year &&
                    version2.week > currentDate2.week) ||
                version2.year > currentDate2.year
            )
        }
        const versionDateNative = new Date(
            version2.year,
            typeof version2.month === 'number' ? version2.month - 1 : 0,
            version2.day ?? 0,
        )
        const currentDateNative = new Date(
            currentDate2.year,
            currentDate2.month - 1,
            currentDate2.day,
        )
        return versionDateNative.getTime() > currentDateNative.getTime()
    }
    function findCycle(v) {
        if (typeof v.day === 'number') return 'day'
        else if (typeof v.week === 'number') return 'week'
        else if (typeof v.month === 'number') return 'month'
        else return 'year'
    }
}
function valid(str, settings = { cycle: 'auto' }) {
    try {
        parse(str, {
            cycle: settings.cycle,
            ...(settings.format !== void 0 ? { format: settings.format } : {}),
        })
        return str
    } catch (e) {
        throw e
    }
}
function getCurrentDate() {
    const date = new Date(Date.now())
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        week: getUtcWeek(date),
        day: date.getUTCDate(),
    }
    function getUtcWeek(date2) {
        const _date = new Date(
            Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate()),
        )
        const dayNum = _date.getUTCDay() || 7
        _date.setUTCDate(_date.getUTCDate() + 4 - dayNum)
        const yearStart = new Date(Date.UTC(_date.getUTCFullYear(), 0, 1))
        return Math.ceil(((_date - yearStart) / 864e5 + 1) / 7)
    }
}
function parse(str, settings = { cycle: 'auto' }) {
    if (settings.format !== void 0) {
        const fmt = parseFormat(settings.format)
        const re = compileFormatRegex(fmt)
        const match = str.match(re)
        if (match) {
            return parseWithFormatMatch(settings, fmt, match)
        }
        const result = parseStandard(str, { cycle: 'auto' })
        const inferred = inferCycleFromFormat(fmt)
        if (settings.cycle !== 'auto' && settings.cycle !== inferred) {
            throw new Error('Version and cycle mismatch.')
        }
        return result
    }
    return parseStandard(str, settings)
}
function parseStandard(str, settings) {
    if (!CALVER_RE_SYNTAX.test(str)) {
        throw new Error('Invalid calver string: standard regex check failed')
    }
    const result = {
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
        const value = parseInt(datePortions[1], 10)
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
        const month = parseInt(datePortions[1], 10)
        const day = parseInt(datePortions[2], 10)
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
function parseWithFormatMatch(settings, fmt, match) {
    const result = {
        year: 0,
        minor: 0,
    }
    let groupIndex = 1
    for (const tag of fmt.tags) {
        const captured = match[groupIndex]
        groupIndex += 1
        if (captured === void 0) {
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
    const inferred = inferCycleFromFormat(fmt)
    if (settings.cycle !== 'auto') {
        if (settings.cycle !== inferred) {
            throw new Error('Version and cycle mismatch.')
        }
    }
    return result
}
function toString(obj, fmt, showZeroMinor = false) {
    if (fmt !== void 0) {
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
function isCycleValid(str, allowAuto = true) {
    return CALVER_CYCLES.includes(str) && (allowAuto ? true : str !== 'auto')
}

exports.CALVER_CYCLES = CALVER_CYCLES
exports.clean = clean
exports.compileFormatRegex = compileFormatRegex
exports.cycle = cycle
exports.inferCycleFromFormat = inferCycleFromFormat
exports.initial = initial
exports.isCycleValid = isCycleValid
exports.nt = nt
exports.ot = ot
exports.parse = parse
exports.parseFormat = parseFormat
exports.prefix = prefix
exports.suffix = suffix
exports.toString = toString
exports.toStringWithFormat = toStringWithFormat
exports.valid = valid
