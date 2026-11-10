import { TIMING } from '@/core/timing';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING));

    // A closing tab still sends its held commits.
    window.addEventListener('pagehide', engine.flushNow);
  } catch (error) {
    console.error('Muster Roll could not start its replica', error);
  }
}
