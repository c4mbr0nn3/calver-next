# AGENTS.md

Compact guidance for OpenCode sessions working in this repo.

## Commands

Package manager is **pnpm** (husky hooks call `pnpm exec`; a `package-lock.json` also exists but pnpm is canonical).

-   `pnpm test` — run tests (`vitest run`)
-   `pnpm test -- <pattern>` or `pnpm exec vitest run src/index.test.ts -t "name"` — single test / single file
-   `pnpm lint` — ESLint, type-checked (`recommendedTypeChecked`); lint before commit
-   `pnpm format` — Prettier write across repo
-   `pnpm run build` — `pkgroll` regenerates `dist/` (ESM + CJS + `.d.ts`). `dist/` is a build artifact, do not hand-edit.
-   Typecheck: no npm script; use `pnpm exec tsc --noEmit -p tsconfig.json`. `tsconfig.json` also includes `eslint.config.js` and `prettier.config.js`.

Suggested order before pushing changes: `lint -> typecheck -> test -> build`.

## Architecture

-   `src/index.ts` — library API (`cycle`, `minor`, `initial`, `valid`, `nt`, `ot`, `prefix`, `suffix`, `clean`, `isCycleValid`, `CALVER_CYCLES`). Calendar portion separated by `-`, minor by `.`.
-   `src/cli.ts` — CLI entry (`bin: calver`). `cycle` is the **default** command (`calver 2024-4.204` == `calver cycle 2024-4.204`). Uses `commander`.
-   `src/index.test.ts` — only test file, colocated with source.
-   Public package exports dual ESM/CJS via `package.json` `exports` + `dist/`.

## Conventions and gotchas

-   TypeScript is **strict** with `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`. Use `import { type X }` / `import type` for type-only imports; mixed value+type imports are written as `import { foo, type Bar } from ...`.
-   Source uses `.js` specifiers in TS imports (Bundler/ESM resolution), e.g. `from './index.js'`. Match this.
-   Prettier: **4-space indent, no semicolons, single quotes.** Match exactly; lint-staged runs Prettier on all staged files.
-   Calver week cycle is the one case that requires an explicit `--cycle week` / `{ cycle: 'week' }` option (cannot be auto-detected).
-   Date math uses **UTC**. Unspecified month/week/day are treated as zero for comparisons.

## Commits and releases

-   Commit messages must follow **Conventional Commits** (`commitlint` with `@commitlint/config-conventional`); enforced by `commit-msg` hook. Types: build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test.
-   Pre-commit hook runs `lint-staged` (Prettier) only — it does **not** run tests or lint beyond formatting. Run lint/typecheck/test manually.
-   Versioning and publishing are handled by [node-releaser](https://github.com/muratgozel/node-releaser) via `.releaser.json` (scheme: semver, no prefix; npm publish + GitHub release enabled). Do not bump `package.json` version by hand unless releasing.
