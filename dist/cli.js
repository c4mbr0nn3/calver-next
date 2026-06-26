#!/usr/bin/env node
import { Command } from 'commander'
import {
    CALVER_CYCLES,
    cycle,
    initial,
    valid,
    nt,
    ot,
    prefix,
    suffix,
    clean,
    isCycleValid,
} from './index.js'

var name = 'calver-next'
var version = '25.6.0'
var description =
    'Calendar based software versioning library with custom format string support. Fork of node-calver.'
var pkg = {
    name: name,
    version: version,
    description: description,
}

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
    .action((str, options) => {
        const next = cycle(str, {
            cycle: options.cycle,
            ...(options.format !== void 0 ? { format: options.format } : {}),
            ...(options.showZeroMinor
                ? { showZeroMinor: options.showZeroMinor }
                : {}),
        })
        console.log(next)
    })
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
    .action((options) => {
        const initialVersion = initial({
            cycle: options.cycle,
            ...(options.format !== void 0 ? { format: options.format } : {}),
            ...(options.showZeroMinor
                ? { showZeroMinor: options.showZeroMinor }
                : {}),
        })
        console.log(initialVersion)
    })
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
    .action((str, options) => {
        const validVersion = valid(str, {
            cycle: options.cycle,
            ...(options.format !== void 0 ? { format: options.format } : {}),
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
    .action((str, str2, options) => {
        const isNewer = nt(str, str2, {
            cycle: options.cycle,
            ...(options.format !== void 0 ? { format: options.format } : {}),
        })
        if (!isNewer) {
            throw new Error(
                'The version ' + str + ' is not newer than the ' + str2,
            )
        }
        console.log(str)
    })
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
    .action((str, str2, options) => {
        const isNewer = ot(str, str2, {
            cycle: options.cycle,
            ...(options.format !== void 0 ? { format: options.format } : {}),
        })
        if (!isNewer) {
            throw new Error(
                'The version ' + str + ' is not older than the ' + str2,
            )
        }
        console.log(str)
    })
program
    .command('prefix')
    .argument('<string>', 'version string')
    .option('--prefix <string>', 'The prefix.', 'v')
    .action((str, options) => {
        console.log(prefix(str, options.prefix))
    })
program
    .command('suffix')
    .argument('<string>', 'version string')
    .option('--suffix <string>', 'The suffix.')
    .action((str, options) => {
        console.log(suffix(str, options.suffix))
    })
program
    .command('clean')
    .argument('<string>', 'version string')
    .action((str) => {
        console.log(clean(str))
    })
program.parse()
function parseCycleArg(value) {
    if (!isCycleValid(value)) {
        throw new Error(
            'Invalid release cycle: the valid values are ' +
                CALVER_CYCLES.join(', '),
        )
    }
    return value
}
function parseCycleArgStrict(value) {
    if (!isCycleValid(value, false)) {
        throw new Error(
            'Invalid release cycle: the valid values are ' +
                CALVER_CYCLES.filter((v) => v !== 'auto').join(', '),
        )
    }
    return value
}
