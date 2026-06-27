export type DungeonRoomType = 'safe' | 'normal' | 'danger' | 'elite' | 'weak_point' | 'rest' | 'boss';

export type AllocatedDungeonRoom = {
  id: string;
  type: DungeonRoomType;
  name: string;
  question_ids: string[];
};

export function allocateDungeonRooms(opts: {
  pickedIds: string[];
  roomTypes: readonly DungeonRoomType[];
  pickRoomName: (type: DungeonRoomType, index: number) => string;
}): AllocatedDungeonRoom[] {
  const pickedIds = [...opts.pickedIds];
  if (!pickedIds.length) return [];

  const bossQuestionId = pickedIds.pop()!;
  const plannedPlayableTypes = opts.roomTypes.filter((type) => type !== 'rest' && type !== 'boss');
  const rooms: AllocatedDungeonRoom[] = [];
  let plannedIndex = 0;

  while (pickedIds.length) {
    const type = plannedPlayableTypes[plannedIndex] || 'normal';
    const capacity = Math.min(roomCapacity(type), pickedIds.length);
    const questionIds = pickedIds.splice(0, capacity);
    if (questionIds.length) {
      rooms.push({
        id: `room_${rooms.length + 1}`,
        type,
        name: opts.pickRoomName(type, rooms.length),
        question_ids: questionIds,
      });
    }
    plannedIndex += 1;
  }

  rooms.push({
    id: `room_${rooms.length + 1}`,
    type: 'boss',
    name: opts.pickRoomName('boss', rooms.length),
    question_ids: [bossQuestionId],
  });

  return rooms;
}

function roomCapacity(type: DungeonRoomType) {
  if (type === 'elite' || type === 'weak_point') return 2;
  return 1;
}
