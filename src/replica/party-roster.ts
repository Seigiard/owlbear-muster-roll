import type { PartyMember, PartyPort, PlayerRole } from '@/platform/ports';

export type RoomSender = { role: PlayerRole; playerId: string };

export type PartyRoster = {
  // The sender behind a connection id, or `null` when the party does not know it after one re-read.
  senderOf: (connectionId: string) => Promise<RoomSender | null>;
  stop: () => void;
};

// AD-5: a room message names its sender only by connection id, and the party port maps it to a role
// and a player id. Another GM connection of the same account is a member of its own.
export function createPartyRoster(party: PartyPort): PartyRoster {
  let members = new Map<string, RoomSender>();
  // Counts party changes, so a read that started before one cannot bring the older list back.
  let epoch = 0;
  // Concurrent misses wait for one read instead of starting one each.
  let reading: Promise<void> | null = null;

  function replace(players: readonly PartyMember[]): void {
    members = new Map(
      players.map((player) => [player.connectionId, { role: player.role, playerId: player.id }]),
    );
  }

  async function read(): Promise<void> {
    const started = epoch;

    try {
      const players = await party.getPlayers();

      if (epoch === started) {
        replace(players);
      }
    } catch (error) {
      console.error('Muster Roll could not read the party', error);
    } finally {
      reading = null;
    }
  }

  function reread(): Promise<void> {
    reading ??= read();

    return reading;
  }

  const unsubscribe = party.onChange((players) => {
    epoch += 1;
    replace(players);
  });

  // Fills the map before the first message, so a known sender usually needs no read of its own.
  void reread();

  return {
    senderOf: async (connectionId) => {
      const known = members.get(connectionId);

      if (known !== undefined) {
        return known;
      }

      // A sender that joined a moment ago can be missing from the last change.
      await reread();

      return members.get(connectionId) ?? null;
    },
    stop: unsubscribe,
  };
}
