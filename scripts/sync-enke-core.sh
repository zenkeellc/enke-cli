#!/usr/bin/env bash
# 从 enke-share 重新生成 vendor/ 内部包 tarball（不发布 npm）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHARE="${ENKE_SHARE_DIR:-$ROOT/../../enke-share}"

if [ ! -d "$SHARE/packages/core" ]; then
  echo "找不到 enke-share：$SHARE" >&2
  echo "设置 ENKE_SHARE_DIR 指向 enke-share checkout" >&2
  exit 1
fi

pnpm --dir "$SHARE" build:packages
rm -f "$ROOT"/vendor/enke-*.tgz
pnpm --dir "$SHARE" --filter @enke/protocol pack --pack-destination "$ROOT/vendor" >/dev/null
pnpm --dir "$SHARE" --filter @enke/core pack --pack-destination "$ROOT/vendor" >/dev/null
echo "已同步 vendor/："
ls -lh "$ROOT"/vendor/enke-*.tgz
