# Variables

This document uses only these variables for all paths and names.

```sh
export TARGET_DIRECTORY=...
export PACKAGE_NAME=...
export PACKAGE_VERSION=...
export PACKAGE_LICENSE=...
export PACKAGE_DESCRIPTION=...
export PACKAGE_AUTHOR=...
export COPYRIGHT_YEAR=...
```

| Name | Definition |
| --- | --- |
| `TARGET_DIRECTORY` | Directory of the package that you will publish. This path is from the repository root. |
| `PACKAGE_NAME` | The `name` field on npm. |
| `PACKAGE_VERSION` | The `version` field for the first publish. |
| `PACKAGE_LICENSE` | SPDX license identifier. |
| `PACKAGE_DESCRIPTION` | The `description` field in `package.json`. You can use the first sentence of the README. |
| `PACKAGE_AUTHOR` | Copyright name in the LICENSE file. |
| `COPYRIGHT_YEAR` | Copyright year in the LICENSE file. |

# Limits of this document

This procedure ends with the first `npm publish`.

Do these tasks after this procedure:

- GitHub Actions and release-please
- `npm publish --provenance` and the `repository` field in `package.json`
- A CHANGELOG that a tool writes
- Updates of dependencies with Renovate

# Published package

Make `$TARGET_DIRECTORY` a package that you can install, build, and publish without the other packages.

This procedure is for a library with one entry.
If the package is a CLI or has more than one entry, add `exports`.

| Item | Value |
| --- | --- |
| `name` | `$PACKAGE_NAME` |
| `private` | Do not include this field |
| `version` | `$PACKAGE_VERSION` |
| `description` and `license` | `$PACKAGE_DESCRIPTION` and `$PACKAGE_LICENSE` |
| Build output | ESM and type files in `dist` (`.mjs` and `.d.mts`) |
| `files` | `["dist"]` |
| `build` | `tsdown` and `prepublishOnly` |
| `devDependencies` | Use version numbers. Do not use `catalog:`. You must be able to install and build this package without the other packages. |
| `LICENSE` | `$PACKAGE_LICENSE` in the repository root |
| README | You must be able to install and import the package with `$PACKAGE_NAME` |

# Step 1. (Human) Set the values before you publish

## 1-1. Log in to npm

```sh
npm whoami
```

If `npm whoami` does not show your name, do `npm login`.
The first publish of a public package must use `npm publish --access public`.

## 1-2. License and author

Set the variables.
The Copyright line in the LICENSE file must use `$PACKAGE_AUTHOR`.
If the name is not `$PACKAGE_AUTHOR`, change the name in this step.

## 1-3. Description

Set `$PACKAGE_DESCRIPTION`.
You can use the first sentence of the README.

# Step 2. (AI) Remove old names and old paths

## Prompt

Make the old repository names and old layout names in `$TARGET_DIRECTORY` the same as the publish name `$PACKAGE_NAME`.
Do not change the function of the package.

- If a `scripts` field in `package.json` has a path that is not in this repository, change the path to `$TARGET_DIRECTORY`.
- Change old package names in `$TARGET_DIRECTORY/README.md` to `$PACKAGE_NAME`. Change the title, the import statements, and the filter examples.
- Do not change the public API in the source.

# Step 3. (AI) `package.json` and build for publish

## Prompt

Change `$TARGET_DIRECTORY/package.json` to the values in Published package.
Do not add CI.

Do this:

1. Remove the `private` field. Set `version` to `$PACKAGE_VERSION`. Set `description` and `license` to the values from Step 1.
2. Use `tsdown` to build `src/index.ts` as ESM. Write the `.mjs` and `.d.mts` files in `dist`.
3. Set `exports`, `main`, `types`, `files`, and `type` to the values in Published package. Publish only the files in `dist`.
4. Add a `build` script and a `prepublishOnly` script. Make the `prepublishOnly` script call `build`. Write the commands for the package manager of this workspace.
5. Remove `catalog:`. Use version numbers for the packages that the build uses. Keep the dependencies that only the tests use in `devDependencies`. Do not put these dependencies in the published tarball.
6. Do not use a path that is not in this repository in the test scripts and the benchmark scripts.
7. In `$TARGET_DIRECTORY`, do install, then build, then `npm pack --dry-run`. Make sure that the tarball includes only `dist`, `package.json`, the README, and the LICENSE. Make sure that the tarball does not include `src` or the tests.

Do not do this:

- Do not add GitHub Actions.
- Do not add a token to `.npmrc`.
- Do not add the `repository` field.
- Do not use `--provenance`.

# Step 4. (AI) LICENSE and README

## Prompt

Change only the documents that the first publish uses.

1. Put a LICENSE file for `$PACKAGE_LICENSE` in the repository root. Set the copyright year to `$COPYRIGHT_YEAR`. Set the author name to the name from Step 1-2.
2. Set the package name in `$TARGET_DIRECTORY/README.md` to `$PACKAGE_NAME`. Make sure that the start of the README includes `npm install $PACKAGE_NAME`. Make sure that the start of the README includes `import { ... } from "$PACKAGE_NAME"`. Keep only the filter examples that you can run in this repository.
3. If the repository root does not have a `.gitignore` file, add a `.gitignore` file. Include at least `node_modules`, `dist`, and `*.tgz`.

# Step 5. (Human) Publish the package

Go to `$TARGET_DIRECTORY`.
Look at the files. Then publish the package.

```sh
cd "$TARGET_DIRECTORY"
npm run build
npm pack --dry-run
npm publish --access public
npm view "$PACKAGE_NAME" name version
```

Look at the output of `npm pack --dry-run`.
If the output shows `src`, the tests, a development directory, or an old name, do not publish.
