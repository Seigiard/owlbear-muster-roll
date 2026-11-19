import { platform, timing } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';
// The roll strings, the token menu labels, "Нет прав на правку", "Правка слишком большая" and
// "Данные комнаты заменены", the only text the background shows. The engine takes them as options.
import { copy } from '@/copy';

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  const engine = await startReplicaEngine(platform, createSendQueue(platform.broadcast, timing), {
    timing,
    rollCopy: copy,
    menuCopy: {
      linkSheet: copy.command.linkSheet,
      unlinkSheet: copy.command.unlinkSheet,
      openSheet: copy.command.openSheet,
      unlinkFailed: copy.unlinkFailed,
    },
    editDenied: copy.editDenied,
    editTooLarge: copy.editTooLarge,
    dataReplaced: copy.dataReplaced,
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
}
