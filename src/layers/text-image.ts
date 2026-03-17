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
    const width = Math.ceil(metrics.width);
    const height = fontSize;

    canvas.width = width;
    canvas.height = height;

    context.font = fontString;
    context.fillStyle = "white";
    context.strokeStyle = "black";
    context.lineWidth = 4;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.clearRect(0, 0, width, height);
    context.strokeText(text, width / 2, height / 2);
    context.fillText(text, width / 2, height / 2);

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
