# AGENTS.md

Compact guidance for OpenCode sessions working in this repo.

## Project status

**calver-next** is a fork of [node-calver](https://github.com/muratgozel/node-calver) by Murat Gözel (MIT, original copyright preserved). The fork adds custom format string support (issue #26) and is maintained by [c4mbr0nn3](https://github.com/c4mbr0nn3).

- **Package:** `calver-next` on npm
- **Repo:** `github.com/c4mbr0nn3/calver-next`
- **CLI binary:** `calver-next`
- **Versioning:** calver-style `YYYY.M.MINOR`, bumped manually in `package.json` before publish (no automated releaser)
- **Publishing:** see `docs/PUBLISHING.md`

## Commands

Package manager is **pnpm** (husky hooks call `pnpm exec`; a `package-lock.json` also exists but pnpm is canonical).

- `pnpm test` — run tests (`vitest run`)
- `pnpm test -- <pattern>` or `pnpm exec vitest run src/index.test.ts -t "name"` — single test / single file
- `pnpm lint` — ESLint, type-checked (`recommendedTypeChecked`); lint before commit
- `pnpm format` — Prettier write across repo
- `pnpm run build` — `pkgroll` regenerates `dist/` (ESM + CJS + `.d.ts`). `dist/` is a build artifact, do not hand-edit.
- Typecheck: no npm script; use `pnpm exec tsc --noEmit -p tsconfig.json`. `tsconfig.json` also includes `eslint.config.js` and `prettier.config.js`.

Suggested order before pushing changes: `lint -> typecheck -> test -> build`.

## Architecture

- `src/format.ts` — format string subsystem (`parseFormat`, `compileFormatRegex`, `inferCycleFromFormat`, `toStringWithFormat`, `CalVerFormat`, `CalVerFormatTag`). Pure functions, no side effects. Imported by `src/index.ts`.
- `src/index.ts` — library API (`cycle`, `initial`, `valid`, `nt`, `ot`, `prefix`, `suffix`, `clean`, `isCycleValid`, `CALVER_CYCLES`, plus re-exports from `format.ts`). Default format is `YYYY-MM-DD.MINOR` (calendar separated by `-`, minor by `.`). When `settings.format` is provided, parsing/serialization uses the custom format instead.
- `src/cli.ts` — CLI entry (`bin: calver-next`). `cycle` is the **default** command (`calver-next 2024-4.204` == `calver-next cycle 2024-4.204`). Uses `commander`. Flags: `-c/--cycle`, `-f/--format`, `-z/--show-zero-minor`.
- `src/index.test.ts` — only test file, colocated with source. 20 tests covering both legacy and custom-format paths.
- Public package exports dual ESM/CJS via `package.json` `exports` + `dist/`.

### Custom format feature

Format strings use tags (`YYYY`, `MM`, `0M`, `WW`, `0W`, `DD`, `0D`, `MINOR`) with arbitrary literal separators. When a `format` is provided:

- Cycle is inferred from the calendar tags present (year/month/week/day). An explicit `cycle` is validated against the inferred cycle.
- `MINOR` is optional in the format. If absent, no minor counter is parsed or emitted.
- `showZeroMinor` (default `false`) controls whether `MINOR` is emitted when it's `0`. When `false`, the MINOR tag and its preceding separator are omitted.
- `parse` throws if the input doesn't match the format regex (no silent fallback to legacy parsing).
- `cycle` throws if a same-period bump is requested but the format has no `MINOR` tag.
- `initial` validates `cycle` against the format's inferred cycle.

Design spec: `docs/superpowers/specs/2026-06-26-custom-format-support-design.md`
Implementation plan: `docs/superpowers/plans/2026-06-26-custom-format-support.md`

## Conventions and gotchas

- TypeScript is **strict** with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Use `import { type X }` / `import type` for type-only imports; mixed value+type imports are written as `import { foo, type Bar } from ...`.
- Source uses `.js` specifiers in TS imports (Bundler/ESM resolution), e.g. `from './index.js'`. Match this.
- Prettier: **4-space indent, no semicolons, single quotes.** Match exactly; lint-staged runs Prettier on all staged files.
- Calver week cycle is the one case that requires an explicit `--cycle week` / `{ cycle: 'week' }` option when no format is set (cannot be auto-detected). With a format containing `0W`/`WW`, week is auto-detected.
- Date math uses **UTC**. Unspecified month/week/day are treated as zero for comparisons.
- `exactOptionalPropertyTypes` means optional fields cannot be set to `undefined`; use conditional spread `...(cond ? { field: val } : {})` to conditionally include them.

## Commits and releases

- Commit messages must follow **Conventional Commits** (`commitlint` with `@commitlint/config-conventional`); enforced by `commit-msg` hook. Types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test.
- Pre-commit hook runs `lint-staged` (Prettier) only — it does **not** run tests or lint beyond formatting. Run lint/typecheck/test manually.
- Versioning: calver-style (`YYYY.M.MINOR`), bumped manually in `package.json` before publish. No automated releaser — `node-releaser` and `.releaser.json` were removed in the fork.
- Publishing: `npm publish` after bumping version and rebuilding `dist/`. See `docs/PUBLISHING.md`.

## Known issues

- Pre-existing typecheck error in `eslint.config.js` (`@eslint/js` missing type declarations) — not introduced by the fork; will be resolved when the ESLint ecosystem packages are updated (eslint 10 + @eslint/js 10 + typescript-eslint 8).
- Several devDependencies are outdated by major versions (typescript 5→6, vitest 1→4, eslint 9→10, commander 12→15, commitlint 19→21, lint-staged 15→17). These require careful testing before updating.
