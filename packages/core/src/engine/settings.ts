/**
 * Runtime game settings — the single source of truth for ALL game parameters.
 * Default values are loaded from gameDefaults.json.
 * The dev panel can override any field at runtime.
 * All game systems read from the `gameSettings` singleton.
 */
import defaults from '../gameDefaults.json';

/* ====== Per-level overrides ====== */

export interface LevelOverride {
  wallClusters?: number;
  wallLength?: number;
  foodCount?: number;
}

export type LevelSettingsOverride = Record<string, number | string>;

export type BotProfileId = 'rookie' | 'basic' | 'solid' | 'wise';

export interface BotSkillProfileSettings {
  trapPenalty: number;
  areaWeight: number;
  escapeWeight: number;
  foodWeight: number;
  immediateEatWeight: number;
  fearWeight: number;
  longSnakeThreshold: number;
  longSnakeFoodPenalty: number;
  mistakePeriod: number;
  badMoveBias: number;
}

export type BotProfilesSettings = Record<BotProfileId, BotSkillProfileSettings>;

/* ====== Main settings interface ====== */

export interface GameSettings {
  /* Snake */
  hungerThreshold: number;
  minSnakeLength: number;
  initialSnakeLength: number;

  /* Food — lifecycle */
  foodYoungAge: number;
  foodAdultAge: number;
  foodMaxAge: number;

  /* Food — spawning */
  foodMinDistance: number;

  /* Food — reproduction */
  reproductionMinCooldown: number;
  reproductionProbabilityBase: number;
  maxReproductions: number;
  neighborReproductionRadius: number;
  neighborReproductionPenalty: number;
  maxReproductionNeighbors: number;
  /** Legacy compatibility setting; the shared food limit replaces it. */
  appleReproductionLimitBase: number;
  foodReproductionLimitBase: number;

  /* Food — generation formula */
  foodCountPerSnakeCoeff: number;
  foodCountBase: number;
  foodPeriodicSpawnInterval: number;

  /* Chicken food */
  chickenSpawnStartLevel: number;
  chickenSpawnProbability: number;
  chickenCrowdedSpawnProbability: number;
  chickenCrowdedApplePerSnakeMultiplier: number;
  chickenCrowdedAppleCount: number;
  chickenGuaranteedSpawnAppleCount: number;
  chickenChickRoamRadius: number;
  chickenChickMoveInterval: number;
  chickenAdultThreatRadius: number;
  chickenAdultSafetyRadius: number;
  chickenAdultMoveInterval: number;
  chickenOvercrowdingRadius: number;
  /** Legacy compatibility setting; probabilistic laying does not use it. */
  chickenEggLayingInterval: number;
  chickenEggLayingProbability: number;
  chickenAppleAgeReduction: number;
  chickenAppleReproductionReduction: number;
  /** Legacy compatibility setting; the shared food limit replaces it. */
  chickenReproductionLimitBase: number;
  chickenMaxEggs: number;
  chickenEggScoreValue: number;
  chickenEggGrowthValue: number;
  chickenChickScoreValue: number;
  chickenChickGrowthValue: number;
  chickenAdultScoreValue: number;
  chickenAdultGrowthValue: number;

  /* Meat food */
  meatMaxAge: number;
  meatScoreValue: number;
  meatGrowthValue: number;

  /* Hedgehog enemy */
  hedgehogSpawnStartLevel: number;
  hedgehogSecondSpawnStartLevel: number;
  hedgehogWidth: number;
  hedgehogHeight: number;
  hedgehogSpawnSnakeDistance: number;
  hedgehogMoveInterval: number;
  hedgehogFrontVisionRadius: number;
  hedgehogRearVisionRadius: number;
  hedgehogAboveVisionRadius: number;
  hedgehogBelowVisionRadius: number;
  hedgehogFoodVisionRadius: number;
  hedgehogPopulationPercentPerLevel: number;
  hedgehogSpawnWindowTicks: number;
  hedgehogSpawnChanceDivisor: number;
  hedgehogBotThreatRadius: number;
  hedgehogBotEscapeWeight: number;
  hedgehogExtraChanceSlope: number;
  hedgehogExtraChanceIntercept: number;

  /* Walls — generation formulas */
  wallClusterCoeff: number;
  wallClusterBase: number;
  wallLengthCoeff: number;
  wallLengthBase: number;

  /* Scoring — target formula */
  targetScoreCoeff: number;
  targetScoreBase: number;

  /* Board / levels */
  baseWidth: number;
  baseHeight: number;
  levelSizeIncrement: number;
  survivalMaxBoardLevel: number;
  levelTimeLimit: number;
  tickIntervalMs: number;

  /* AI / Vision */
  visionSize: number;
  obstacleSignalClose: number;
  obstacleSignalDecay: number;
  foodSignalClose: number;
  foodSignalDecay: number;
  foodSignalMin: number;
  botProfiles: BotProfilesSettings;

  /* Colors (canvas) */
  colorBg: string;
  colorGrid: string;
  colorWall: string;
  colorFoodAdult: string;
  colorFoodYoung: string;
  colorFoodOld: string;
  colorHeadStroke: string;
  snakeColors: string[];

  /* Per-level overrides (keyed by level number as string) */
  levelOverrides: Record<string, LevelOverride>;
  levelSettingsOverrides: Record<string, LevelSettingsOverride>;
  fieldScopes: Record<string, boolean>;

}

/* ====== Build defaults from JSON ====== */

export function createDefaultSettings(): GameSettings {
  const defaultJson = defaults;
  const fieldScopes = createDefaultFieldScopes();
  const settings: GameSettings = {
    hungerThreshold:              defaultJson.snake.hungerThreshold,
    minSnakeLength:               defaultJson.snake.minSnakeLength,
    initialSnakeLength:           defaultJson.snake.initialSnakeLength,

    foodYoungAge:               defaultJson.food.youngAge,
    foodAdultAge:               defaultJson.food.adultAge,
    foodMaxAge:                 defaultJson.food.maxAge,
    foodMinDistance:            defaultJson.food.minDistance,
    reproductionMinCooldown:    defaultJson.food.reproductionMinCooldown,
    reproductionProbabilityBase: defaultJson.food.reproductionProbabilityBase,
    maxReproductions:           defaultJson.food.maxReproductions,
    neighborReproductionRadius: defaultJson.food.neighborReproductionRadius,
    neighborReproductionPenalty: defaultJson.food.neighborReproductionPenalty,
    maxReproductionNeighbors:   defaultJson.food.maxReproductionNeighbors,
    appleReproductionLimitBase: defaultJson.food.appleReproductionLimitBase,
    foodReproductionLimitBase: defaultJson.food.reproductionLimitBase,
    foodCountPerSnakeCoeff:     defaultJson.food.countPerSnakeCoeff,
    foodCountBase:              defaultJson.food.countBase,
    foodPeriodicSpawnInterval:  defaultJson.food.periodicSpawnInterval,

    chickenSpawnStartLevel:     defaultJson.chicken.spawnStartLevel,
    chickenSpawnProbability:    defaultJson.chicken.spawnProbability,
    chickenCrowdedSpawnProbability: defaultJson.chicken.crowdedSpawnProbability,
    chickenCrowdedApplePerSnakeMultiplier: defaultJson.chicken.crowdedApplePerSnakeMultiplier,
    chickenCrowdedAppleCount: defaultJson.chicken.crowdedAppleCount,
    chickenGuaranteedSpawnAppleCount: defaultJson.chicken.guaranteedSpawnAppleCount,
    chickenChickRoamRadius:     defaultJson.chicken.chickRoamRadius,
    chickenChickMoveInterval:   defaultJson.chicken.chickMoveInterval,
    chickenAdultThreatRadius:   defaultJson.chicken.adultThreatRadius,
    chickenAdultSafetyRadius:   defaultJson.chicken.adultSafetyRadius,
    chickenAdultMoveInterval:   defaultJson.chicken.adultMoveInterval,
    chickenOvercrowdingRadius:  defaultJson.chicken.overcrowdingRadius,
    chickenEggLayingInterval:   defaultJson.chicken.eggLayingInterval,
    chickenEggLayingProbability: defaultJson.chicken.eggLayingProbability,
    chickenAppleAgeReduction:   defaultJson.chicken.appleAgeReduction,
    chickenAppleReproductionReduction: defaultJson.chicken.appleReproductionReduction,
    chickenReproductionLimitBase: defaultJson.chicken.reproductionLimitBase,
    chickenMaxEggs:             defaultJson.chicken.maxEggs,
    chickenEggScoreValue:       defaultJson.chicken.eggScoreValue,
    chickenEggGrowthValue:      defaultJson.chicken.eggGrowthValue,
    chickenChickScoreValue:     defaultJson.chicken.chickScoreValue,
    chickenChickGrowthValue:    defaultJson.chicken.chickGrowthValue,
    chickenAdultScoreValue:     defaultJson.chicken.adultScoreValue,
    chickenAdultGrowthValue:    defaultJson.chicken.adultGrowthValue,

    meatMaxAge:                 defaultJson.meat.maxAge,
    meatScoreValue:             defaultJson.meat.scoreValue,
    meatGrowthValue:            defaultJson.meat.growthValue,

    hedgehogSpawnStartLevel:    defaultJson.hedgehog.spawnStartLevel,
    hedgehogSecondSpawnStartLevel: defaultJson.hedgehog.secondSpawnStartLevel,
    hedgehogWidth:              defaultJson.hedgehog.width,
    hedgehogHeight:             defaultJson.hedgehog.height,
    hedgehogSpawnSnakeDistance: defaultJson.hedgehog.spawnSnakeDistance,
    hedgehogMoveInterval:       defaultJson.hedgehog.moveInterval,
    hedgehogFrontVisionRadius:  defaultJson.hedgehog.frontVisionRadius,
    hedgehogRearVisionRadius:   defaultJson.hedgehog.rearVisionRadius,
    hedgehogAboveVisionRadius:  defaultJson.hedgehog.aboveVisionRadius,
    hedgehogBelowVisionRadius:  defaultJson.hedgehog.belowVisionRadius,
    hedgehogFoodVisionRadius:   defaultJson.hedgehog.foodVisionRadius,
    hedgehogPopulationPercentPerLevel: defaultJson.hedgehog.populationPercentPerLevel,
    hedgehogSpawnWindowTicks:   defaultJson.hedgehog.spawnWindowTicks,
    hedgehogSpawnChanceDivisor: defaultJson.hedgehog.spawnChanceDivisor,
    hedgehogBotThreatRadius:    defaultJson.hedgehog.botThreatRadius,
    hedgehogBotEscapeWeight:    defaultJson.hedgehog.botEscapeWeight,
    hedgehogExtraChanceSlope:   defaultJson.hedgehog.extraChanceSlope,
    hedgehogExtraChanceIntercept: defaultJson.hedgehog.extraChanceIntercept,

    wallClusterCoeff:             defaultJson.walls.clusterCoeff,
    wallClusterBase:              defaultJson.walls.clusterBase,
    wallLengthCoeff:              defaultJson.walls.lengthCoeff,
    wallLengthBase:               defaultJson.walls.lengthBase,

    targetScoreCoeff:             defaultJson.scoring.targetScoreCoeff,
    targetScoreBase:              defaultJson.scoring.targetScoreBase,

    baseWidth:                    defaultJson.board.baseWidth,
    baseHeight:                   defaultJson.board.baseHeight,
    levelSizeIncrement:           defaultJson.board.levelSizeIncrement,
    survivalMaxBoardLevel:        defaultJson.board.survivalMaxBoardLevel,
    levelTimeLimit:               defaultJson.board.levelTimeLimit,
    tickIntervalMs:               defaultJson.board.tickIntervalMs,

    visionSize:                   defaultJson.ai.visionSize,
    obstacleSignalClose:          defaultJson.ai.obstacleSignalClose,
    obstacleSignalDecay:          defaultJson.ai.obstacleSignalDecay,
    foodSignalClose:            defaultJson.ai.foodSignalClose,
    foodSignalDecay:            defaultJson.ai.foodSignalDecay,
    foodSignalMin:              defaultJson.ai.foodSignalMin,
    botProfiles: deepCopyBotProfiles(defaultJson.ai.botProfiles),

    colorBg:                      defaultJson.colors.bg,
    colorGrid:                    defaultJson.colors.grid,
    colorWall:                    defaultJson.colors.wall,
    colorFoodAdult:             defaultJson.colors.foodAdult,
    colorFoodYoung:             defaultJson.colors.foodYoung,
    colorFoodOld:               defaultJson.colors.foodOld,
    colorHeadStroke:              defaultJson.colors.headStroke,
    snakeColors:                  [...defaultJson.colors.snakeColors],

    levelOverrides:               { ...(defaultJson.levelOverrides as Record<string, LevelOverride>) },
    levelSettingsOverrides:       {},
    fieldScopes,
  };
  return settings;
}

/** The singleton mutable settings object. */
export const gameSettings: GameSettings = createDefaultSettings();

/** Reset all settings to defaults (from JSON). */
export function resetSettings(): void {
  Object.assign(gameSettings, createDefaultSettings());
}

/* ====== JSON export/import helpers ====== */

/** Type matching the structure of gameDefaults.json. */
export interface GameDefaultsJSON {
  snake: {
    hungerThreshold: number;
    minSnakeLength: number;
    initialSnakeLength: number;
  };
  food: {
    youngAge: number;
    adultAge: number;
    maxAge: number;
    minDistance: number;
    reproductionMinCooldown: number;
    reproductionProbabilityBase: number;
    maxReproductions: number;
    neighborReproductionRadius: number;
    neighborReproductionPenalty: number;
    maxReproductionNeighbors: number;
    appleReproductionLimitBase: number;
    reproductionLimitBase: number;
    countPerSnakeCoeff: number;
    countBase: number;
    periodicSpawnInterval: number;
  };
  chicken: {
    spawnStartLevel: number;
    spawnProbability: number;
    crowdedSpawnProbability: number;
    crowdedApplePerSnakeMultiplier: number;
    crowdedAppleCount: number;
    guaranteedSpawnAppleCount: number;
    chickRoamRadius: number;
    chickMoveInterval: number;
    adultThreatRadius: number;
    adultSafetyRadius: number;
    adultMoveInterval: number;
    overcrowdingRadius: number;
    eggLayingInterval: number;
    eggLayingProbability: number;
    appleAgeReduction: number;
    appleReproductionReduction: number;
    reproductionLimitBase: number;
    maxEggs: number;
    eggScoreValue: number;
    eggGrowthValue: number;
    chickScoreValue: number;
    chickGrowthValue: number;
    adultScoreValue: number;
    adultGrowthValue: number;
  };
  meat: {
    maxAge: number;
    scoreValue: number;
    growthValue: number;
  };
  hedgehog: {
    spawnStartLevel: number;
    secondSpawnStartLevel: number;
    width: number;
    height: number;
    spawnSnakeDistance: number;
    moveInterval: number;
    frontVisionRadius: number;
    rearVisionRadius: number;
    aboveVisionRadius: number;
    belowVisionRadius: number;
    foodVisionRadius: number;
    populationPercentPerLevel: number;
    spawnWindowTicks: number;
    spawnChanceDivisor: number;
    botThreatRadius: number;
    botEscapeWeight: number;
    extraChanceSlope: number;
    extraChanceIntercept: number;
  };
  walls: {
    clusterCoeff: number;
    clusterBase: number;
    lengthCoeff: number;
    lengthBase: number;
  };
  scoring: {
    targetScoreCoeff: number;
    targetScoreBase: number;
  };
  board: {
    baseWidth: number;
    baseHeight: number;
    levelSizeIncrement: number;
    survivalMaxBoardLevel: number;
    levelTimeLimit: number;
    tickIntervalMs: number;
  };
  ai: {
    visionSize: number;
    obstacleSignalClose: number;
    obstacleSignalDecay: number;
    foodSignalClose: number;
    foodSignalDecay: number;
    foodSignalMin: number;
    botProfiles: BotProfilesSettings;
  };
  colors: {
    bg: string;
    grid: string;
    wall: string;
    foodAdult: string;
    foodYoung: string;
    foodOld: string;
    headStroke: string;
    snakeColors: string[];
  };
  levelOverrides: Record<string, LevelOverride>;
  levelSettingsOverrides?: Record<string, LevelSettingsOverride>;
  fieldScopes?: Record<string, boolean>;
}

/**
 * Convert current gameSettings to a structured JSON object
 * matching the format of gameDefaults.json — always ALL fields.
 */
export function settingsToJSON(): GameDefaultsJSON {
  const settings = gameSettings;
  return {
    snake: {
      hungerThreshold: settings.hungerThreshold,
      minSnakeLength: settings.minSnakeLength,
      initialSnakeLength: settings.initialSnakeLength,
    },
    food: {
      youngAge: settings.foodYoungAge,
      adultAge: settings.foodAdultAge,
      maxAge: settings.foodMaxAge,
      minDistance: settings.foodMinDistance,
      reproductionMinCooldown: settings.reproductionMinCooldown,
      reproductionProbabilityBase: settings.reproductionProbabilityBase,
      maxReproductions: settings.maxReproductions,
      neighborReproductionRadius: settings.neighborReproductionRadius,
      neighborReproductionPenalty: settings.neighborReproductionPenalty,
      maxReproductionNeighbors: settings.maxReproductionNeighbors,
      appleReproductionLimitBase: settings.appleReproductionLimitBase,
      reproductionLimitBase: settings.foodReproductionLimitBase,
      countPerSnakeCoeff: settings.foodCountPerSnakeCoeff,
      countBase: settings.foodCountBase,
      periodicSpawnInterval: settings.foodPeriodicSpawnInterval,
    },
    chicken: {
      spawnStartLevel: settings.chickenSpawnStartLevel,
      spawnProbability: settings.chickenSpawnProbability,
      crowdedSpawnProbability: settings.chickenCrowdedSpawnProbability,
      crowdedApplePerSnakeMultiplier: settings.chickenCrowdedApplePerSnakeMultiplier,
      crowdedAppleCount: settings.chickenCrowdedAppleCount,
      guaranteedSpawnAppleCount: settings.chickenGuaranteedSpawnAppleCount,
      chickRoamRadius: settings.chickenChickRoamRadius,
      chickMoveInterval: settings.chickenChickMoveInterval,
      adultThreatRadius: settings.chickenAdultThreatRadius,
      adultSafetyRadius: settings.chickenAdultSafetyRadius,
      adultMoveInterval: settings.chickenAdultMoveInterval,
      overcrowdingRadius: settings.chickenOvercrowdingRadius,
      eggLayingInterval: settings.chickenEggLayingInterval,
      eggLayingProbability: settings.chickenEggLayingProbability,
      appleAgeReduction: settings.chickenAppleAgeReduction,
      appleReproductionReduction: settings.chickenAppleReproductionReduction,
      reproductionLimitBase: settings.chickenReproductionLimitBase,
      maxEggs: settings.chickenMaxEggs,
      eggScoreValue: settings.chickenEggScoreValue,
      eggGrowthValue: settings.chickenEggGrowthValue,
      chickScoreValue: settings.chickenChickScoreValue,
      chickGrowthValue: settings.chickenChickGrowthValue,
      adultScoreValue: settings.chickenAdultScoreValue,
      adultGrowthValue: settings.chickenAdultGrowthValue,
    },
    meat: {
      maxAge: settings.meatMaxAge,
      scoreValue: settings.meatScoreValue,
      growthValue: settings.meatGrowthValue,
    },
    hedgehog: {
      spawnStartLevel: settings.hedgehogSpawnStartLevel,
      secondSpawnStartLevel: settings.hedgehogSecondSpawnStartLevel,
      width: settings.hedgehogWidth,
      height: settings.hedgehogHeight,
      spawnSnakeDistance: settings.hedgehogSpawnSnakeDistance,
      moveInterval: settings.hedgehogMoveInterval,
      frontVisionRadius: settings.hedgehogFrontVisionRadius,
      rearVisionRadius: settings.hedgehogRearVisionRadius,
      aboveVisionRadius: settings.hedgehogAboveVisionRadius,
      belowVisionRadius: settings.hedgehogBelowVisionRadius,
      foodVisionRadius: settings.hedgehogFoodVisionRadius,
      populationPercentPerLevel: settings.hedgehogPopulationPercentPerLevel,
      spawnWindowTicks: settings.hedgehogSpawnWindowTicks,
      spawnChanceDivisor: settings.hedgehogSpawnChanceDivisor,
      botThreatRadius: settings.hedgehogBotThreatRadius,
      botEscapeWeight: settings.hedgehogBotEscapeWeight,
      extraChanceSlope: settings.hedgehogExtraChanceSlope,
      extraChanceIntercept: settings.hedgehogExtraChanceIntercept,
    },
    walls: {
      clusterCoeff: settings.wallClusterCoeff,
      clusterBase: settings.wallClusterBase,
      lengthCoeff: settings.wallLengthCoeff,
      lengthBase: settings.wallLengthBase,
    },
    scoring: {
      targetScoreCoeff: settings.targetScoreCoeff,
      targetScoreBase: settings.targetScoreBase,
    },
    board: {
      baseWidth: settings.baseWidth,
      baseHeight: settings.baseHeight,
      levelSizeIncrement: settings.levelSizeIncrement,
      survivalMaxBoardLevel: settings.survivalMaxBoardLevel,
      levelTimeLimit: settings.levelTimeLimit,
      tickIntervalMs: settings.tickIntervalMs,
    },
    ai: {
      visionSize: settings.visionSize,
      obstacleSignalClose: settings.obstacleSignalClose,
      obstacleSignalDecay: settings.obstacleSignalDecay,
      foodSignalClose: settings.foodSignalClose,
      foodSignalDecay: settings.foodSignalDecay,
      foodSignalMin: settings.foodSignalMin,
      botProfiles: deepCopyBotProfiles(settings.botProfiles),
    },
    colors: {
      bg: settings.colorBg,
      grid: settings.colorGrid,
      wall: settings.colorWall,
      foodAdult: settings.colorFoodAdult,
      foodYoung: settings.colorFoodYoung,
      foodOld: settings.colorFoodOld,
      headStroke: settings.colorHeadStroke,
      snakeColors: [...settings.snakeColors],
    },
    levelOverrides: { ...settings.levelOverrides },
    levelSettingsOverrides: { ...settings.levelSettingsOverrides },
    fieldScopes: { ...settings.fieldScopes },
  };
}

/**
 * Apply a parsed JSON object (same structure as gameDefaults.json) to gameSettings.
 * Handles partial data gracefully — only overwrites fields that exist in the input.
 */
export function applyJSONToSettings(data: Partial<GameDefaultsJSON>): void {
  const settings = gameSettings;
  if (data.snake) {
    if (data.snake.hungerThreshold != null)    settings.hungerThreshold = data.snake.hungerThreshold;
    if (data.snake.minSnakeLength != null)     settings.minSnakeLength = data.snake.minSnakeLength;
    if (data.snake.initialSnakeLength != null)  settings.initialSnakeLength = data.snake.initialSnakeLength;
  }
  if (data.food) {
    if (data.food.youngAge != null)                    settings.foodYoungAge = data.food.youngAge;
    if (data.food.adultAge != null)                    settings.foodAdultAge = data.food.adultAge;
    if (data.food.maxAge != null)                      settings.foodMaxAge = data.food.maxAge;
    if (data.food.minDistance != null)                 settings.foodMinDistance = data.food.minDistance;
    if (data.food.reproductionMinCooldown != null)     settings.reproductionMinCooldown = data.food.reproductionMinCooldown;
    if (data.food.reproductionProbabilityBase != null) settings.reproductionProbabilityBase = data.food.reproductionProbabilityBase;
    if (data.food.maxReproductions != null)            settings.maxReproductions = data.food.maxReproductions;
    if (data.food.neighborReproductionRadius != null)  settings.neighborReproductionRadius = data.food.neighborReproductionRadius;
    if (data.food.neighborReproductionPenalty != null) settings.neighborReproductionPenalty = data.food.neighborReproductionPenalty;
    if (data.food.maxReproductionNeighbors != null)    settings.maxReproductionNeighbors = data.food.maxReproductionNeighbors;
    if (data.food.appleReproductionLimitBase != null)  settings.appleReproductionLimitBase = data.food.appleReproductionLimitBase;
    if (data.food.reproductionLimitBase != null)       settings.foodReproductionLimitBase = data.food.reproductionLimitBase;
    if (data.food.countPerSnakeCoeff != null)          settings.foodCountPerSnakeCoeff = data.food.countPerSnakeCoeff;
    if (data.food.countBase != null)                   settings.foodCountBase = data.food.countBase;
    if (data.food.periodicSpawnInterval != null)       settings.foodPeriodicSpawnInterval = data.food.periodicSpawnInterval;
  }
  if (data.chicken) {
    if (data.chicken.spawnStartLevel != null)   settings.chickenSpawnStartLevel = data.chicken.spawnStartLevel;
    if (data.chicken.spawnProbability != null)  settings.chickenSpawnProbability = data.chicken.spawnProbability;
    if (data.chicken.crowdedSpawnProbability != null) settings.chickenCrowdedSpawnProbability = data.chicken.crowdedSpawnProbability;
    if (data.chicken.crowdedApplePerSnakeMultiplier != null) settings.chickenCrowdedApplePerSnakeMultiplier = data.chicken.crowdedApplePerSnakeMultiplier;
    if (data.chicken.crowdedAppleCount != null) settings.chickenCrowdedAppleCount = data.chicken.crowdedAppleCount;
    if (data.chicken.guaranteedSpawnAppleCount != null) settings.chickenGuaranteedSpawnAppleCount = data.chicken.guaranteedSpawnAppleCount;
    if (data.chicken.chickRoamRadius != null)   settings.chickenChickRoamRadius = data.chicken.chickRoamRadius;
    if (data.chicken.chickMoveInterval != null) settings.chickenChickMoveInterval = data.chicken.chickMoveInterval;
    if (data.chicken.adultThreatRadius != null) settings.chickenAdultThreatRadius = data.chicken.adultThreatRadius;
    if (data.chicken.adultSafetyRadius != null) settings.chickenAdultSafetyRadius = data.chicken.adultSafetyRadius;
    if (data.chicken.adultMoveInterval != null) settings.chickenAdultMoveInterval = data.chicken.adultMoveInterval;
    if (data.chicken.overcrowdingRadius != null) settings.chickenOvercrowdingRadius = data.chicken.overcrowdingRadius;
    if (data.chicken.eggLayingInterval != null) settings.chickenEggLayingInterval = data.chicken.eggLayingInterval;
    if (data.chicken.eggLayingProbability != null) settings.chickenEggLayingProbability = data.chicken.eggLayingProbability;
    if (data.chicken.appleAgeReduction != null) settings.chickenAppleAgeReduction = data.chicken.appleAgeReduction;
    if (data.chicken.appleReproductionReduction != null) settings.chickenAppleReproductionReduction = data.chicken.appleReproductionReduction;
    if (data.chicken.reproductionLimitBase != null) settings.chickenReproductionLimitBase = data.chicken.reproductionLimitBase;
    if (data.chicken.maxEggs != null)           settings.chickenMaxEggs = data.chicken.maxEggs;
    if (data.chicken.eggScoreValue != null)     settings.chickenEggScoreValue = data.chicken.eggScoreValue;
    if (data.chicken.eggGrowthValue != null)    settings.chickenEggGrowthValue = data.chicken.eggGrowthValue;
    if (data.chicken.chickScoreValue != null)   settings.chickenChickScoreValue = data.chicken.chickScoreValue;
    if (data.chicken.chickGrowthValue != null)  settings.chickenChickGrowthValue = data.chicken.chickGrowthValue;
    if (data.chicken.adultScoreValue != null)   settings.chickenAdultScoreValue = data.chicken.adultScoreValue;
    if (data.chicken.adultGrowthValue != null)  settings.chickenAdultGrowthValue = data.chicken.adultGrowthValue;
  }
  if (data.meat) {
    if (data.meat.maxAge != null)      settings.meatMaxAge = data.meat.maxAge;
    if (data.meat.scoreValue != null)  settings.meatScoreValue = data.meat.scoreValue;
    if (data.meat.growthValue != null) settings.meatGrowthValue = data.meat.growthValue;
  }
  if (data.hedgehog) {
    if (data.hedgehog.spawnStartLevel != null) settings.hedgehogSpawnStartLevel = data.hedgehog.spawnStartLevel;
    if (data.hedgehog.secondSpawnStartLevel != null) settings.hedgehogSecondSpawnStartLevel = data.hedgehog.secondSpawnStartLevel;
    if (data.hedgehog.width != null) settings.hedgehogWidth = data.hedgehog.width;
    if (data.hedgehog.height != null) settings.hedgehogHeight = data.hedgehog.height;
    if (data.hedgehog.spawnSnakeDistance != null) settings.hedgehogSpawnSnakeDistance = data.hedgehog.spawnSnakeDistance;
    if (data.hedgehog.moveInterval != null) settings.hedgehogMoveInterval = data.hedgehog.moveInterval;
    if (data.hedgehog.frontVisionRadius != null) settings.hedgehogFrontVisionRadius = data.hedgehog.frontVisionRadius;
    if (data.hedgehog.rearVisionRadius != null) settings.hedgehogRearVisionRadius = data.hedgehog.rearVisionRadius;
    if (data.hedgehog.aboveVisionRadius != null) settings.hedgehogAboveVisionRadius = data.hedgehog.aboveVisionRadius;
    if (data.hedgehog.belowVisionRadius != null) settings.hedgehogBelowVisionRadius = data.hedgehog.belowVisionRadius;
    if (data.hedgehog.foodVisionRadius != null) settings.hedgehogFoodVisionRadius = data.hedgehog.foodVisionRadius;
    if (data.hedgehog.populationPercentPerLevel != null) settings.hedgehogPopulationPercentPerLevel = data.hedgehog.populationPercentPerLevel;
    if (data.hedgehog.spawnWindowTicks != null) settings.hedgehogSpawnWindowTicks = data.hedgehog.spawnWindowTicks;
    if (data.hedgehog.spawnChanceDivisor != null) settings.hedgehogSpawnChanceDivisor = data.hedgehog.spawnChanceDivisor;
    if (data.hedgehog.botThreatRadius != null) settings.hedgehogBotThreatRadius = data.hedgehog.botThreatRadius;
    if (data.hedgehog.botEscapeWeight != null) settings.hedgehogBotEscapeWeight = data.hedgehog.botEscapeWeight;
    if (data.hedgehog.extraChanceSlope != null) settings.hedgehogExtraChanceSlope = data.hedgehog.extraChanceSlope;
    if (data.hedgehog.extraChanceIntercept != null) settings.hedgehogExtraChanceIntercept = data.hedgehog.extraChanceIntercept;
  }
  if (data.walls) {
    if (data.walls.clusterCoeff != null)  settings.wallClusterCoeff = data.walls.clusterCoeff;
    if (data.walls.clusterBase != null)   settings.wallClusterBase = data.walls.clusterBase;
    if (data.walls.lengthCoeff != null)   settings.wallLengthCoeff = data.walls.lengthCoeff;
    if (data.walls.lengthBase != null)    settings.wallLengthBase = data.walls.lengthBase;
  }
  if (data.scoring) {
    if (data.scoring.targetScoreCoeff != null)  settings.targetScoreCoeff = data.scoring.targetScoreCoeff;
    if (data.scoring.targetScoreBase != null)   settings.targetScoreBase = data.scoring.targetScoreBase;
  }
  if (data.board) {
    if (data.board.baseWidth != null)          settings.baseWidth = data.board.baseWidth;
    if (data.board.baseHeight != null)         settings.baseHeight = data.board.baseHeight;
    if (data.board.levelSizeIncrement != null)  settings.levelSizeIncrement = data.board.levelSizeIncrement;
    if (data.board.survivalMaxBoardLevel != null) settings.survivalMaxBoardLevel = data.board.survivalMaxBoardLevel;
    if (data.board.levelTimeLimit != null)      settings.levelTimeLimit = data.board.levelTimeLimit;
    if (data.board.tickIntervalMs != null)      settings.tickIntervalMs = data.board.tickIntervalMs;
  }
  if (data.ai) {
    if (data.ai.visionSize != null)           settings.visionSize = data.ai.visionSize;
    if (data.ai.obstacleSignalClose != null)  settings.obstacleSignalClose = data.ai.obstacleSignalClose;
    if (data.ai.obstacleSignalDecay != null)  settings.obstacleSignalDecay = data.ai.obstacleSignalDecay;
    if (data.ai.foodSignalClose != null)    settings.foodSignalClose = data.ai.foodSignalClose;
    if (data.ai.foodSignalDecay != null)    settings.foodSignalDecay = data.ai.foodSignalDecay;
    if (data.ai.foodSignalMin != null)      settings.foodSignalMin = data.ai.foodSignalMin;
    if (data.ai.botProfiles) {
      settings.botProfiles = mergeBotProfiles(settings.botProfiles, data.ai.botProfiles);
    }
  }
  if (data.colors) {
    if (data.colors.bg != null)          settings.colorBg = data.colors.bg;
    if (data.colors.grid != null)        settings.colorGrid = data.colors.grid;
    if (data.colors.wall != null)        settings.colorWall = data.colors.wall;
    if (data.colors.foodAdult != null)   settings.colorFoodAdult = data.colors.foodAdult;
    if (data.colors.foodYoung != null)   settings.colorFoodYoung = data.colors.foodYoung;
    if (data.colors.foodOld != null)     settings.colorFoodOld = data.colors.foodOld;
    if (data.colors.headStroke != null)  settings.colorHeadStroke = data.colors.headStroke;
    if (data.colors.snakeColors)         settings.snakeColors = [...data.colors.snakeColors];
  }
  if (data.levelOverrides) {
    settings.levelOverrides = { ...data.levelOverrides };
  }
  if (data.levelSettingsOverrides) {
    settings.levelSettingsOverrides = { ...data.levelSettingsOverrides };
  }
  if (data.fieldScopes) {
    settings.fieldScopes = { ...settings.fieldScopes, ...data.fieldScopes };
  }
}

/**
 * Get the level override for a specific level, or empty defaults.
 * If settings is provided, reads from it; otherwise falls back to the singleton.
 */
export function getLevelOverride(level: number, settings?: GameSettings): LevelOverride {
  const settingsSource = settings ?? gameSettings;
  return settingsSource.levelOverrides[String(level)] || {};
}

/**
 * Set the level override for a specific level.
 */
export function setLevelOverride(level: number, override: LevelOverride): void {
  gameSettings.levelOverrides[String(level)] = override;
}

export function getLevelSettingsOverride(level: number, settings?: GameSettings): LevelSettingsOverride {
  const src = settings ?? gameSettings;
  return src.levelSettingsOverrides[String(level)] || {};
}

export function setLevelSettingOverride(level: number, key: string, value: number | string): void {
  const levelKey = String(level);
  if (!gameSettings.levelSettingsOverrides[levelKey]) {
    gameSettings.levelSettingsOverrides[levelKey] = {};
  }
  gameSettings.levelSettingsOverrides[levelKey][key] = value;
}

export function clearLevelSettingOverride(level: number, key: string): void {
  const levelKey = String(level);
  const override = gameSettings.levelSettingsOverrides[levelKey];
  if (!override) return;
  delete override[key];
  if (Object.keys(override).length === 0) {
    delete gameSettings.levelSettingsOverrides[levelKey];
  }
}

export function applyLevelSettingOverrides(level: number, settings?: GameSettings): void {
  const target = settings ?? gameSettings;
  const override = target.levelSettingsOverrides[String(level)];
  if (!override) return;
  for (const [key, value] of Object.entries(override)) {
    (target as any)[key] = value;
  }
}

/** Build effective settings for one level without mutating the runtime base settings. */
export function resolveSettingsForLevel(level: number, baseSettings: GameSettings): GameSettings {
  const resolved = {
    ...baseSettings,
    snakeColors: [...baseSettings.snakeColors],
    botProfiles: deepCopyBotProfiles(baseSettings.botProfiles),
    levelOverrides: { ...baseSettings.levelOverrides },
    levelSettingsOverrides: { ...baseSettings.levelSettingsOverrides },
    fieldScopes: { ...baseSettings.fieldScopes },
  } as GameSettings;
  const override = baseSettings.levelSettingsOverrides[String(level)];
  if (!override) return resolved;
  for (const [key, value] of Object.entries(override)) {
    (resolved as unknown as Record<string, unknown>)[key] = value;
  }
  return resolved;
}

function createDefaultFieldScopes(): Record<string, boolean> {
  const keys = [
    'hungerThreshold', 'initialSnakeLength', 'minSnakeLength',
    'foodYoungAge', 'foodAdultAge', 'foodMaxAge',
    'foodMinDistance', 'reproductionMinCooldown', 'reproductionProbabilityBase',
    'maxReproductions', 'neighborReproductionRadius', 'maxReproductionNeighbors',
    'neighborReproductionPenalty', 'appleReproductionLimitBase',
    'foodReproductionLimitBase',
    'foodCountPerSnakeCoeff', 'foodCountBase',
    'foodPeriodicSpawnInterval',
    'chickenSpawnStartLevel', 'chickenSpawnProbability', 'chickenCrowdedSpawnProbability',
    'chickenCrowdedApplePerSnakeMultiplier', 'chickenCrowdedAppleCount',
    'chickenGuaranteedSpawnAppleCount',
    'chickenChickRoamRadius', 'chickenChickMoveInterval',
    'chickenAdultThreatRadius', 'chickenAdultMoveInterval',
    'chickenAdultSafetyRadius', 'chickenOvercrowdingRadius',
    'chickenEggLayingInterval', 'chickenEggLayingProbability',
    'chickenAppleAgeReduction',
    'chickenAppleReproductionReduction', 'chickenReproductionLimitBase',
    'chickenMaxEggs',
    'chickenEggScoreValue', 'chickenEggGrowthValue',
    'chickenChickScoreValue', 'chickenChickGrowthValue',
    'chickenAdultScoreValue', 'chickenAdultGrowthValue',
    'meatMaxAge', 'meatScoreValue', 'meatGrowthValue',
    'hedgehogSpawnStartLevel', 'hedgehogSecondSpawnStartLevel',
    'hedgehogWidth', 'hedgehogHeight', 'hedgehogSpawnSnakeDistance',
    'hedgehogMoveInterval', 'hedgehogFrontVisionRadius', 'hedgehogRearVisionRadius',
    'hedgehogAboveVisionRadius', 'hedgehogBelowVisionRadius',
    'hedgehogFoodVisionRadius', 'hedgehogPopulationPercentPerLevel',
    'hedgehogSpawnWindowTicks', 'hedgehogSpawnChanceDivisor',
    'hedgehogBotThreatRadius', 'hedgehogBotEscapeWeight',
    'hedgehogExtraChanceSlope', 'hedgehogExtraChanceIntercept',
    'wallClusterCoeff', 'wallClusterBase', 'wallLengthCoeff', 'wallLengthBase',
    'targetScoreCoeff', 'targetScoreBase',
    'baseWidth', 'baseHeight', 'levelSizeIncrement', 'survivalMaxBoardLevel',
    'levelTimeLimit', 'tickIntervalMs',
    'visionSize', 'obstacleSignalClose', 'obstacleSignalDecay', 'foodSignalClose',
    'foodSignalDecay', 'foodSignalMin',
    'colorBg', 'colorGrid', 'colorWall', 'colorFoodAdult', 'colorFoodYoung', 'colorFoodOld', 'colorHeadStroke',
  ];
  const scopes: Record<string, boolean> = {};
  for (const key of keys) scopes[key] = true;
  return scopes;
}

function deepCopyBotProfiles(source: BotProfilesSettings): BotProfilesSettings {
  return {
    rookie: { ...source.rookie },
    basic: { ...source.basic },
    solid: { ...source.solid },
    wise: { ...source.wise },
  };
}

function mergeBotProfiles(
  base: BotProfilesSettings,
  incoming: Partial<Record<BotProfileId, Partial<BotSkillProfileSettings>>>
): BotProfilesSettings {
  const result = deepCopyBotProfiles(base);
  const profileIds: BotProfileId[] = ['rookie', 'basic', 'solid', 'wise'];
  for (const profileId of profileIds) {
    const patch = incoming[profileId];
    if (!patch) continue;
    result[profileId] = { ...result[profileId], ...patch };
  }
  return result;
}
