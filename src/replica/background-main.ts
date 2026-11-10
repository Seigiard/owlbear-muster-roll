import { TIMING } from '@/core/timing';
import { platform } from '@/platform/current';
import { createSendQueue } from '@/platform/send-queue';
import { startReplicaEngine } from '@/replica/engine';

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    await startReplicaEngine(platform, createSendQueue(platform.broadcast, TIMING));
  } catch (error) {
    console.error('Muster Roll could not start its replica', error);
  }
}
