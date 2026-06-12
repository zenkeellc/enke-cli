#!/usr/bin/env node

import {
  login, logout, loadConfig,
  shorten, listLinks, getLink, deleteLink, updateLink, getLinkStats,
  createLanding, whoami, EnkeError,
} from "@enke/sdk";

function help(): void {
  console.log(`en.ke — secure link & context relay for AI agents

Usage:
  enke login                          Log in via browser (OAuth)
  enke logout                         Remove stored credentials
  enke whoami                         Show logged-in user info

  enke link create <url>              Shorten a URL
  enke link list [--limit 20]         List your short links
  enke link stats <slug>              Click analytics for a link
  enke link delete <slug>             Revoke a short link
  enke link update <slug> [opts]      Update a link's properties

  enke landing create <title>         Create a landing page
          [--links url1,label1;url2,label2]

Options (link create/update):
  --slug <slug>       Custom back-half
  --password <pwd>    Password-protect the link
  --expires <duration>  Expire after: 1h, 24h, 7d, 30d
  --webhook <url>     Webhook callback on click

Examples:
  enke login
  enke link create https://example.com --slug my-link --expires 7d
  enke link list
  enke link stats my-link
`);
}

function parseArgs(): Record<string, string> {
  const opts: Record<string, string> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      let key: string;
      let val: string;
      const eqIdx = args[i].indexOf("=");
      if (eqIdx >= 0) {
        // --flag=value format
        key = args[i].slice(2, eqIdx);
        val = args[i].slice(eqIdx + 1);
      } else {
        key = args[i].slice(2);
        val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      }
      opts[key] = val;
    }
  }
  return opts;
}

function getPositionalArgs(): string[] {
  const result: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (args[i + 1] && !args[i + 1].startsWith("--")) i++;
    } else {
      result.push(args[i]);
    }
  }
  return result;
}

function printLink(link: { slug: string; shortUrl: string; url: string; clicks: number; createdAt: string; expiresAt: string | null }): void {
  console.log(`  Slug:       ${link.slug}`);
  console.log(`  Short URL:  ${link.shortUrl}`);
  console.log(`  Target:     ${link.url}`);
  console.log(`  Clicks:     ${link.clicks}`);
  console.log(`  Created:    ${link.createdAt}`);
  if (link.expiresAt) console.log(`  Expires:    ${link.expiresAt}`);
  console.log();
}

async function main(): Promise<void> {
  const args = getPositionalArgs();
  const opts = parseArgs();
  const cmd = args[0];

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  try {
    switch (cmd) {
      case "login": {
        console.log("Opening browser for login...");
        const cfg = await login();
        console.log(`✓ Logged in. Token valid until ${new Date(cfg.expiresAt * 1000).toLocaleString()}`);
        break;
      }
      case "logout": {
        logout();
        console.log("✓ Logged out.");
        break;
      }
      case "whoami": {
        const user = await whoami();
        console.log(`  Email:  ${user.email}`);
        console.log(`  Name:   ${user.name ?? "(not set)"}`);
        console.log(`  Plan:   ${user.plan}`);
        break;
      }

      // ── link ──
      case "link": {
        const sub = args[1];
        const target = args[2];
        if (!sub) { console.error("Usage: enke link <create|list|stats|delete|update> [...]"); process.exit(1); }

        switch (sub) {
          case "create": {
            if (!target) { console.error("Usage: enke link create <url> [--slug x] [--expires 7d] [--password x] [--webhook url]"); process.exit(1); }
            const link = await shorten(target, {
              slug: opts.slug,
              password: opts.password,
              expiresIn: opts.expires,
              webhookUrl: opts.webhook,
            });
            console.log(`✓ Link created:`);
            printLink(link);
            break;
          }
          case "list": {
            const links = await listLinks({ limit: opts.limit ? parseInt(opts.limit) : 20 });
            if (links.length === 0) { console.log("No links yet."); break; }
            console.log(`Links (${links.length}):\n`);
            for (const l of links) printLink(l);
            break;
          }
          case "stats": {
            if (!target) { console.error("Usage: enke link stats <slug>"); process.exit(1); }
            const stats = await getLinkStats(target);
            console.log(`Stats for "${target}":`);
            console.log(`  Total clicks: ${stats.totalClicks}`);
            if (stats.daily.length > 0) {
              console.log(`  Daily:`);
              for (const d of stats.daily.slice(-7)) console.log(`    ${d.date}: ${d.count}`);
            }
            if (stats.referrers.length > 0) {
              console.log(`  Referrers:`);
              for (const r of stats.referrers.slice(0, 5)) console.log(`    ${r.source}: ${r.count}`);
            }
            if (stats.geo.length > 0) {
              console.log(`  Countries:`);
              for (const g of stats.geo.slice(0, 5)) console.log(`    ${g.country}: ${g.count}`);
            }
            break;
          }
          case "delete": {
            if (!target) { console.error("Usage: enke link delete <slug>"); process.exit(1); }
            await deleteLink(target);
            console.log(`✓ Link "${target}" deleted.`);
            break;
          }
          case "update": {
            if (!target) { console.error("Usage: enke link update <slug> [--slug x] [--expires 7d] [--password x] [--webhook url]"); process.exit(1); }
            const updated = await updateLink(target, {
              slug: opts.slug,
              password: opts.password,
              expiresIn: opts.expires,
              webhookUrl: opts.webhook,
            });
            console.log(`✓ Link updated:`);
            printLink(updated);
            break;
          }
          default: {
            console.error(`Unknown sub-command: link ${sub}`);
            console.error("Usage: enke link <create|list|stats|delete|update>");
            process.exit(1);
          }
        }
        break;
      }

      // ── landing ──
      case "landing": {
        const sub = args[1];
        if (sub !== "create") { console.error("Usage: enke landing create <title> [--links url1,label1;url2,label2]"); process.exit(1); }
        const title = args[2];
        if (!title) { console.error("Usage: enke landing create <title>"); process.exit(1); }
        const linksRaw = opts.links ?? "";
        const links = linksRaw.split(";").filter(Boolean).map(pair => {
          const [url, label] = pair.split(",").map(s => s.trim());
          return { url, label: label ?? url };
        });
        const lp = await createLanding({ title, links });
        console.log(`✓ Landing page created:`);
        console.log(`  Title:  ${lp.title}`);
        console.log(`  Slug:   ${lp.slug}`);
        console.log(`  Links:  ${lp.links.length}`);
        break;
      }

      default: {
        console.error(`Unknown command: ${cmd}`);
        console.error("Run 'enke help' for usage.");
        process.exit(1);
      }
    }
  } catch (err) {
    if (err instanceof EnkeError) {
      console.error(`Error: ${err.message}`);
      if (err.statusCode === 401) console.error("Run 'enke login' to authenticate.");
    } else {
      console.error("Error:", err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

// Quick check for login state on any command except login/logout/help
const cmd = process.argv[2];
if (cmd && !["login", "logout", "help", "--help", "-h"].includes(cmd)) {
  const cfg = loadConfig();
  if (!cfg) {
    console.error("Not logged in. Run 'enke login' first.");
    process.exit(1);
  }
}

main();
