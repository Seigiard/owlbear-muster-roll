import { LAUNCH_FILE_VARIABLE } from '../src/preview/protocol';
import { runDevServer, type DevServerEnvironment, type DevServerLaunch } from './dev-server';

const ROOM_PAGE = '/room.html';

export function roomLaunch(environment: DevServerEnvironment): DevServerLaunch {
  const env = { ...environment };

  delete env[LAUNCH_FILE_VARIABLE];

  return {
    cmd: ['bunx', 'vite', '--mode', 'mock', '--open', ROOM_PAGE],
    env,
  };
}

if (import.meta.main) {
  process.exit(await runDevServer(roomLaunch(process.env)));
}
