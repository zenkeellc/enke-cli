// 把 @enke/core / @enke/protocol 打进 CLI 单文件。
// 内部包不发布 npm；esbuild 负责内联，发布包只保留 enke-sdk 等真实依赖。
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/cli.js'],
  outfile: 'dist/enke.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  // 这些是 enke-cli 自己声明的运行依赖，不内联
  external: ['enke-sdk', '@modelcontextprotocol/sdk', 'zod', 'mime', 'open'],
});
console.log('[bundle] dist/enke.js');
