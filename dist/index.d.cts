declare const CALVER_FORMAT_TAGS: readonly [
    'YYYY',
    'MINOR',
    '0M',
    'MM',
    '0W',
    'WW',
    '0D',
    'DD',
]
type CalVerFormatTag = (typeof CALVER_FORMAT_TAGS)[number]
interface CalVerFormat {
    tags: CalVerFormatTag[]
    separators: string[]
}

declare function parseFormat(format: string): CalVerFormat
declare function compileFormatRegex(fmt: CalVerFormat): RegExp
declare function inferCycleFromFormat(
    fmt: CalVerFormat,
): 'year' | 'month' | 'week' | 'day'
declare function toStringWithFormat(
    obj: CalVerObject,
    fmt: CalVerFormat,
    showZeroMinor: boolean,
): string

declare const CALVER_CYCLES: CalVerCycle[]
declare function clean(str: string): string
declare function suffix(str: string, suffix: string): string
declare function prefix(str: string, prefix?: string): string
declare function initial(settings: CalVerCycleSettings): string
declare function nt(
    newer: string,
    older: string,
    settings?: CalVerCycleSettings,
): boolean
declare function ot(
    older: string,
    newer: string,
    settings?: CalVerCycleSettings,
): boolean
declare function cycle(str: string, settings?: CalVerCycleSettings): string
declare function valid(str: string, settings?: CalVerValidSettings): string
declare function parse(
    str: string,
    settings?: CalVerCycleSettings,
): CalVerObject
declare function toString(
    obj: CalVerObject,
    fmt?: CalVerFormat,
    showZeroMinor?: boolean,
): string
declare function isCycleValid(
    str: string,
    allowAuto?: boolean,
): str is CalVerCycle
interface CalVerObject {
    year: number
    month?: number
    week?: number
    day?: number
    minor: number
}
type CalVerCycle = 'year' | 'month' | 'week' | 'day' | 'auto'
interface CalVerCycleSettings {
    cycle: CalVerCycle
    format?: string
    showZeroMinor?: boolean
}
interface CalVerValidSettings {
    cycle: CalVerCycle
    format?: string
    showZeroMinor?: boolean
}
interface CalVerCurrentDateObject {
    year: number
    month: number
    week: number
    day: number
}

export {
    CALVER_CYCLES,
    type CalVerCurrentDateObject,
    type CalVerCycle,
    type CalVerCycleSettings,
    type CalVerFormat,
    type CalVerFormatTag,
    type CalVerObject,
    type CalVerValidSettings,
    clean,
    compileFormatRegex,
    cycle,
    inferCycleFromFormat,
    initial,
    isCycleValid,
    nt,
    ot,
    parse,
    parseFormat,
    prefix,
    suffix,
    toString,
    toStringWithFormat,
    valid,
}
