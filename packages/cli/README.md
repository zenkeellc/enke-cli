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

默认直接复用 en.ke 现有线上 API，不依赖 `share.en.ke`：

- URL → `POST https://api.en.ke/api/v1/links`，得到 `https://en.ke/{slug}`
- 文本 / 聊天导出 / 单文件 → `POST https://api.en.ke/api/v1/docs`，得到 `https://en.ke/{slug}`

完整的设备收件箱 / 实时 / ESP32 功能需要单独部署 `enke-share` worker，并显式设置
`ENKE_SHARE_API_URL=https://<your-worker>/v1`。不设置时不会访问任何不存在的域名。

`@enke/core` 仅用于聊天解析和可选的 worker 模式。该包不发布 npm：`vendor/`
tarball 在构建期由 esbuild 内联到 `dist/enke.js`。刷新：

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
| `ENKE_SHARE_API_URL` | Optional enke-share worker base, e.g. `https://your-worker/v1`; unset = use `api.en.ke` |
| `ENKE_SHARE_PAGE_URL` | Optional worker share page base |

## License

MIT
