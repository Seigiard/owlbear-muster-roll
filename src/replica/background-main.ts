import { platform, timing } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, timing), {
      timing,
    });

    // A closing tab still sends its held commits.
    window.addEventListener('pagehide', engine.flushNow);

    // AD-7: a page that becomes visible, resumes from a freeze or comes back online may have
    // missed commits, so it catches up.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        engine.catchUp();
      }
    });
    document.addEventListener('resume', engine.catchUp);
    window.addEventListener('online', engine.catchUp);
  } catch (error) {
    console.error('Muster Roll could not start its replica', error);
  }
}
