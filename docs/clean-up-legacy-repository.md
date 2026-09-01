# Variables

Set these in the shell before the later commands. Every concrete path and URL in this document is one of these names.

```sh
export SOURCE_REPO_URL=...
export SOURCE_REPO_ROOT=...
export SOURCE_REPO_DIRECTORY=...
```

| Name | Meaning |
| --- | --- |
| `SOURCE_REPO_URL` | Clone URL of the legacy repository |
| `SOURCE_REPO_ROOT` | Local path of the disposable clone. Gitignore this path; do not commit it |
| `SOURCE_REPO_DIRECTORY` | Directory to keep in the legacy history, and the subtree prefix in this repository |

# Extract a directory from a legacy repository

Keep only `$SOURCE_REPO_DIRECTORY` (and its history) from the legacy repository, then import it into this repository with `git subtree add`. This repository already has an initial commit, so `subtree add` can run as-is. Do not create a new GitHub repository.

`$SOURCE_REPO_ROOT` is a disposable working copy.

## 1. Clone the legacy repository

```sh
git clone "$SOURCE_REPO_URL" "$SOURCE_REPO_ROOT"
cd "$SOURCE_REPO_ROOT"
```

## 2. Drop every path except `$SOURCE_REPO_DIRECTORY`

This deletes the rest of the tree and moves `$SOURCE_REPO_DIRECTORY/` to the clone root. That is expected.

```sh
git filter-repo \
  --path "$SOURCE_REPO_DIRECTORY" \
  --path-rename "$SOURCE_REPO_DIRECTORY/":
```

If the clone is not fresh, add `--force`. `git-filter-repo` also removes `origin` so the rewritten history cannot be pushed back to the legacy remote.

```sh
ls
git log --oneline
```

## 3. Subtree-add into this repository

From this repository's root, using the current branch of the filtered clone:

```sh
git subtree add --prefix="$SOURCE_REPO_DIRECTORY" "$SOURCE_REPO_ROOT" HEAD
```

`$SOURCE_REPO_DIRECTORY/` in this repository now has the extracted history. After that, `$SOURCE_REPO_ROOT` can be deleted.

Extracted files may still assume the old monorepo layout. Fix those in a later commit.
