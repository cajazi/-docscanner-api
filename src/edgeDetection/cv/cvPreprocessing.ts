import sharp from 'sharp';

export type GrayscaleImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type BinaryImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export async function loadGrayscaleImage(source: Buffer, maxDimension = 1024): Promise<GrayscaleImage> {
  const {
    data,
    info: { width, height, channels },
  } = await sharp(source, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = width * height;
  const grayscale = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    grayscale[index] = data[index * channels] ?? 0;
  }

  return { width, height, data: grayscale };
}

export function gaussianBlur(image: GrayscaleImage): GrayscaleImage {
  const kernel = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
  ];
  const output = new Uint8Array(image.data.length);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0;
      let weight = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleX = clampInteger(x + kx, 0, image.width - 1);
          const sampleY = clampInteger(y + ky, 0, image.height - 1);
          const kernelWeight = kernel[ky + 1][kx + 1];
          sum += image.data[sampleY * image.width + sampleX] * kernelWeight;
          weight += kernelWeight;
        }
      }
      output[y * image.width + x] = Math.round(sum / weight);
    }
  }

  return { ...image, data: output };
}

export function adaptiveThreshold(image: GrayscaleImage, radius = 12, offset = 7): BinaryImage {
  const output = new Uint8Array(image.data.length);
  const globalMean = image.data.reduce((sum, value) => sum + value, 0) / image.data.length;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const mean = localMean(image, x, y, radius);
      const value = image.data[y * image.width + x];
      output[y * image.width + x] = value > mean - offset && value > globalMean ? 1 : 0;
    }
  }

  return { width: image.width, height: image.height, data: output };
}

export function morphologicalClose(image: BinaryImage, iterations = 1): BinaryImage {
  let current = image;
  for (let index = 0; index < iterations; index += 1) {
    current = erode(dilate(current));
  }

  return current;
}

export function combineBinaryMasks(left: BinaryImage, right: BinaryImage): BinaryImage {
  if (left.width !== right.width || left.height !== right.height) {
    throw new Error('Cannot combine masks with different dimensions');
  }

  const data = new Uint8Array(left.data.length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = left.data[index] || right.data[index] ? 1 : 0;
  }

  return { width: left.width, height: left.height, data };
}

function dilate(image: BinaryImage): BinaryImage {
  const output = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      output[y * image.width + x] = hasForegroundNeighbor(image, x, y) ? 1 : 0;
    }
  }

  return { ...image, data: output };
}

function erode(image: BinaryImage): BinaryImage {
  const output = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      output[y * image.width + x] = allForegroundNeighbors(image, x, y) ? 1 : 0;
    }
  }

  return { ...image, data: output };
}

function hasForegroundNeighbor(image: BinaryImage, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const sampleX = x + dx;
      const sampleY = y + dy;
      if (sampleX >= 0 && sampleY >= 0 && sampleX < image.width && sampleY < image.height && image.data[sampleY * image.width + sampleX]) {
        return true;
      }
    }
  }

  return false;
}

function allForegroundNeighbors(image: BinaryImage, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const sampleX = x + dx;
      const sampleY = y + dy;
      if (sampleX < 0 || sampleY < 0 || sampleX >= image.width || sampleY >= image.height || !image.data[sampleY * image.width + sampleX]) {
        return false;
      }
    }
  }

  return true;
}

function localMean(image: GrayscaleImage, x: number, y: number, radius: number) {
  let sum = 0;
  let count = 0;
  for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(image.height - 1, y + radius); sampleY += 1) {
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(image.width - 1, x + radius); sampleX += 1) {
      sum += image.data[sampleY * image.width + sampleX];
      count += 1;
    }
  }

  return sum / count;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
