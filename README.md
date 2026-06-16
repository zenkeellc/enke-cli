# enke CLI

**Secure link & context relay for AI agents.**

Create, manage, and audit short links from your terminal. Built for AI agents — share context, pass files, generate revocable links with full audit trails.

```bash
npm install -g enke-cli
enke login
enke link create https://example.com --keep-days 7
```

## Commands

### Account & Session

| Command | Description |
|---|---|
| `enke login` | Log in via browser OAuth |
| `enke logout` | Remove stored credentials |
| `enke whoami [--json]` | Show logged-in user info |
| `enke token info [--json]` | Show token expiry, API endpoint, refresh status |
| `enke config show` | Show current configuration (tokens redacted) |
| `enke config clear` | Remove stored credentials |

### Links

| Command | Description |
|---|---|
| `enke link create <url>` | Shorten a URL |
| `enke link get <slug> [--json]` | Show full link details (rules, A/B, preview) |
| `enke link list [--cursor c] [--all] [--json]` | List your short links |
| `enke link stats <slug> [--json]` | Click analytics (daily, countries, referrers, devices) |
| `enke link update <slug>` | Update link properties (URL, password) |
| `enke link delete <slug>` | Revoke a short link |

### Documents

| Command | Description |
|---|---|
| `enke doc upload <file>` | Share a document |
| `enke doc list [--cursor c] [--all] [--json]` | List shared documents |
| `enke doc get <slug>` | Show document details |
| `enke doc update <slug>` | Update document settings |
| `enke doc renew <slug>` | Reset document expiration |
| `enke doc expire <slug> <days>` | Set document expiration days |
| `enke doc delete <slug>` | Delete a shared document |

### Landing Pages

| Command | Description |
|---|---|
| `enke landing create <slug> <title>` | Create a landing page |

### CLI Management

| Command | Description |
|---|---|
| `enke version [--json]` | Show CLI version |
| `enke update [--json]` | Check for updates |
| `enke completion <bash\|zsh>` | Output shell completion script |
| `enke help` | Show usage |

## Global Flags

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output on all commands |
| `--verbose` | Show debug output (API URL, request details) |
| `--all` | Auto-paginate through all results (`link list`, `doc list`) |

## Shell Completion

```bash
# bash
source <(enke completion bash)

# zsh
source <(enke completion zsh)
```

## Options

### `link create`
`--slug <slug>` — Custom back-half
`--password <pwd>` — Password-protect
`--keep-days <n>` — Keep duration in days (default: 30)

### `link update`
`--url <url>` — New redirect URL
`--password <pwd>` — New password (empty to remove)

### `doc upload / update`
`--slug <slug>` — Custom share slug
`--exp-days <n>` — Expiration in days
`--password <pwd>` — Password-protect
`--comment <text>` — Owner-facing note
`--burn` — Delete after first download
`--no-download` — Preview only, no download button
`--max-downloads <n>` — Max download count

## Examples

```bash
# Create a short link
enke link create https://example.com/very-long-url --slug my-brand --keep-days 30

# List all links as JSON (for scripting)
enke link list --all --json

# Upload a self-destructing document
enke doc upload ./secret.pdf --password hunter2 --burn --max-downloads 1

# Check token status
enke token info --json

# Paginate through all documents
enke doc list --all

# Get click analytics for a link
enke link stats my-brand --json
```

## Packages

| Package | Description |
|---|---|
| [`enke-cli`](packages/cli) | CLI tool |
| [`enke-sdk`](packages/sdk) | Shared auth, API client, TypeScript types |

## License

MIT
