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

  enke doc upload <file>              Share a document
  enke doc list                       List shared documents
  enke doc delete <slug>              Delete a shared document
  enke doc update <slug> [opts]       Update document settings
  enke doc renew <slug>               Reset document expiration
  enke doc expire <slug> <days>       Set document expiration days

Options (link create/update):
  --slug <slug>       Custom back-half
  --password <pwd>    Password-protect
  --expires <duration>  Expire after: 1h, 24h, 7d, 30d
  --webhook <url>     Webhook callback on click

Options (doc upload/update):
  --exp-days <n>      Expiration in days
  --password <pwd>    Password-protect
  --comment <text>    Owner-facing note
  --burn              Delete after first download
  --no-download       Preview only, no download button
  --max-downloads <n> Max download count

Examples:
  enke login
  enke link create https://example.com --slug my-link --expires 7d
  enke doc upload ./report.pdf --exp-days 7 --password secret123
  enke doc list
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

      // ── doc ──
      case "doc": {
        const sub = args[1];
        const target = args[2];
        if (!sub) { console.error("Usage: enke doc <upload|list|get|delete|update|renew|expire> [...]"); process.exit(1); }

        const { uploadDoc, listDocs, getDoc, deleteDoc, updateDoc, renewDoc, editDocExpiration } = await import("@enke/sdk");

        switch (sub) {
          case "upload": {
            if (!target) { console.error("Usage: enke doc upload <file-path> [--exp-days 30] [--password x] [--comment x] [--burn] [--no-download] [--max-downloads 5]"); process.exit(1); }
            const fs = await import("node:fs");
            const path = await import("node:path");
            const filePath = path.resolve(target);
            if (!fs.existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
            const filename = path.basename(filePath);
            const doc = await uploadDoc(filePath, filename, {
              exp_days: opts["exp-days"] ? parseInt(opts["exp-days"]) : undefined,
              password: opts.password,
              comment: opts.comment,
              burn_after_reading: opts.burn === "true",
              disable_download: opts["no-download"] === "true",
              max_downloads: opts["max-downloads"] ? parseInt(opts["max-downloads"]) : undefined,
            });
            console.log(`✓ Document uploaded:`);
            console.log(`  Slug:     ${doc.slug}`);
            console.log(`  URL:      https://en.ke/${doc.slug}`);
            console.log(`  File:     ${doc.filename} (${(doc.size / 1024).toFixed(1)} KB)`);
            console.log(`  Expires:  ${doc.exp_days} days`);
            break;
          }
          case "list": {
            const result = await listDocs(opts.cursor, opts.limit ? parseInt(opts.limit) : 20);
            if (result.docs.length === 0) { console.log("No documents yet."); break; }
            console.log(`Documents (${result.docs.length}):\n`);
            for (const d of result.docs) {
              console.log(`  Slug:     ${d.slug}`);
              console.log(`  File:     ${d.filename} (${(d.size / 1024).toFixed(1)} KB)`);
              console.log(`  Views:    ${d.view_count}  Downloads: ${d.download_count}/${d.max_downloads || "∞"}`);
              if (d.burn_after_reading) console.log(`  Burn:     after first download`);
              if (d.password) console.log(`  Lock:     password protected`);
              console.log();
            }
            break;
          }
          case "get": {
            if (!target) { console.error("Usage: enke doc get <slug>"); process.exit(1); }
            const d = await getDoc(target);
            console.log(JSON.stringify(d, null, 2));
            break;
          }
          case "delete": {
            if (!target) { console.error("Usage: enke doc delete <slug>"); process.exit(1); }
            await deleteDoc(target);
            console.log(`✓ Document "${target}" deleted.`);
            break;
          }
          case "update": {
            if (!target) { console.error("Usage: enke doc update <slug> [--exp-days 30] [--password x] [--comment x] [--burn] [--no-download] [--max-downloads 5]"); process.exit(1); }
            const updated = await updateDoc(target, {
              exp_days: opts["exp-days"] ? parseInt(opts["exp-days"]) : undefined,
              password: opts.password,
              comment: opts.comment,
              burn_after_reading: opts.burn === "true" ? true : opts.burn === "false" ? false : undefined,
              disable_download: opts["no-download"] === "true" ? true : opts["no-download"] === "false" ? false : undefined,
              max_downloads: opts["max-downloads"] ? parseInt(opts["max-downloads"]) : undefined,
            });
            console.log(`✓ Document updated: ${updated.slug}`);
            break;
          }
          case "renew": {
            if (!target) { console.error("Usage: enke doc renew <slug>"); process.exit(1); }
            const renewed = await renewDoc(target);
            console.log(`✓ Document renewed: ${renewed.slug} (${renewed.exp_days} days)`);
            break;
          }
          case "expire": {
            const days = args[3];
            if (!target || !days) { console.error("Usage: enke doc expire <slug> <days>"); process.exit(1); }
            const exp = await editDocExpiration(target, parseInt(days));
            console.log(`✓ Expiration set to ${parseInt(days)} days for ${exp.slug}`);
            break;
          }
          default: {
            console.error(`Unknown sub-command: doc ${sub}`);
            console.error("Usage: enke doc <upload|list|get|delete|update|renew|expire>");
            process.exit(1);
          }
        }
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
