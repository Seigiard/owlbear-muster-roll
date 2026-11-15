const VITE_COMMAND = ['bunx', 'vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'];

const CLOUDFLARED_COMMAND = [
  'cloudflared',
  'tunnel',
  '--url',
  'http://127.0.0.1:5173',
  '--no-autoupdate',
];

const QUICK_TUNNEL_URL_PATTERN = /https:\/\/[a-z\d-]+\.trycloudflare\.com\b/i;

type StopSignal = 'SIGHUP' | 'SIGINT' | 'SIGTERM';

type CloudflaredProcess = Bun.Subprocess<'ignore', 'inherit', 'pipe'>;

export async function runOwlbearDev(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  const vite = Bun.spawn({
    cmd: VITE_COMMAND,
    env: environment,
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  let cloudflared: CloudflaredProcess;

  try {
    cloudflared = Bun.spawn({
      cmd: CLOUDFLARED_COMMAND,
      env: environment,
      stdout: 'inherit',
      stderr: 'pipe',
    });
  } catch (error) {
    vite.kill('SIGTERM');
    await vite.exited;

    throw error;
  }

  let stopping = false;

  let stoppingChildren: Promise<void> | undefined;

  const stop = (signal: StopSignal): void => {
    if (stopping) {
      return;
    }

    stopping = true;
    stoppingChildren = stopChildren(signal, cloudflared, vite);
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      stop(signal);
    });
  }

  const tunnelOutput = printManifestUrl(cloudflared.stderr);

  const firstExit = await Promise.race([
    vite.exited.then((exitCode) => exitCode),
    cloudflared.exited.then((exitCode) => exitCode),
  ]);

  stop('SIGTERM');
  await Promise.allSettled([vite.exited, cloudflared.exited, tunnelOutput, stoppingChildren]);

  return firstExit;
}

async function printManifestUrl(stderr: ReadableStream<Uint8Array>): Promise<void> {
  let output = '';
  let printed = false;
  const decoder = new TextDecoder();

  for await (const chunk of stderr) {
    process.stderr.write(chunk);

    if (printed) {
      continue;
    }

    output += decoder.decode(chunk, { stream: true });
    const tunnelUrl = output.match(QUICK_TUNNEL_URL_PATTERN)?.[0];

    if (tunnelUrl !== undefined) {
      console.log(`${tunnelUrl}/manifest.json`);

      printed = true;
    }
  }
}

async function stopChildren(
  signal: StopSignal,
  cloudflared: Bun.Subprocess,
  vite: Bun.Subprocess,
): Promise<void> {
  cloudflared.kill(signal);
  await cloudflared.exited;

  vite.kill(signal);
  await vite.exited;
}

if (import.meta.main) {
  process.exit(await runOwlbearDev(process.env));
}
