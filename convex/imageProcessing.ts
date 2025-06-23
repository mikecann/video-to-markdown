import { R2 } from "@convex-dev/r2";
import { components, api } from "./_generated/api";
import { Jimp } from "jimp";

const r2 = new R2(components.r2);

export async function addPlayIconToThumbnail(imageBuffer: ArrayBuffer) {
  // Load the original image with Jimp
  const image = await Jimp.read(Buffer.from(imageBuffer));
  const { width, height } = image.bitmap;

  // Calculate play icon dimensions and position
  const iconSize = Math.min(width, height) * 0.12; // 12% of the smaller dimension
  const iconLeft = Math.floor((width - iconSize) / 2);
  const iconTop = Math.floor((height - iconSize) / 2);

  // Create a play icon overlay
  const playIcon = new Jimp({
    width: Math.floor(iconSize),
    height: Math.floor(iconSize),
    color: 0x00000000, // Transparent background
  });

  // Draw the play button background circle
  const radius = iconSize / 2;
  const centerX = Math.floor(iconSize / 2);
  const centerY = Math.floor(iconSize / 2);

  // Draw semi-transparent black circle
  for (let x = 0; x < iconSize; x++) {
    for (let y = 0; y < iconSize; y++) {
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance <= radius * 0.85) {
        // Inner circle - semi-transparent black
        playIcon.setPixelColor(0x000000bf, x, y); // Black with ~75% opacity
      } else if (distance <= radius) {
        // Border - white
        playIcon.setPixelColor(0xffffffe6, x, y); // White with ~90% opacity
      }
    }
  }

  // Draw the play triangle
  const triangleSize = iconSize * 0.3;
  const triangleLeft = centerX - triangleSize * 0.2;
  const triangleTop = centerY - triangleSize * 0.5;

  // Simple triangle drawing using scanlines
  for (let y = 0; y < triangleSize; y++) {
    const progress = y / triangleSize;
    const lineWidth = progress * triangleSize * 0.8;
    const startX = Math.floor(triangleLeft);
    const endX = Math.floor(triangleLeft + lineWidth);

    for (let x = startX; x <= endX && x < iconSize; x++) {
      const triangleY = Math.floor(triangleTop + y);
      if (triangleY >= 0 && triangleY < iconSize && x >= 0) {
        playIcon.setPixelColor(0xffffffff, x, triangleY); // White triangle
      }
    }
  }

  // Composite the play icon onto the original image
  image.composite(playIcon, iconLeft, iconTop);

  // Convert to JPEG buffer
  return image.getBuffer("image/jpeg", {
    quality: 90,
  });
}
