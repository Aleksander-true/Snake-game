import {
  MAX_NETWORK_PARTICIPANTS,
  validateRoomConfig,
  type RoomConfigDTO,
} from '../packages/contracts/src';

function createValidRoomConfig(): RoomConfigDTO {
  return {
    name: 'Комната друзей',
    visibility: 'public',
    humanSlots: 2,
    bots: [
      { replaceableByPlayerBetweenRounds: true },
      { replaceableByPlayerBetweenRounds: false },
    ],
    difficultyLevel: 5,
    gameMode: 'classic',
  };
}

describe('network contracts', () => {
  test('accepts a valid mixed room configuration', () => {
    expect(validateRoomConfig(createValidRoomConfig())).toEqual({ valid: true, errors: [] });
  });

  test('rejects rooms exceeding the shared human and bot limit', () => {
    const config = createValidRoomConfig();
    config.humanSlots = MAX_NETWORK_PARTICIPANTS;

    const result = validateRoomConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`Human and bot slots must not exceed ${MAX_NETWORK_PARTICIPANTS}`);
  });

  test('rejects malformed replaceable bot slots from untrusted input', () => {
    const config = { ...createValidRoomConfig(), bots: [{}] };

    const result = validateRoomConfig(config);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Every bot slot must define replaceableByPlayerBetweenRounds');
  });
});
