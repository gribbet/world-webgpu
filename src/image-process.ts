import { mipLevelCount } from "./configuration";

export type Crop = { x: number; y: number; width: number; height: number };

export const cropImage = (source: ImageBitmap, { x, y, width, height }: Crop) =>
  createImageBitmap(source, x, y, width, height);

export const resizeImage = (
  source: ImageBitmap,
  width: number,
  height: number,
) =>
  createImageBitmap(source, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });

export const createMipmaps = (image: ImageBitmap, levels = mipLevelCount) =>
  Promise.all(
    new Array(levels).fill(0).map((_, i) => {
      const width = Math.max(1, Math.floor(image.width / 2 ** i));
      const height = Math.max(1, Math.floor(image.height / 2 ** i));
      return resizeImage(image, width, height);
    }),
  );
