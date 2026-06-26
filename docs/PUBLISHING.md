# Publishing calver-next to npm

## Prerequisites

-   Node.js installed
-   An npm account ([sign up](https://www.npmjs.com/signup))

## First-time setup

```sh
# Log in to npm (creates ~/.npmrc with auth token)
npm login
```

## Publish a new version

```sh
# 1. Make your code changes and commit them

# 2. Verify everything works
pnpm test
pnpm run build

# 3. Bump the version in package.json
#    Use calver-style: YYYY.M (year.month)
#    Example: 25.6.0 → 25.7.0 for July 2025

# 4. Commit the version bump
git add package.json
git commit -m "chore: bump version to 25.7.0"

# 5. Publish
npm publish

# 6. Push to GitHub
git push
```

## Update an existing package

```sh
# Same steps as above — npm publish uploads a new version,
# just make sure you bumped package.json version first.
# npm rejects re-publishing the same version number.
```

## Checklist before publishing

-   [ ] `pnpm test` passes
-   [ ] `pnpm run build` passes
-   [ ] `package.json` version is higher than the published one
-   [ ] `dist/` is regenerated (`pnpm run build`)
-   [ ] Changes are committed to git

## Verify it's live

```sh
npm view calver-next
```
