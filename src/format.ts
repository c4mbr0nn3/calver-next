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
