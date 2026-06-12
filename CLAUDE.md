# enke-cli

CLI tool for en.ke — URL shortening, file sharing, landing pages for AI agents.

## Project Structure

```
packages/
  sdk/     — enke-sdk: shared auth, API client, types
  cli/     — enke-cli: the CLI entry point
release.sh — release script (runs tests → build → publish → tag → GitHub release)
```

## Tech Stack
- TypeScript, Node.js ESM
- Vitest for testing
- `open` package for browser launch
- Deployed as npm package: `enke-cli` (with dependency `enke-sdk`)

## Build & Test

```bash
# Install
npm install

# Type-check
npm run type-check       # all workspaces
npm run type-check -w packages/sdk
npm run type-check -w packages/cli

# Build
npm run build            # all workspaces (SDK first, then CLI)
npm run build -w packages/sdk
npm run build -w packages/cli

# Test
npx vitest run -w packages/sdk
npx vitest run -w packages/cli
npx vitest run -w packages/sdk -w packages/cli   # combined
```

## Architecture

### enke-sdk (`packages/sdk/`)
- `auth.ts` — OAuth login (browser callback), token refresh, config persist
- `client.ts` — API client functions (shorten, listLinks, updateLink, etc.)
- `types.ts` — TypeScript interfaces matching API schemas

Key design decisions:
- Auth stores tokens in `~/.config/enke/config.json` (XDG-compatible)
- Token refresh uses in-memory mutex to prevent concurrent refreshes
- `toShortLink()` transforms raw API responses to consumer-friendly objects with computed fields (`shortUrl`, `createdAt`, `expiresAt`)

### enke-cli (`packages/cli/`)
- `cli.ts` — Argument parsing (`parseArgs`, `getPositionalArgs`), command routing, `printLink`

## Release Process

### Quick: single tool
```bash
./release.sh <version>
```

### Detailed steps

1. **Pre-flight**: working directory clean, on `main` branch
2. **Tests**: `npx vitest run -w packages/sdk -w packages/cli`
3. **Type-check**: `npm run type-check -w packages/sdk && npm run type-check -w packages/cli`
4. **Bump**: `npm version <version> --no-git-tag-version` in both sdk and cli
5. **Build**: `npm run build -w packages/sdk && npm run build -w packages/cli`
6. **Publish**: `npm publish -w packages/sdk --access public` first, then CLI
7. **Verify**: `npm view enke-sdk version` / `npm view enke-cli version`
8. **Git**: commit version bumps, tag `v<version>`, push to origin
9. **GitHub Release**: `gh release create v<version>` on `zenkeellc/enke-cli`

### Error handling
| Failure | Action |
|---------|--------|
| Tests fail | Fix tests before releasing |
| SDK build fails | Fix build, retry |
| SDK publish fails | Abort — nothing published |
| CLI publish fails (SDK already published) | SDK v<N> is live. Fix CLI issue, bump patch version, re-publish |
| Git push fails | Check network/credentials. Published npm packages are already live |
| GitHub release fails | Create manually or ignore (npm is the canonical release) |

### Master orchestrator
From the parent tools directory:
```bash
./release-all.sh <version>
```
This handles all three packages (SDK → CLI → MCP) and updates parent repo submodule refs.
