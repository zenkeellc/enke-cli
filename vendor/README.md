# vendor

`@enke/protocol` / `@enke/core` 是 enke-share 的内部包，不发布 npm。
这里的 tarball 由 `scripts/sync-enke-core.sh` 从 `../../enke-share` 生成，
仅供 enke-cli 构建期使用；`esbuild` 会把它们内联进 `dist/enke.js`，
运行时不需要这些文件。
