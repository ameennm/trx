import esbuild from 'esbuild';
import { builtinModules } from 'module';

// Build a set of all node builtins with and without node: prefix
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map(m => 'node:' + m),
]);

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist-pages/_worker.js',
  format: 'esm',
  target: 'esnext',
  platform: 'browser',
  // Mark all node builtins as external — they'll be provided by nodejs_compat
  external: [...builtins],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Inject a global process shim
  banner: {
    js: `
import { Buffer } from 'node:buffer';
import process from 'node:process';
globalThis.Buffer = Buffer;
globalThis.process = process;
`
  },
}).catch(() => process.exit(1));
