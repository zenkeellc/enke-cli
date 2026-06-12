#!/bin/bash
set -euo pipefail

VERSION="${1:-1.0.0}"
REPO="enke-cli"
GITHUB_REMOTE="origin"

echo "=== Releasing $REPO v$VERSION ==="

# 1. Check working directory clean
if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working directory not clean. Commit or stash changes first."
  exit 1
fi

# 2. Update versions
cd packages/sdk
npm version "$VERSION" --no-git-tag-version --allow-same-version
cd ../..

cd packages/cli
npm version "$VERSION" --no-git-tag-version --allow-same-version
cd ../..

# 3. Install & Build
npm install
npm run build -w packages/sdk
npm run build -w packages/cli

# 4. Publish to npm
echo "--- Publishing @enke/sdk ---"
npm publish -w packages/sdk --access public 2>&1 || echo "Warning: npm publish sdk may need auth. Run: npm login"

echo "--- Publishing enke-cli ---"
npm publish -w packages/cli --access public 2>&1 || echo "Warning: npm publish cli may need auth. Run: npm login"

# 5. Git tag & push
git add packages/sdk/package.json packages/cli/package.json
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push "$GITHUB_REMOTE" main
git push "$GITHUB_REMOTE" "v$VERSION"

# 6. Create GitHub Release
if command -v gh &> /dev/null; then
  echo "--- Creating GitHub Release ---"
  gh release create "v$VERSION" \
    --title "enke-cli v$VERSION" \
    --notes "## enke CLI v$VERSION

### Packages
- \`@enke/sdk@$VERSION\` — shared auth, API client, types
- \`enke-cli@$VERSION\` — CLI tool

### Install
\`\`\`bash
npm install -g enke-cli
enke login
\`\`\`

### Changes
- Link commands: create, list, stats, delete, update
- Document commands: upload, list, get, delete, update, renew, expire
- Landing page: create
- Browser OAuth login flow
- \`--flag=value\` argument format support
- OAuth CSRF state validation
- Token refresh race condition fix
- \`os.homedir()\` fallback for config path" \
    --repo "zenkeellc/$REPO"
else
  echo "GitHub CLI (gh) not found. Create release manually at:"
  echo "  https://github.com/zenkeellc/$REPO/releases/new?tag=v$VERSION"
fi

echo "=== Release complete: v$VERSION ==="
