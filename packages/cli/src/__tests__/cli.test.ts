import { describe, it, expect } from "vitest";
import { parseArgs, getPositionalArgs } from "../cli.js";

// ── parseArgs ──

describe("parseArgs", () => {
  it("parses --key=value format", () => {
    const result = parseArgs(["node", "enke", "link", "create", "https://x.com", "--slug=my-slug", "--expires=7d"]);
    expect(result.slug).toBe("my-slug");
    expect(result.expires).toBe("7d");
  });

  it("parses --key value format (space-separated)", () => {
    const result = parseArgs(["node", "enke", "link", "create", "https://x.com", "--slug", "my-slug", "--password", "hunter2"]);
    expect(result.slug).toBe("my-slug");
    expect(result.password).toBe("hunter2");
  });

  it("parses --flag as boolean true (no value)", () => {
    const result = parseArgs(["node", "enke", "doc", "upload", "file.txt", "--burn", "--no-download"]);
    expect(result.burn).toBe("true");
    expect(result["no-download"]).toBe("true");
  });

  it("returns empty object when no flags", () => {
    const result = parseArgs(["node", "enke", "link", "list"]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles mixed = and space formats", () => {
    const result = parseArgs(["node", "enke", "cmd", "--a=1", "--b", "2", "--c=3"]);
    expect(result.a).toBe("1");
    expect(result.b).toBe("2");
    expect(result.c).toBe("3");
  });

  it("handles --max-downloads with numeric value", () => {
    const result = parseArgs(["node", "enke", "doc", "upload", "f.txt", "--max-downloads", "5"]);
    expect(result["max-downloads"]).toBe("5");
  });

  it("handles --exp-days with numeric value", () => {
    const result = parseArgs(["node", "enke", "doc", "upload", "f.txt", "--exp-days=30"]);
    expect(result["exp-days"]).toBe("30");
  });
});

// ── getPositionalArgs ──

describe("getPositionalArgs", () => {
  it("extracts positional arguments excluding flags", () => {
    const result = getPositionalArgs(["node", "enke", "link", "create", "https://x.com", "--slug=my-link"]);
    expect(result).toEqual(["link", "create", "https://x.com"]);
  });

  it("returns empty when only flags", () => {
    // --help starts with -- so it's treated as a flag, not a positional arg
    const result = getPositionalArgs(["node", "enke", "--help"]);
    expect(result).toEqual([]);
  });

  it("extracts sub-commands correctly", () => {
    const result = getPositionalArgs(["node", "enke", "doc", "upload", "./report.pdf", "--exp-days=7"]);
    expect(result[0]).toBe("doc");
    expect(result[1]).toBe("upload");
    expect(result[2]).toBe("./report.pdf");
  });

  it("handles link stats sub-command", () => {
    const result = getPositionalArgs(["node", "enke", "link", "stats", "my-slug"]);
    expect(result).toEqual(["link", "stats", "my-slug"]);
  });

  it("handles landing create", () => {
    const result = getPositionalArgs(["node", "enke", "landing", "create", "My Page", "--links", "url1,l1;url2,l2"]);
    expect(result[0]).toBe("landing");
    expect(result[1]).toBe("create");
    expect(result[2]).toBe("My Page");
  });

  it("skips over flag values when extracting positionals", () => {
    const result = getPositionalArgs(["node", "enke", "doc", "update", "abc123", "--exp-days", "30", "--password", "pw"]);
    expect(result).toEqual(["doc", "update", "abc123"]);
  });
});

// ── Command routing patterns ──

describe("command routing", () => {
  it("link create: cmd=link, sub=create, target=url", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "create", "https://example.com", "--slug=x"]);
    const opts = parseArgs(["node", "enke", "link", "create", "https://example.com", "--slug=x"]);
    expect(pos[0]).toBe("link");
    expect(pos[1]).toBe("create");
    expect(pos[2]).toBe("https://example.com");
    expect(opts.slug).toBe("x");
  });

  it("link list with limit", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "list", "--limit=50"]);
    const opts = parseArgs(["node", "enke", "link", "list", "--limit=50"]);
    expect(pos).toEqual(["link", "list"]);
    expect(opts.limit).toBe("50");
  });

  it("link stats", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "stats", "my-slug"]);
    expect(pos[2]).toBe("my-slug");
  });

  it("link delete", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "delete", "my-slug"]);
    expect(pos[2]).toBe("my-slug");
  });

  it("link update with options", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "update", "my-slug", "--slug=new", "--password=pw"]);
    const opts = parseArgs(["node", "enke", "link", "update", "my-slug", "--slug=new", "--password=pw"]);
    expect(pos[2]).toBe("my-slug");
    expect(opts.slug).toBe("new");
    expect(opts.password).toBe("pw");
  });

  it("doc upload with security options", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "upload", "./file.pdf", "--password=secret", "--burn", "--max-downloads=1"]);
    const opts = parseArgs(["node", "enke", "doc", "upload", "./file.pdf", "--password=secret", "--burn", "--max-downloads=1"]);
    expect(pos[2]).toBe("./file.pdf");
    expect(opts.password).toBe("secret");
    expect(opts.burn).toBe("true");
    expect(opts["max-downloads"]).toBe("1");
  });

  it("doc list", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "list", "--limit=10"]);
    expect(pos).toEqual(["doc", "list"]);
  });

  it("doc get", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "get", "abc123"]);
    expect(pos[2]).toBe("abc123");
  });

  it("doc renew", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "renew", "abc123"]);
    expect(pos[2]).toBe("abc123");
  });

  it("doc expire", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "expire", "abc123", "60"]);
    expect(pos[2]).toBe("abc123");
    expect(pos[3]).toBe("60");
  });

  it("doc delete", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "delete", "abc123"]);
    expect(pos[2]).toBe("abc123");
  });

  it("landing create", () => {
    const pos = getPositionalArgs(["node", "enke", "landing", "create", "My Title", "--links", "url1,Label1"]);
    expect(pos[2]).toBe("My Title");
  });

  it("whoami", () => {
    const pos = getPositionalArgs(["node", "enke", "whoami"]);
    expect(pos[0]).toBe("whoami");
  });

  it("login", () => {
    const pos = getPositionalArgs(["node", "enke", "login"]);
    expect(pos[0]).toBe("login");
  });

  it("logout", () => {
    const pos = getPositionalArgs(["node", "enke", "logout"]);
    expect(pos[0]).toBe("logout");
  });

  it("version", () => {
    const pos = getPositionalArgs(["node", "enke", "version"]);
    expect(pos[0]).toBe("version");
  });

  it("version --json", () => {
    const pos = getPositionalArgs(["node", "enke", "version", "--json"]);
    const opts = parseArgs(["node", "enke", "version", "--json"]);
    expect(pos[0]).toBe("version");
    expect(opts.json).toBe("true");
  });

  it("update", () => {
    const pos = getPositionalArgs(["node", "enke", "update"]);
    expect(pos[0]).toBe("update");
  });

  it("update --json", () => {
    const pos = getPositionalArgs(["node", "enke", "update", "--json"]);
    const opts = parseArgs(["node", "enke", "update", "--json"]);
    expect(pos[0]).toBe("update");
    expect(opts.json).toBe("true");
  });

  it("link get", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "get", "my-slug"]);
    expect(pos).toEqual(["link", "get", "my-slug"]);
  });

  it("link get --json", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "get", "my-slug", "--json"]);
    const opts = parseArgs(["node", "enke", "link", "get", "my-slug", "--json"]);
    expect(pos[2]).toBe("my-slug");
    expect(opts.json).toBe("true");
  });

  it("link list --all --json", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "list", "--all", "--json"]);
    const opts = parseArgs(["node", "enke", "link", "list", "--all", "--json"]);
    expect(pos).toEqual(["link", "list"]);
    expect(opts.all).toBe("true");
    expect(opts.json).toBe("true");
  });

  it("link stats --json", () => {
    const pos = getPositionalArgs(["node", "enke", "link", "stats", "my-slug", "--json"]);
    const opts = parseArgs(["node", "enke", "link", "stats", "my-slug", "--json"]);
    expect(pos[2]).toBe("my-slug");
    expect(opts.json).toBe("true");
  });

  it("doc list --all --json", () => {
    const pos = getPositionalArgs(["node", "enke", "doc", "list", "--all", "--json"]);
    const opts = parseArgs(["node", "enke", "doc", "list", "--all", "--json"]);
    expect(pos).toEqual(["doc", "list"]);
    expect(opts.all).toBe("true");
    expect(opts.json).toBe("true");
  });

  it("token info", () => {
    const pos = getPositionalArgs(["node", "enke", "token", "info"]);
    expect(pos).toEqual(["token", "info"]);
  });

  it("token info --json", () => {
    const opts = parseArgs(["node", "enke", "token", "info", "--json"]);
    expect(opts.json).toBe("true");
  });

  it("config show", () => {
    const pos = getPositionalArgs(["node", "enke", "config", "show"]);
    expect(pos).toEqual(["config", "show"]);
  });

  it("config clear", () => {
    const pos = getPositionalArgs(["node", "enke", "config", "clear"]);
    expect(pos).toEqual(["config", "clear"]);
  });

  it("completion bash", () => {
    const pos = getPositionalArgs(["node", "enke", "completion", "bash"]);
    expect(pos).toEqual(["completion", "bash"]);
  });

  it("completion zsh", () => {
    const pos = getPositionalArgs(["node", "enke", "completion", "zsh"]);
    expect(pos).toEqual(["completion", "zsh"]);
  });

  it("global --verbose flag", () => {
    const opts = parseArgs(["node", "enke", "link", "list", "--verbose"]);
    expect(opts.verbose).toBe("true");
  });
});
