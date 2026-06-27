import assert from 'node:assert/strict';
import { allocateDungeonRooms } from '../src-server/services/rogueRooms';

const pickedIds = ['q_1', 'q_2', 'q_3', 'q_4'];
const roomTypes = ['normal', 'danger', 'elite', 'danger', 'normal', 'elite', 'danger', 'elite', 'boss', 'normal', 'normal', 'normal'] as const;

const rooms = allocateDungeonRooms({
  pickedIds,
  roomTypes,
  pickRoomName: (type, index) => `${index + 1}-${type}`,
});

const playableRooms = rooms.filter((room) => room.type !== 'rest');
assert.ok(playableRooms.length > 0, 'dungeon should contain playable rooms');
assert.equal(rooms.flatMap((room) => room.question_ids).length, pickedIds.length, 'all picked questions should be assigned');
assert.equal(
  playableRooms.every((room) => room.question_ids.length > 0),
  true,
  `playable rooms should not be empty: ${JSON.stringify(rooms)}`,
);
assert.equal(rooms.at(-1)?.type, 'boss', 'last playable room should be boss');
assert.equal(rooms.at(-1)?.question_ids.length, 1, 'boss room should have one question');
