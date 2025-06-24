import { Jimp } from "jimp";

// Web Crypto API alternatives
export const createHash = async (data: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// Fetch thumbnail from URL and return ArrayBuffer
export async function fetchThumbnailFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch thumbnail: ${response.status} ${response.statusText}`,
    );
  }
  return await response.arrayBuffer();
}

// Create hash from thumbnail ArrayBuffer
export async function hashThumbnail(arrayBuffer: ArrayBuffer): Promise<string> {
  return await createHash(new Uint8Array(arrayBuffer));
}

export const getYoutubeOembedMetadata = async (videoId: string) => {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  );
  if (!response.ok) throw new Error("Failed to fetch video metadata");
  return await response.json();
};

export const getThumbnailUrlForYoutubeVideo = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

export const getDecoratedThumbnailUrl = (thumbnailKey: string) =>
  `https://thumbs.video-to-markdown.com/${thumbnailKey}`;

export const fetchAndDecorateThumb = async (thumbnailUrl: string) => {
  const orginalBuffer = await fetchThumbnailFromUrl(thumbnailUrl);
  const initialThumbnailHash = await hashThumbnail(orginalBuffer);
  const decoratedBuffer = await addPlayIconToThumbnail(orginalBuffer);
  return { initialThumbnailHash, decoratedBuffer };
};

export const getYoutubeVideoTitle = async (
  videoId: string,
): Promise<string> => {
  const metadata = await getYoutubeOembedMetadata(videoId);
  if (!metadata || !("title" in metadata))
    throw new Error("Invalid YouTube metadata for url: " + videoId);
  return metadata.title;
};

// Extract YouTube video ID from various URL formats
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function addPlayIconToThumbnail(imageBuffer: ArrayBuffer) {
  // Load the original image with Jimp
  const image = await Jimp.read(imageBuffer);
  const { width, height } = image.bitmap;

  // Calculate play icon dimensions and position
  const iconSize = Math.min(width, height) * 0.3; // 12% of the smaller dimension
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

  // Draw red circle with 3-pixel white border (YouTube style)
  const borderWidth = 10;
  for (let x = 0; x < iconSize; x++) {
    for (let y = 0; y < iconSize; y++) {
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (distance <= radius - borderWidth) {
        // Inner circle - red like YouTube
        playIcon.setPixelColor(0xff0000e6, x, y); // Red with ~90% opacity
      } else if (distance <= radius) {
        // 3-pixel white border around the red circle
        playIcon.setPixelColor(0xffffffee, x, y); // White with ~93% opacity
      }
    }
  }

  // Draw the play triangle pointing right
  const triangleSize = iconSize * 0.4;
  const triangleLeft = centerX - triangleSize * 0.2;
  const triangleTop = centerY - triangleSize * 0.5;

  // Draw right-pointing triangle
  for (let y = 0; y < triangleSize; y++) {
    // Calculate distance from center line
    const distanceFromCenter = Math.abs(y - triangleSize / 2);
    const maxDistanceFromCenter = triangleSize / 2;

    // Calculate width at this y position (narrower towards the point)
    const widthAtY =
      ((maxDistanceFromCenter - distanceFromCenter) / maxDistanceFromCenter) *
      triangleSize *
      0.7;

    const startX = Math.floor(triangleLeft);
    const endX = Math.floor(triangleLeft + widthAtY);

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
  const buffer = await image.getBuffer("image/jpeg", {
    quality: 90,
  });

  // Convert to Uint8Array for Convex compatibility
  return new Uint8Array(buffer);
}

// Helper function to check if thumbnail has changed
export async function checkIfThumbnailChanged({
  originalThumbnailUrl,
  lastThumbnailHash,
}: {
  originalThumbnailUrl: string;
  lastThumbnailHash: string;
}) {
  try {
    const arrayBuffer = await fetchThumbnailFromUrl(originalThumbnailUrl);
    const currentHash = await hashThumbnail(arrayBuffer);
    const thumbnailChanged = lastThumbnailHash !== currentHash;

    return {
      error: null,
      thumbnailChanged,
      newHash: currentHash,
      arrayBuffer,
    };
  } catch (error) {
    return {
      error: `Error checking thumbnail: ${error}`,
      thumbnailChanged: false,
      newHash: "",
      arrayBuffer: null,
    };
  }
}

export const hoursToMilliseconds = (hours: number) => hours * 60 * 60 * 1000;

export const hoursFromNowInMilliseconds = (hours: number) =>
  Date.now() + hoursToMilliseconds(hours);

export const daysToMilliseconds = (days: number) => days * 24 * 60 * 60 * 1000;

export const daysFromNowInMilliseconds = (days: number) =>
  Date.now() + daysToMilliseconds(days);
