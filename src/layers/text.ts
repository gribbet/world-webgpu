import type { Context } from "../context";
import type { Vec3, Vec4 } from "../model";
import {
  createSignal,
  effect,
  map,
  type Properties,
  resolve,
} from "../reactive";
import { createBillboardLayer } from "./billboard";
import { createTextImage } from "./text-image";

export type TextEntry = {
  text: string;
  position: Vec3;
  size: number;
  font: string;
  fontSize: number;
  color?: Vec4;
  minScale: number;
  maxScale: number;
};

export type TextProps = {
  entries: Properties<TextEntry>[];
};

export const createTextLayer = (
  context: Context,
  { entries }: Properties<TextProps>,
) => {
  const billboards = map(
    entries,
    ({ text, position, size, font, fontSize, color, minScale, maxScale }) => {
      const [image, setImage] = createSignal<string>("");
      effect(() => {
        const textValue = resolve(text);
        if (!textValue) return;

        void createTextImage({
          text: textValue,
          font: resolve(font),
          fontSize: resolve(fontSize),
        }).then(setImage);
      });

      return {
        position,
        size,
        color,
        image,
        minScale,
        maxScale,
      };
    },
  );

  return createBillboardLayer(context, { billboards });
};
