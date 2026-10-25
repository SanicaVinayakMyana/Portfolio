// Runs `gatsby build` without NODE_OPTIONS flags that Node refuses to pass to worker threads.
// Cloudflare Pages sets NODE_OPTIONS=--use-openssl-ca, which makes Gatsby's Parcel workers
// crash on startup with "--use-openssl-ca is not allowed in NODE_OPTIONS".
const { spawnSync } = require('child_process');

const WORKER_UNSAFE_FLAGS = ['--use-openssl-ca', '--use-bundled-ca'];

const env = { ...process.env };
const nodeOptions = (env.NODE_OPTIONS || '')
  .split(/\s+/)
  .filter(flag => flag && !WORKER_UNSAFE_FLAGS.includes(flag))
  .join(' ');

if (nodeOptions) {
  env.NODE_OPTIONS = nodeOptions;
} else {
  delete env.NODE_OPTIONS;
}

const gatsbyCli = require.resolve('gatsby/cli');
const result = spawnSync(process.execPath, [gatsbyCli, 'build', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
