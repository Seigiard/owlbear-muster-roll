export type DevServerEnvironment = Readonly<Record<string, string | undefined>>;

export type DevServerLaunch = { cmd: string[]; env: DevServerEnvironment };

export async function runDevServer(launch: DevServerLaunch): Promise<number> {
  const server = Bun.spawn({
    cmd: launch.cmd,
    env: launch.env,
    stdio: ['inherit', 'inherit', 'inherit'],
  });

  // A terminal's Ctrl-C reaches both processes, but a plain `kill` of this one would leave the
  // server.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
      server.kill(signal);
    });
  }

  return server.exited;
}
