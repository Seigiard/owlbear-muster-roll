import { runDevServer, type DevServerEnvironment, type DevServerLaunch } from './dev-server';

const DEFAULT_PORT = '5173';

export function portContractLiveLaunch(environment: DevServerEnvironment): DevServerLaunch {
  const port = environment.PORT_CONTRACT_LIVE_PORT ?? DEFAULT_PORT;

  return {
    cmd: ['bunx', 'vite', '--host', '0.0.0.0', '--port', port, '--strictPort'],
    env: { ...environment },
  };
}

if (import.meta.main) {
  const port = process.env.PORT_CONTRACT_LIVE_PORT ?? DEFAULT_PORT;
  console.log(`Port contract live harness: http://127.0.0.1:${port}/port-contract-live.html`);
  console.log(
    `Dev-only OBR manifest: http://127.0.0.1:${port}/tests/port-contract-live/manifest.json`,
  );
  console.log('Expose this server through HTTPS, install the dev manifest, and use an empty room.');
  process.exit(await runDevServer(portContractLiveLaunch(process.env)));
}
