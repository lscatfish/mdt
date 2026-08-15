export const CFG = {
  CHUNK_SIZE: 16,
  CHUNK_HEIGHT: 64,
  SEA_LEVEL: 20,

  // 以区块为单位的渲染/生成半径
  RENDER_DISTANCE: 4,
  GEN_DISTANCE: 5,

  // 玩家物理
  GRAVITY: 26,
  JUMP_SPEED: 8.6,
  WALK_SPEED: 4.4,
  SPRINT_SPEED: 6.4,
  SNEAK_SPEED: 1.8,
  FLY_SPEED: 10,
  PLAYER_WIDTH: 0.6,
  PLAYER_HEIGHT: 1.8,
  EYE_HEIGHT: 1.62,

  // 交互
  REACH: 6,
  PLACE_COOLDOWN: 0.22,

  // 昼夜(秒)
  DAY_LENGTH: 600,

  // 存档
  SAVE_KEY: "webcraft.save.v1",
  AUTOSAVE_INTERVAL: 15,
};
