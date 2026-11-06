#!/usr/bin/env bash
# Full release of Lumifex: make release VERSION=X.Y.Z
#
# 1. checks (nothing is changed yet): the version is a newer X.Y.Z, we are on a clean, up-to-date `main`,
#    the tag is free, CHANGELOG.md has entries under "## [Unreleased]", tests + lint + type check pass
# 2. VERSION, package.json, package-lock.json and CHANGELOG.md are set to the new version
#    ("## [Unreleased]" stays empty above "## [X.Y.Z] - <date>")
# 3. `make build` (production build copied to docs/ for GitHub Pages)
# 4. commit "chore: release X.Y.Z", annotated tag vX.Y.Z, push of main and the tag (atomic)
#
# Environment: DRY_RUN=1 only runs the checks and shows the plan, YES=1 skips the confirmation question.
# Usage from the Makefile: scripts/release.sh X.Y.Z "$(MAKE)"

set -euo pipefail

new="${1:-}"
make_cmd="${2:-make}"
remote="origin"
branch="main"

fail() {
	echo "release: $*" >&2
	exit 1
}

cd "$(dirname "$0")/.."

# --- 1. checks -------------------------------------------------------------------------------------------------
[[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "VERSION must look like X.Y.Z (e.g. make release VERSION=26.2.0), got \"$new\""
current="$(tr -d '[:space:]' < VERSION)"
[[ "$new" != "$current" ]] || fail "version $new is already the current one (VERSION file)"
newest="$(printf '%s\n%s\n' "$current" "$new" | sort -V | tail -n 1)"
[[ "$newest" == "$new" ]] || fail "version $new is older than the current $current"

tag="v$new"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "$branch" ]] || fail "releases are made from $branch (you are on $(git rev-parse --abbrev-ref HEAD))"
[[ -z "$(git status --porcelain)" ]] || fail "the working tree is not clean; commit or stash your changes first"

git fetch --quiet "$remote" "$branch" --tags || fail "cannot fetch from $remote"
[[ "$(git rev-list --count "HEAD..$remote/$branch")" == "0" ]] || fail "$branch is behind $remote/$branch; pull first"
if git rev-parse -q --verify "refs/tags/$tag" > /dev/null || [[ -n "$(git ls-remote --tags "$remote" "refs/tags/$tag")" ]]; then
	fail "tag $tag already exists"
fi

entries="$(awk '/^## \[Unreleased\]/ {on=1; next} /^## \[/ {on=0} on && /^- / {n++} END {print n+0}' CHANGELOG.md)"
[[ "$entries" -gt 0 ]] || fail "CHANGELOG.md has no entries under \"## [Unreleased]\""

ahead="$(git rev-list --count "$remote/$branch..HEAD")"
echo "Release $current -> $new"
echo "  branch:    $branch ($ahead commit(s) not pushed yet, they are pushed with the release)"
echo "  changelog: $entries entr(y/ies) under [Unreleased] move to [$new] - $(date +%Y-%m-%d)"
echo "  tag:       $tag"
echo "  push:      $remote $branch $tag"
echo ""

echo "Running npm test, lint and type check..."
npm test --silent
npm run lint --silent
npm run typecheck --silent

if [[ "${DRY_RUN:-}" == "1" ]]; then
	echo ""
	echo "DRY_RUN=1: the checks passed, nothing was changed."
	exit 0
fi

if [[ "${YES:-}" != "1" ]]; then
	read -r -p "Create the release $new and push it to $remote? [y/N] " answer
	[[ "$answer" == "y" || "$answer" == "Y" ]] || fail "cancelled, nothing was changed"
fi

# from here on files change; on a failure tell how to get back to the clean state
trap 'echo "" >&2; echo "release: failed after files were changed. Nothing was committed or pushed. To go back: git reset --hard HEAD && git clean -fd docs dist" >&2' ERR

# --- 2. version and changelog ----------------------------------------------------------------------------------
echo "$new" > VERSION
npm version "$new" --no-git-tag-version --allow-same-version > /dev/null
NEW_VERSION="$new" RELEASE_DATE="$(date +%Y-%m-%d)" node -e '
	const fs = require("fs");
	const text = fs.readFileSync("CHANGELOG.md", "utf8");
	const header = "## [Unreleased]\n";
	if (!text.includes(header)) { throw new Error("CHANGELOG.md has no [Unreleased] heading"); }
	const next = text.replace(header, `${header}\n## [${process.env.NEW_VERSION}] - ${process.env.RELEASE_DATE}\n`);
	fs.writeFileSync("CHANGELOG.md", next);
'

# --- 3. build ----------------------------------------------------------------------------------------------------
"$make_cmd" build VERSION="$new"

# --- 4. commit, tag, push ------------------------------------------------------------------------------------------
git add -A
git commit --quiet -m "chore: release $new"
git tag -a "$tag" -m "Lumifex $new"
trap - ERR
if ! git push --atomic "$remote" "$branch" "$tag"; then
	echo "" >&2
	echo "release: the commit and the tag $tag are created locally but the push failed." >&2
	echo "Fix the problem and push: git push --atomic $remote $branch $tag" >&2
	exit 1
fi

echo ""
echo "Released Lumifex $new ($tag)."
