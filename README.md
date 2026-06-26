# calver-next

Calendar based software versioning library as node.js module and with cli support. 📅

**Fork of [node-calver](https://github.com/muratgozel/node-calver) with custom format string support** (see [issue #26](https://github.com/muratgozel/node-calver/issues/26)).

## What is calendar based versioning?

It's a way of tagging software state based on in combination of a chosen calendar tags such as YYYY, MM, DD. The chosen tags convey the message of how frequently the software gets major updates, to the user. It doesn't tell anything about breaking changes (there is [git-diff](https://git-scm.com/docs/git-diff) for that) but it tells when the next major release will come.

I recommend [this article by Donald Stufft](https://caremad.io/posts/2016/02/versioning-software/) to read more about versioning softwares and [this website by Mahmoud Hashemi](https://calver.org) to learn more about calendar versioning.

## What does it look like?

The format consist of two parts. The calendar part and the minor changes counter. The calendar part describes software's release cycle. The minor part is just a counter over the main release. Take **2024-4.104** for example; the year and the month separated by a dash and the minor counter separated by a dot. So the general template for the format is `YYYY-MM-DD.MINOR`. One might choose:

- YYYY for yearly release cycle
- YYYY-MM for monthly release cycle
- YYYY-WW for weekly release cycle
- YYYY-MM-DD for daily release cycle

The releases sent before the next release time period, counts as minor changes and therefore it increments the minor part of the version.

## Prerequisites

- What is your release cycle? Decide how frequently you will release your software. Excluding minor changes such as security fixes or other kind of features and fixes.

## Install

```sh
npm i -D calver-next
# or
pnpm add -D calver-next
```

## Usage

The library can be used both as a node.js module and a cli app. Both usages documented below per feature.

### Library defaults

There are some defaults to keep in mind while using calver-next.

- Minor counter is 0 by default and it's hidden from the output if it's zero.
- The values of calendar tags computed based on UTC time.
- The year always exists in the output and can't be omitted. The other tags is up to a user.
- When month, week or day isn't specified, they are considered as zero and this is important when comparing dates.

### Cycles

Finds the next version based on release cycle.

```ts
import * as calver from 'calver-next'

calver.cycle('2024-4.204')
```

```sh
calver-next 2024-4.204
```

Depending on the date the code above executed, the output will be `2024-4.205`, `2024-5` or `2024-[current month]`.

It's capable to understand the format you chose with one exception.

```ts
calver.cycle('2024.204')
```

```sh
calver-next 2024.204
```

Outputs `2024.205` or `[current year]`.

The full year, month and day cycle:

```ts
calver.cycle('2024-4-16.204')
```

```sh
calver-next 2024-4-16.204
```

Outputs `2024-4-16.205` or `[current date as YYYY-MM-DD]`.

And the exception is weeks. A cycle option needs to be passed for weekly release cycles:

```ts
calver.cycle('2024-32.204', { cycle: 'week' })
```

```sh
calver-next 2024-32.204 --cycle week # or -c week
```

Outputs `2024-32.205` or `2024-[current week of the year]`.

### Custom formats

By default, calver-next uses the `YYYY-MM-DD.MINOR` format (dash-separated
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
import * as calver from 'calver-next'

calver.cycle('2024.04.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' })
// → '2024.04.07.2' (or next day/month/year depending on current date)

calver.initial({ cycle: 'day', format: 'YYYY.0M.0D.MINOR' })
// → '2024.06.26' (current UTC date, zero minor hidden by default)

calver.valid('2024.04.07.1', { cycle: 'auto', format: 'YYYY.0M.0D.MINOR' })
// → '2024.04.07.1'
```

```sh
calver-next 2024.04.07.1 --format YYYY.0M.0D.MINOR
calver-next initial --cycle day --format YYYY.0M.0D.MINOR
calver-next valid 2024.04.07.1 --format YYYY.0M.0D.MINOR
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
calver-next initial --cycle day --format YYYY.0M.0D.MINOR --show-zero-minor
```

### Minor releases

A minor method just increments the minor portion of the version and leaves the date portion as it is.

```ts
calver.minor('2024') // outputs 2024.1
```

```sh
calver-next 2024 --minor # outputs 2024.1
```

```ts
calver.minor('2024.204') // outputs 2024.205
```

```sh
calver-next 2024.204 --minor # outputs 2024.205
```

```ts
calver.minor('2024-4-16.204') // outputs 2024-4-16.205
```

```sh
calver-next 2024-4-16.204 --minor # outputs 2024-4-16.205
```

and so on.

### Create an initial version

```ts
calver.initial({ cycle: 'month' })
```

```sh
calver-next initial --cycle month
```

Outputs `[current year]-[current month]`.

### Valid

```ts
calver.valid('2024-4.123')
// provide cycle for more strict check
calver.valid('2024-4.123', { cycle: 'month' })
```

Outputs a `boolean`.

```sh
calver-next valid 2024-4.123
# or specify --cycle flag for more strict check
calver-next valid --cycle month
```

Outputs the exact version string or exits with error.

### Comparison

```ts
// newer than
calver.nt('2024-4-20', '2024-4-19') // true
calver.nt('2024-4-20', '2024') // true
calver.nt('2024', '2024-4-20') // false

// older than
calver.ot('2024-4-20', '2024-4-19') // false
calver.ot('2024-4-20', '2024') // false
calver.ot('2024', '2024-4-20') // true

// speciy cycle if you use weeks
calver.nt('2024-32', '2024-30', { cycle: 'week' }) // true
```

Returns a `boolean`

```sh
calver-next nt 2024-4-20 2024-4-19
calver-next ot 2024-4-20 2024-4-19
calver-next nt 2024-32 2024-30 --cycle week
```

Outputs the exact version string or exits with error.

### Prefix, suffix and clean

Simple helper methods that might be useful in your versioning processes.

```ts
calver.prefix('2024-4.123') // outputs v2024-4.123
calver.prefix('2024-4.123', 'v') // outputs v2024-4.123

calver.suffix('2024-4.123', '-something') // outputs 2024-4.123-something

calver.clean(' =v2024-4.123-something ') // 2024-4.123
```

They work same as in the module api:

```sh
calver-next prefix 2024-4.123
calver-next prefix 2024-4.123 --prefix v
calver-next suffix 2024-4.123 --suffix something
calver-next clean " =v2024-4.123-something "
```

## Contributing

If you're interested in contributing, read the [CONTRIBUTING.md](https://github.com/c4mbr0nn3/calver-next/blob/main/CONTRIBUTING.md) first, please.

---

Version management of this repository done by [releaser](https://github.com/muratgozel/node-releaser) 🚀

---

Fork of [node-calver](https://github.com/muratgozel/node-calver) by [Murat Gözel](https://gozel.com.tr). Custom format support by [c4mbr0nn3](https://github.com/c4mbr0nn3).

---

Thanks for watching 🐬
