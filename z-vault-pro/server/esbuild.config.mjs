import esbuild from 'esbuild';
import { builtinModules } from 'module';

const builtins = new Set(builtinModules);

esbuild.build({
  entryPoints: ['src/worker.ts'],
  bundle: true,
  outfile: 'dist-pages/_worker.js',
  format: 'esm',
  target: 'esnext',
  platform: 'node',
  plugins: [
    {
      name: 'node-builtins',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (builtins.has(args.path)) {
            return { path: 'node:' + args.path, external: true };
          }
        });
      },
    },
  ],
}).catch(() => process.exit(1));
