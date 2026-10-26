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
| `enke share` | Share text / URL / files (docs/links), list devices, start pairing |
| `enke mem` | AI agent memory (remember/recall/forget) |
| `enke mcp` | Start MCP server (stdio or SSE) |
| `enke whoami` | Show account info |

## enke Share

```bash
enke share send "hello" --title "Note"
enke share send --url https://example.com --expires 7d
enke share send --files ./report.pdf
enke share send --chat ./WhatsApp\ Chat.txt
enke share devices --json
enke share pair --name "Desk e-ink"
```

始终复用 en.ke 现有线上 API（`https://api.en.ke/api/v1`），没有独立 Share Worker，
也没有第二个 API base：

- URL → `POST /api/v1/links`，得到 `https://en.ke/{slug}`
- 文本 / 聊天导出 / 文件 → `POST /api/v1/docs`，得到 `https://en.ke/{slug}`
- 多文件、任意二进制或“文件+文字/链接”混合 → 自动打成一个 store-only zip 再上传（服务端接受 `application/zip`）

设备（`enke share devices` / `enke share pair`）使用 enkeworker 的设备端点：

- `GET /api/v1/devices` 列出已配对设备
- `POST /api/v1/devices/pair/start` 生成 8 位配对码（5 分钟有效），在设备端输入完成配对

`@enke/core` 仅用于聊天解析和 store-only zip 生成。该包不发布 npm：`vendor/`
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

## License

MIT
