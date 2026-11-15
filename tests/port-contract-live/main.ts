import { copy } from '@/copy';
import { platform } from '@/platform/current';

import {
  broadcastPreservesOneSenderArrivalOrder,
  localBroadcastReachesTheSenderClientOnly,
  metadataMergesRetainedEntriesAndDeletesUndefinedEntries,
  remoteBroadcastReachesAnotherClientAndDoesNotEcho,
  storageStoresOverwritesRemovesAndListsOwnedStrings,
  type ScenarioSupportReport,
} from '../support/port-contract';
import {
  cleanupStorageNamespace,
  createLiveCoordinator,
  livePortContractSupport,
  startLiveLocalPeer,
  startLivePeer,
  type LiveCoordinator,
} from './factory';

type OwnerRole = 'coordinator' | 'peer';

type HarnessRole = OwnerRole | 'local-peer';

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const root = document.querySelector<HTMLDivElement>('#root');

if (root === null) {
  throw new Error(copy.portContractLive.rootMissing);
}

const params = new URLSearchParams(window.location.search);
const requestedRole = params.get('role');
const harnessRole = parseRole(requestedRole);
const requestedRunId = params.get('run');

const runId =
  requestedRunId ??
  (requestedRole === 'peer' || requestedRole === 'local-peer' ? '' : crypto.randomUUID());

renderShell(
  root,
  harnessRole ?? requestedRole ?? copy.portContractLive.rolePicker.defaultRole,
  runId,
);

if (!isValidRunId(runId)) {
  setStatus(root, copy.portContractLive.status.invalidRunId, 'error');
} else if (harnessRole === undefined) {
  setStatus(root, copy.portContractLive.status.invalidRole, 'error');
} else if (harnessRole === null) {
  renderRolePicker(root, runId);
} else {
  await startHarness(root, harnessRole, runId);
}

function parseRole(value: string | null): HarnessRole | null | undefined {
  if (value === null) {
    return null;
  }

  return value === 'coordinator' || value === 'peer' || value === 'local-peer' ? value : undefined;
}

function isValidRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value);
}

function renderRolePicker(container: HTMLDivElement, currentRunId: string): void {
  const main = container.querySelector('main');

  if (main === null) {
    return;
  }

  const section = document.createElement('section');
  section.dataset.rolePicker = 'true';

  const heading = document.createElement('h2');
  heading.textContent = copy.portContractLive.rolePicker.heading;
  section.append(heading);

  const instructions = document.createElement('p');
  instructions.textContent = copy.portContractLive.rolePicker.instructions;
  section.append(instructions);

  const label = document.createElement('label');
  label.textContent = copy.portContractLive.rolePicker.runIdLabel;
  const input = document.createElement('input');
  input.id = 'run-id-input';
  input.type = 'text';
  input.value = currentRunId;
  input.autocomplete = 'off';
  label.append(input);
  section.append(label);

  const coordinatorButton = buttonIn(section, copy.portContractLive.rolePicker.coordinator);
  coordinatorButton.addEventListener('click', () => {
    void startSelectedRole(container, 'coordinator');
  });

  const peerButton = buttonIn(section, copy.portContractLive.rolePicker.peer);
  peerButton.addEventListener('click', () => {
    void startSelectedRole(container, 'peer');
  });

  main.append(section);
}

async function startSelectedRole(
  container: HTMLDivElement,
  selectedRole: OwnerRole,
): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('#run-id-input');
  const selectedRunId = input?.value.trim() ?? '';

  if (!isValidRunId(selectedRunId)) {
    setStatus(container, copy.portContractLive.status.invalidRunId, 'error');

    return;
  }

  const nextParams = new URLSearchParams();
  nextParams.set('run', selectedRunId);
  nextParams.set('role', selectedRole);
  window.history.replaceState(null, '', `${window.location.pathname}?${nextParams.toString()}`);
  await startHarness(container, selectedRole, selectedRunId);
}

async function startHarness(
  container: HTMLDivElement,
  selectedRole: HarnessRole,
  selectedRunId: string,
): Promise<void> {
  container.querySelector('[data-role-picker]')?.remove();
  updateActiveRun(container, selectedRole, selectedRunId);
  const nextParams = new URLSearchParams();
  nextParams.set('run', selectedRunId);
  nextParams.set('role', selectedRole);
  window.history.replaceState(null, '', `${window.location.pathname}?${nextParams.toString()}`);

  try {
    await waitUntilReady();

    if (selectedRole === 'peer') {
      await startPeer(container, selectedRunId);
    } else if (selectedRole === 'local-peer') {
      await startLocalPeer(container, selectedRunId);
    } else {
      await startCoordinator(container, selectedRunId);
    }
  } catch (error) {
    setStatus(container, copy.portContractLive.error.harness(String(error)), 'error');
  }
}

async function startCoordinator(container: HTMLDivElement, currentRunId: string): Promise<void> {
  const coordinator = await createLiveCoordinator(currentRunId);
  const runButton = button(container, copy.portContractLive.command.run);
  const cleanupButton = button(container, copy.portContractLive.command.cleanup);
  const result = element(container, 'pre');

  setStatus(container, copy.portContractLive.status.waitingForPeer, 'waiting');
  appendSupportReport(result, livePortContractSupport(coordinator.factory));

  runButton.addEventListener('click', () => {
    void runContract(container, coordinator, result);
  });
  cleanupButton.addEventListener('click', () => {
    void cleanupCoordinator(container, coordinator, result);
  });
  window.addEventListener('pagehide', coordinator.close, { once: true });

  await coordinator.waitForPeer();
  setStatus(container, copy.portContractLive.status.peerJoined, 'ready');
  appendPeer(result, coordinator);
}

async function startPeer(container: HTMLDivElement, currentRunId: string): Promise<void> {
  const peer = await startLivePeer(currentRunId);
  const cleanupButton = button(container, copy.portContractLive.command.cleanupLocal);

  cleanupButton.addEventListener('click', () => {
    try {
      cleanupStorageNamespace(platform.storage, `port-contract-live:${currentRunId}:`);
      setStatus(container, copy.portContractLive.status.localCleaned, 'ready');
    } catch (error) {
      setStatus(container, copy.portContractLive.error.cleanup(String(error)), 'error');
    }
  });

  setStatus(container, copy.portContractLive.status.peerReady, 'ready');
  window.addEventListener('pagehide', () => {
    peer.close();
  });
}

async function startLocalPeer(container: HTMLDivElement, currentRunId: string): Promise<void> {
  const localPeer = await startLiveLocalPeer(currentRunId);

  setStatus(container, copy.portContractLive.status.localPeerReady, 'ready');
  window.addEventListener('pagehide', () => {
    localPeer.close();
  });
}

async function runContract(
  container: HTMLDivElement,
  coordinator: LiveCoordinator,
  result: HTMLPreElement,
): Promise<void> {
  setStatus(container, copy.portContractLive.status.running, 'running');

  try {
    await coordinator.waitForPeer();

    const observations = {
      storage: await storageStoresOverwritesRemovesAndListsOwnedStrings(coordinator.factory),
      local: await localBroadcastReachesTheSenderClientOnly(coordinator.factory),
      remote: await remoteBroadcastReachesAnotherClientAndDoesNotEcho(coordinator.factory),
      order: await broadcastPreservesOneSenderArrivalOrder(coordinator.factory),
      metadata: await metadataMergesRetainedEntriesAndDeletesUndefinedEntries(coordinator.factory),
    };

    result.textContent = JSON.stringify(observations, null, 2);
    setStatus(container, copy.portContractLive.status.finished, 'ready');
  } catch (error) {
    setStatus(container, copy.portContractLive.error.scenario(String(error)), 'error');
  }
}

async function cleanupCoordinator(
  container: HTMLDivElement,
  coordinator: LiveCoordinator,
  result: HTMLPreElement,
): Promise<void> {
  try {
    await coordinator.cleanup();
    result.textContent = `${result.textContent}\n\n${copy.portContractLive.status.cleaned}`;
    setStatus(container, copy.portContractLive.status.cleaned, 'ready');
  } catch (error) {
    setStatus(container, copy.portContractLive.error.cleanup(String(error)), 'error');
  }
}

function renderShell(container: HTMLDivElement, currentRole: string, currentRunId: string): void {
  const main = document.createElement('main');
  const heading = document.createElement('h1');
  heading.textContent = copy.portContractLive.title;
  main.append(heading);

  const roleLabel = document.createElement('p');
  roleLabel.dataset.roleLabel = 'true';
  roleLabel.textContent = copy.portContractLive.role(currentRole);
  main.append(roleLabel);

  const run = document.createElement('p');
  run.dataset.runId = 'true';
  run.textContent = copy.portContractLive.runId(currentRunId);
  main.append(run);

  const status = document.createElement('p');
  status.id = 'status';
  status.textContent = copy.portContractLive.status.connecting;
  main.append(status);

  const limits = document.createElement('section');
  const limitsHeading = document.createElement('h2');
  limitsHeading.textContent = copy.portContractLive.limits.heading;
  limits.append(limitsHeading);

  const room = document.createElement('p');
  room.textContent = copy.portContractLive.limits.room;
  limits.append(room);

  const local = document.createElement('p');
  local.textContent = copy.portContractLive.limits.local;
  limits.append(local);

  const host = document.createElement('p');
  host.textContent = copy.portContractLive.limits.host;
  limits.append(host);

  main.append(limits);
  container.replaceChildren(main);
}

function appendSupportReport(result: HTMLPreElement, support: ScenarioSupportReport[]): void {
  result.textContent = `${copy.portContractLive.supportBoundaries}\n${JSON.stringify(support, null, 2)}`;
}

function appendPeer(result: HTMLPreElement, coordinator: LiveCoordinator): void {
  const peer = coordinator.peer();

  if (peer !== null) {
    result.textContent = `${result.textContent}\n\n${copy.portContractLive.peer(peer.connectionId)}`;
  }
}

function button(container: HTMLDivElement, label: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  container.querySelector('main')?.append(control);

  return control;
}

function buttonIn(container: HTMLElement, label: string): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  container.append(control);

  return control;
}

function element(container: HTMLDivElement, tagName: 'pre'): HTMLPreElement {
  const created = document.createElement(tagName);
  container.querySelector('main')?.append(created);

  return created;
}

function setStatus(container: HTMLDivElement, message: string, state: string): void {
  const status = container.querySelector<HTMLParagraphElement>('#status');

  if (status !== null) {
    status.dataset.state = state;
    status.textContent = message;
  }
}

function updateActiveRun(
  container: HTMLDivElement,
  selectedRole: HarnessRole,
  selectedRunId: string,
): void {
  const roleLabel = container.querySelector<HTMLParagraphElement>('[data-role-label]');
  const run = container.querySelector<HTMLParagraphElement>('[data-run-id]');

  if (roleLabel !== null) {
    roleLabel.textContent = copy.portContractLive.role(selectedRole);
  }

  if (run !== null) {
    run.textContent = copy.portContractLive.runId(selectedRunId);
  }
}

function waitUntilReady(): Promise<void> {
  return new Promise((resolve) => {
    platform.onReady(resolve);
  });
}
