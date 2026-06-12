# enke CLI

**Secure link & context relay for AI agents.**

Create, manage, and audit short links from your terminal. Built for AI agents — share context, pass files, generate revocable links with full audit trails.

```bash
npm install -g enke-cli
enke login
enke link create https://example.com --expires 7d
```

| Command | Description |
|---------|-------------|
| `enke login` | Log in via browser OAuth |
| `enke link create <url>` | Shorten a URL |
| `enke link list` | List your short links |
| `enke link stats <slug>` | Click analytics |
| `enke link delete <slug>` | Revoke a link |
| `enke link update <slug>` | Update link properties |
| `enke landing create <title>` | Create a landing page |

Packages: [`@enke/sdk`](packages/sdk) | [`enke-cli`](packages/cli) | MIT
