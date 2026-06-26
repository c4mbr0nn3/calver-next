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

import type { CalVerObject } from './index.js'

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
