#!/bin/bash
set -euo pipefail

VERSION="${1:-}"
REPO="enke-cli"
GITHUB_REMOTE="origin"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.2.1"
  exit 1
fi

echo "=== Releasing $REPO v$VERSION ==="

# ── 1. Pre-flight checks ──

if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working directory not clean. Commit or stash changes first."
  git status --short
  exit 1
fi

# Verify we're on main branch
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: not on main branch (currently: $BRANCH). Switch to main first."
  exit 1
fi

# ── 2. Run tests ──

echo "--- Running tests ---"
npx vitest run --reporter=verbose -w packages/sdk -w packages/cli 2>&1 || {
  echo "Error: tests failed. Fix before releasing."
  exit 1
}

# ── 3. Type-check ──

echo "--- Type-checking ---"
npm run type-check -w packages/sdk 2>&1 || { echo "Error: SDK type-check failed"; exit 1; }
npm run type-check -w packages/cli 2>&1 || { echo "Error: CLI type-check failed"; exit 1; }

# ── 4. Bump versions ──

echo "--- Bumping versions to $VERSION ---"
cd packages/sdk
npm version "$VERSION" --no-git-tag-version 2>&1
cd ../..

cd packages/cli
npm version "$VERSION" --no-git-tag-version 2>&1
cd ../..

# ── 5. Build ──

echo "--- Building ---"
npm run build -w packages/sdk 2>&1 || { echo "Error: SDK build failed"; exit 1; }
npm run build -w packages/cli 2>&1 || { echo "Error: CLI build failed"; exit 1; }

# ── 6. Publish to npm ──

echo "--- Publishing enke-sdk@$VERSION ---"
npm publish -w packages/sdk --access public 2>&1 || {
  echo "Error: SDK publish failed."
  exit 1
}

echo "--- Publishing enke-cli@$VERSION ---"
npm publish -w packages/cli --access public 2>&1 || {
  echo "Error: CLI publish failed. SDK already published — manual rollback may be needed."
  exit 1
}

# ── 7. Verify published packages ──

echo "--- Verifying npm packages ---"
for pkg in enke-sdk enke-cli; do
  PUBLISHED=$(npm view "$pkg" version 2>/dev/null)
  if [[ "$PUBLISHED" != "$VERSION" ]]; then
    echo "Warning: $pkg@$PUBLISHED on npm (expected $VERSION). CDN may be propagating."
  else
    echo "  $pkg@$PUBLISHED ✓"
  fi
done

# ── 8. Git tag & push ──

echo "--- Committing and tagging ---"
git add packages/sdk/package.json packages/cli/package.json
git commit -m "release: v$VERSION"

git tag "v$VERSION"
git push "$GITHUB_REMOTE" main
git push "$GITHUB_REMOTE" "v$VERSION"

# ── 9. Create GitHub Release ──

if command -v gh &> /dev/null; then
  echo "--- Creating GitHub Release ---"

  # Generate release notes from recent commits
  NOTES=$(cat <<EOF
## enke CLI v$VERSION

### Packages
- \`enke-sdk@$VERSION\` — shared auth, API client, types
- \`enke-cli@$VERSION\` — CLI tool

### Install
\`\`\`bash
npm install -g enke-cli
enke login
\`\`\`

### Recent Changes
$(git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD~1 2>/dev/null | sed 's/^/- /' || echo "- Initial release")
EOF
)

  gh release create "v$VERSION" \
    --title "enke-cli v$VERSION" \
    --notes "$NOTES" \
    --repo "zenkeellc/$REPO"
  echo "  Release: https://github.com/zenkeellc/$REPO/releases/tag/v$VERSION"
else
  echo "GitHub CLI (gh) not found. Create release manually at:"
  echo "  https://github.com/zenkeellc/$REPO/releases/new?tag=v$VERSION"
fi

echo "=== Release complete: $REPO v$VERSION ==="
