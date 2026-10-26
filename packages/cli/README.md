# enke-cli

CLI for [en.ke](https://www.en.ke) — secure link management, document sharing, and AI agent memory.

Includes built-in MCP server for Claude Desktop, Cursor, and other MCP-capable agents.

## Install

```bash
npm install -g enke-cli
```

## Quick Start

```bash
# Login
enke login

# Shorten a URL
enke link create https://example.com --keep-days 30

# List links
enke link list

# AI agent memory
enke mem remember "用户叫Derek，喜欢Rust和TypeScript"
enke mem recall "Derek"
```

## MCP Server (Claude Desktop)

```json
{
  "mcpServers": {
    "enke": {
      "command": "enke",
      "args": ["mcp"]
    }
  }
}
```

21 tools: URL shorten, link management, document sharing, agent memory, and enke Share (text / URL / files, device pairing).

## Commands

| Command | Description |
|---------|-------------|
| `enke login` | Authenticate via browser |
| `enke link` | Create, list, update, delete short links |
| `enke doc` | Upload, share, manage documents |
| `enke share` | Share text / URL / files, list paired devices |
| `enke mem` | AI agent memory (remember/recall/forget) |
| `enke mcp` | Start MCP server (stdio or SSE) |
| `enke whoami` | Show account info |

## enke Share

```bash
enke share send "hello" --title "Note"
enke share send --url https://example.com --expires 7d
enke share send --files ./a.pdf,./b.png --visibility private
enke share send --chat ./WhatsApp\ Chat.txt
enke share devices --json
```

Share uses the internal `@enke/core` engine from `enke-share`. The package does **not**
publish `@enke/core` to npm: `vendor/` tarballs are used at build time and esbuild
inlines them into `dist/enke.js`, so the published `enke-cli` has no extra runtime
dependency. Refresh them with:

```bash
./scripts/sync-enke-core.sh          # default ../../enke-share
ENKE_SHARE_DIR=/path/to/enke-share ./scripts/sync-enke-core.sh
```

## Environment

| Var | Description |
|-----|-------------|
| `ENKE_MCP_TRANSPORT` | `stdio` (default) or `sse` |
| `ENKE_MCP_PORT` | SSE port (default: 3100) |
| `ENKE_API_KEY` | API key for remote/CI mode |
| `ENKE_SHARE_API_URL` | Override Share API base (default `https://share.en.ke/v1`) |
| `ENKE_SHARE_PAGE_URL` | Override Share page base (default `https://share.en.ke`) |

## License

MIT
