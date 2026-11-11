import { platform, timing } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';
// The roll strings, the one text the background shows. The engine takes them as an option.
import { copy } from '@/ui/copy';

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, timing), {
      timing,
      rollCopy: copy,
    });

    // A closing tab still sends its held commits.
    window.addEventListener('pagehide', engine.flushNow);

    // AD-7: a page that becomes visible, resumes from a freeze or comes back online may have
    // missed commits, so it catches up. AD-8: a page that becomes hidden writes the room copy.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        engine.catchUp();
      } else {
        engine.pageHidden();
      }
    });
    document.addEventListener('resume', engine.catchUp);
    window.addEventListener('online', engine.catchUp);
  } catch (error) {
    console.error('Muster Roll could not start its replica', error);
  }
}
