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

18 tools: URL shorten, link management, document sharing, agent memory.

## Commands

| Command | Description |
|---------|-------------|
| `enke login` | Authenticate via browser |
| `enke link` | Create, list, update, delete short links |
| `enke doc` | Upload, share, manage documents |
| `enke mem` | AI agent memory (remember/recall/forget) |
| `enke mcp` | Start MCP server (stdio or SSE) |
| `enke whoami` | Show account info |

## Environment

| Var | Description |
|-----|-------------|
| `ENKE_MCP_TRANSPORT` | `stdio` (default) or `sse` |
| `ENKE_MCP_PORT` | SSE port (default: 3100) |
| `ENKE_API_KEY` | API key for remote/CI mode |

## License

MIT
