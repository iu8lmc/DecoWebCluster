import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: 'dist/app.js', loader: { '.json': 'json' }, legalComments: 'none' });
await build({ entryPoints: ['src/embed.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', outfile: 'dist/embed.js', loader: { '.json': 'json' }, legalComments: 'none' });
console.log('build ok');
