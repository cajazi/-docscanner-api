export type EnhancementV2Mode = 'AUTO' | 'COLOR' | 'GRAYSCALE' | 'BLACK_WHITE' | 'MAGIC_COLOR' | 'DOCUMENT';

export type RgbImage = {
  width: number;
  height: number;
  channels: 3;
  data: Uint8Array;
};

export type ImageStats = {
  meanLuminance: number;
  minLuminance: number;
  maxLuminance: number;
  contrast: number;
  redMean: number;
  greenMean: number;
  blueMean: number;
  darkRatio: number;
  brightRatio: number;
};

export type EnhancementV2Metadata = {
  enhancementVersion: 'v2';
  mode: EnhancementV2Mode;
  exposureAdjusted: boolean;
  whiteBalanceAdjusted: boolean;
  shadowCorrectionApplied: boolean;
  adaptiveThresholdApplied: boolean;
  backgroundWhiteningApplied: boolean;
  blurScore: number;
  sharpnessScore: number;
  recommendRescan: boolean;
  fallbackUsed: boolean;
};
