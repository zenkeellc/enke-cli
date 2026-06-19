# enke-sdk

Shared TypeScript SDK for [en.ke](https://www.en.ke) — auth, API client, and mem-as-a-service client.

## Install

```bash
npm install enke-sdk
```

## Quick Start

```ts
import { shorten, listLinks, MemClient, whoami } from 'enke-sdk';

// Link management
const link = await shorten('https://example.com', { keep_days: 30 });
const { results } = await listLinks({ uid: 'xxx' });

// Agent memory
const mem = new MemClient();
await mem.remember({ content: '用户叫Derek' });
const results = await mem.recall('Derek');
```

## Modules

| Module | Description |
|--------|-------------|
| `auth` | OAuth login, token refresh, config persist |
| `client` | Link API (shorten, list, update, delete, stats, landing) |
| `mem` | MemClient for mem-as-a-service |
| `types` | TypeScript interfaces |

## License

MIT
