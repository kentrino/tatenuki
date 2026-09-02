# Configure npm trusted publishing

Follow this procedure before merging the first Release Please pull request for
a package. Merging that pull request triggers `.github/workflows/release.yml`
and immediately attempts to publish the new version to npm.

This repository publishes without an `NPM_TOKEN`. npm authorizes the
GitHub Actions workflow through OpenID Connect (OIDC).

## 1. Check the package metadata

The published `package.json` must identify the same GitHub repository as the
trusted publisher. For `tatenuki`, make sure that
`packages/tatenuki/package.json` contains:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/kentrino/tatenuki.git",
  "directory": "packages/tatenuki"
}
```

Land this metadata on `main` before merging the release pull request. If the
release pull request is already open, wait for Release Please to update it and
confirm that the field remains in the release version of `package.json`.

## 2. Add the trusted publisher on npm

You must be a package owner and may be asked for two-factor authentication.

1. Open the [`tatenuki` package access settings](https://www.npmjs.com/package/tatenuki/access).
2. Find **Trusted Publisher** and select **GitHub Actions**.
3. Enter these values:
   - Organization or user: `kentrino`
   - Repository: `tatenuki`
   - Workflow filename: `release.yml`
   - Environment name: leave empty
   - Allowed actions: enable `npm publish`
4. Save the trusted publisher.

Enter only `release.yml`, not `.github/workflows/release.yml`. npm does not
validate these values when they are saved, and the values are case-sensitive.
A package can have only one trusted publisher.

Do not create an npm automation token and do not add `NPM_TOKEN` or
`NODE_AUTH_TOKEN` to the publish job. Trusted publishing issues a short-lived
credential for each workflow run.

## 3. Restrict token publishing

After the trusted publisher is saved:

1. On the same package settings page, open **Publishing access**.
2. Select **Require two-factor authentication and disallow tokens**.
3. Save the package settings.

This setting blocks traditional access tokens but continues to allow the
configured trusted publisher.

## 4. Check the GitHub workflow

Before merging a release pull request, confirm that the publish job:

- runs on a GitHub-hosted runner;
- has `id-token: write`;
- has `contents: read`;
- does not set `NPM_TOKEN` or `NODE_AUTH_TOKEN`; and
- uses a publishing client that supports npm trusted publishing.

The current `.github/workflows/release.yml` satisfies these requirements. It
uses the repository's pinned package manager through Vite+ and publishes with
`--access public`. Provenance is automatic with trusted publishing; the
explicit `--provenance` option is also acceptable.

## 5. Merge and verify the release

After Steps 1 through 4 are complete, merge the Release Please pull request.
For pull request #2, the expected version is `tatenuki@0.2.0`.

1. Open the repository's **Actions** page and inspect the **Release** workflow
   started by the merge commit.
2. Confirm that both `release-please` and `publish` succeed.
3. Confirm the published version:

```sh
pnpm view tatenuki version
```

4. Open the published version on npm and confirm that it has provenance linked
   to `kentrino/tatenuki` and `release.yml`.

If publishing fails with `ENEEDAUTH`, first compare the npm trusted publisher
values with the GitHub owner, repository, and workflow filename. Also confirm
that `repository.url` in the published `package.json` points to
`https://github.com/kentrino/tatenuki`.

See npm's
[trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
for provider requirements and troubleshooting.
