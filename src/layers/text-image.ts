import { limit } from "../common";
import { createLru } from "../lru";

const canvas = new OffscreenCanvas(1, 1);
const context = canvas.getContext("2d");
const lru = createLru<string, Promise<string>>({ maxSize: 2048 });
const acquire = limit(16);

export const createTextImage = ({
  text,
  font,
  fontSize,
}: {
  text: string;
  font: string;
  fontSize: number;
}) => {
  const key = [text, font, fontSize].join("-");

  const cached = lru.get(key);
  if (cached) return cached;

  const result = renderTextImage({ text, font, fontSize });
  lru.set(key, result);
  return result;
};

const renderTextImage = async ({
  text,
  font,
  fontSize,
}: {
  text: string;
  font: string;
  fontSize: number;
}) => {
  if (!context) throw new Error("No context");

  const release = await acquire();

  try {
    const fontString = `${fontSize}px ${font}`;
    context.font = fontString;
    const metrics = context.measureText(text);
    const padding = 1;
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent);
    const width = Math.max(1, Math.ceil(metrics.width) + padding * 2);
    const height = Math.max(1, ascent + descent + padding * 2);
    const x = width / 2;
    const y = padding + ascent;

    canvas.width = width;
    canvas.height = height;

    context.font = fontString;
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.clearRect(0, 0, width, height);
    context.strokeText(text, x, y);
    context.fillText(text, x, y);

    const blob = await canvas.convertToBlob({ type: "image/png" });

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } finally {
    release();
  }
};
