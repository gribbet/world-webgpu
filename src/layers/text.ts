import { createLayer, createLayerType } from "../common";
import type { Vec3, Vec4 } from "../model";
import { type PickHandlers } from "../pick-registry";
import {
  createSignal,
  effect,
  map,
  type Properties,
  resolve,
} from "../reactive";
import { billboard } from "./billboard";
import { createTextImage } from "./text-image";

export type TextEntry = PickHandlers & {
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

export const text = createLayerType<TextProps>((context, { entries }) => {
  const billboards = map(entries, entry => {
    const { text, font, fontSize, ...rest } = entry;
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

    return { ...rest, image };
  });

  return createLayer(context, billboard({ billboards }));
});
