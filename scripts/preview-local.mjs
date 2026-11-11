import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = 'http://127.0.0.1:4000/api/health';
const viteBin = path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function isApiReady() {
  try {
    const response = await fetch(apiUrl, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const health = await response.json();
    return health.status === 'ok' && ['local', 'mongodb'].includes(health.storage);
  } catch {
    return false;
  }
}

async function findAvailablePort(firstPort = 5176, lastPort = 5276) {
  for (let port = firstPort; port <= lastPort; port += 1) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`No free preview port was found between ${firstPort} and ${lastPort}.`);
}

function startNode(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.once('error', (error) => console.error(`Could not start ${args.join(' ')}: ${error.message}`));
  return child;
}

async function waitFor(check, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(300);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000} seconds.`);
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    const launcher = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
    launcher.unref();
  } else if (process.platform === 'darwin') {
    const launcher = spawn('open', [url], { detached: true, stdio: 'ignore' });
    launcher.unref();
  } else {
    const launcher = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    launcher.unref();
  }
}

function stopChildren() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

process.once('SIGINT', () => {
  stopChildren();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopChildren();
  process.exit(143);
});

try {
  if (!(await isApiReady())) {
    const api = startNode([path.join(root, 'server', 'src', 'index.js')]);
    api.once('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`FinCoach API stopped with exit code ${code}.`);
    });
    await waitFor(isApiReady, 'FinCoach API');
  }

  const port = await findAvailablePort();
  const url = `http://localhost:${port}/`;
  const web = startNode([viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: path.join(root, 'client') });
  web.once('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`FinCoach website stopped with exit code ${code}.`);
  });
  await waitFor(async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
      return response.ok;
    } catch {
      return false;
    }
  }, 'FinCoach website');

  console.log(`\nFinCoach is ready at ${url}`);
  console.log('The account API is ready on port 4000. Keep this window open; press Ctrl+C to stop.\n');
  openBrowser(url);
} catch (error) {
  console.error(`\nFinCoach preview could not start: ${error.message}`);
  stopChildren();
  process.exitCode = 1;
}
