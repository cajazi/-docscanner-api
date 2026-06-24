import type { ImageStats, RgbImage } from './types';

export function calculateImageStats(image: RgbImage): ImageStats {
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let minLuminance = 255;
  let maxLuminance = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  const pixelCount = image.width * image.height;

  for (let index = 0; index < image.data.length; index += 3) {
    const red = image.data[index];
    const green = image.data[index + 1];
    const blue = image.data[index + 2];
    const luminance = rgbToLuminance(red, green, blue);
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    redSum += red;
    greenSum += green;
    blueSum += blue;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    if (luminance < 55) {
      darkPixels += 1;
    }
    if (luminance > 220) {
      brightPixels += 1;
    }
  }

  const meanLuminance = luminanceSum / pixelCount;
  const variance = luminanceSquaredSum / pixelCount - meanLuminance * meanLuminance;

  return {
    meanLuminance: round(meanLuminance),
    minLuminance: round(minLuminance),
    maxLuminance: round(maxLuminance),
    contrast: round(Math.sqrt(Math.max(variance, 0))),
    redMean: round(redSum / pixelCount),
    greenMean: round(greenSum / pixelCount),
    blueMean: round(blueSum / pixelCount),
    darkRatio: round(darkPixels / pixelCount, 4),
    brightRatio: round(brightPixels / pixelCount, 4),
  };
}

export function rgbToLuminance(red: number, green: number, blue: number) {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
