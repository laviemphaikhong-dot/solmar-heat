// Solmar Heat — shared tuning: the city grid, the sun-soaked palette and the numbers every
// other module drives by. One source of truth so the world, the physics and the minimap agree.

/** Fixed simulation step, in seconds: the world advances in these and only these. */
export const STEP = 1 / 60;

/** Streets are ROAD wide; a city block is BLOCK square; PITCH is one block plus one street. */
export const ROAD = 96;
export const BLOCK = 264;
export const PITCH = ROAD + BLOCK;

/** The city grid: COLS by ROWS blocks, with a beach and the sea along the east edge. */
export const COLS = 7;
export const ROWS = 7;
export const GRID_W = COLS * BLOCK + (COLS + 1) * ROAD;
export const GRID_H = ROWS * BLOCK + (ROWS + 1) * ROAD;
export const BEACH_W = 190;
export const SEA_W = 300;
export const WORLD_W = GRID_W + BEACH_W + SEA_W;
export const WORLD_H = GRID_H;

/** Sidewalk rim around each block, in pixels; buildings sit inside it. */
export const SIDEWALK = 20;

/** The player on foot. */
export const WALK_SPEED = 148;
export const SPRINT_SPEED = 232;
export const PLAYER_RADIUS = 11;
export const PLAYER_HEALTH = 100;

/** Cars: shared physics for the player's ride, traffic and police. */
export const CAR_LENGTH = 46;
export const CAR_WIDTH = 22;
export const CAR_ACCEL = 300;
export const CAR_BRAKE = 460;
export const CAR_REVERSE = 120;
export const CAR_MAX_SPEED = 430;
export const CAR_MAX_REVERSE = 130;
export const CAR_TURN = 2.6;
export const CAR_HEALTH = 100;

/** Wanted heat: offences add heat, stars are read off it, and it cools when unseen. */
export const HEAT_PER_STAR = 30;
export const MAX_STARS = 5;
export const HEAT_STEAL = 30;
export const HEAT_HIT_CAR = 12;
export const HEAT_HIT_PED = 45;
export const HEAT_PUNCH = 25;
export const BUST_SECONDS = 2.4;
export const POLICE_SIGHT = 560;

/** How many neighbours the city keeps alive around the player. */
export const TRAFFIC_COUNT = 11;
export const PED_COUNT = 26;
export const PARKED_COUNT = 26;

/** Colours of Solmar Bay: warm asphalt, pastel roofs, turquoise sea. */
export const COLORS = {
  asphalt: '#4a4a52',
  asphaltDark: '#41414a',
  laneMark: '#e8d98a',
  kerb: '#9a958c',
  sidewalk: '#cbbfa9',
  grass: '#79b657',
  grassDark: '#6aa84e',
  sand: '#ecd28f',
  sea: '#2fa8b8',
  seaDeep: '#1f8ea3',
  plaza: '#d9c9a3',
  shadow: 'rgba(46, 32, 20, 0.28)',
  beacon: 'rgba(255, 196, 64, 0.30)',
  objective: '#ffc440',
  policeBlue: '#274bdb',
  policeRed: '#e33f4e',
  health: '#57d95e',
  healthLow: '#e33f4e',
  cash: '#7be382',
};

/** Roof palettes by district: downtown glass, old-town terracotta, suburbs pastel. */
export const ROOFS_DOWNTOWN = ['#7f9fb8', '#93a8b8', '#6d8ca6', '#a8bcc9', '#87a3b5'];
export const ROOFS_OLD_TOWN = ['#c96f4a', '#d0815a', '#b85f43', '#cf7a52', '#e09a6d'];
export const ROOFS_SUBURB = ['#d9b8a3', '#c9d1b8', '#e3cfa8', '#b8c9d9', '#e0b7b0', '#cbb8d9'];

/** Paint jobs for civilian cars. */
export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8b93e', '#57a773', '#e8e4da', '#8a5fc0', '#e07b39', '#3fb8af', '#c94f7c', '#5a6b7a'];

/** Shopfront names the sign painter cycles through: every one invented for Solmar Bay. */
export const SHOP_NAMES = [
  'CAFE MARISOL', 'HOTEL AZUL', 'PALMS MALL', 'SOLMAR BANK', 'TACO SOL', 'DISCO FARO',
  'GYM OLE', 'BAKERY LUNA', 'MARINA BAR', 'CINEMA REY', 'FLORIST VELA', 'PIZZA BRASA',
  'BOOKS FARO', 'SURF SHACK', 'PHARMACY SOL', 'DINER BRISA', 'CLUB NEON', 'MARKET DIA',
];
