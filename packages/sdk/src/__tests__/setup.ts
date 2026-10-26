import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never touch the developer's real ~/.config/enke during tests.
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "enke-sdk-test-"));
