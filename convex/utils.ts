import { Jimp } from "jimp";

// Web Crypto API alternatives
export const createHash = async (data: Uint8Array<ArrayBuffer>): Promise<string> => {
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
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Try YouTube's own oEmbed endpoint first
  const youtubeResponse = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
  );
  if (youtubeResponse.ok) return await youtubeResponse.json();

  console.warn(
    `YouTube oEmbed returned ${youtubeResponse.status} for ${videoId}, falling back to noembed.com`,
  );

  // Fallback to noembed.com which proxies oEmbed and works from server environments
  const noembedResponse = await fetch(
    `https://noembed.com/embed?url=${encodeURIComponent(videoUrl)}`,
  );
  if (noembedResponse.ok) {
    const data = await noembedResponse.json();
    if (data.error) {
      throw new Error(
        `Failed to fetch video metadata (noembed error): ${data.error}`,
      );
    }
    return data;
  }

  throw new Error(
    `Failed to fetch video metadata: YouTube oEmbed returned ${youtubeResponse.status}, noembed.com returned ${noembedResponse.status}`,
  );
};

export const getThumbnailUrlForYoutubeVideo = (videoId: string) =>
  `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

const YOUTUBE_THUMBNAIL_QUALITIES = [
  "maxresdefault",
  "sddefault",
  "hqdefault",
  "mqdefault",
  "default",
] as const;

export async function fetchYoutubeThumbnailWithFallback(
  videoId: string,
): Promise<{ url: string; buffer: ArrayBuffer }> {
  for (const quality of YOUTUBE_THUMBNAIL_QUALITIES) {
    const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    const response = await fetch(url);
    if (response.ok) {
      return { url, buffer: await response.arrayBuffer() };
    }
  }
  throw new Error(`Failed to fetch thumbnail for video ${videoId}`);
}

export const getDecoratedThumbnailUrl = (thumbnailKey: string) =>
  `https://thumbs.video-to-markdown.com/${thumbnailKey}`;

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const THUMBNAIL_KEY = /^[0-9a-f]{8}\.jpg$/;

// processVideoUrl only writes rows of this shape. Rows written through the
// old public createVideo could hold anything, so the thumbnail monitor only
// fetches and re-hosts thumbnails for rows that match it.
export function hasProcessedThumbnailShape(video: {
  videoId: string;
  thumbnailKey?: string;
  originalThumbnailUrl: string;
  processedThumbnailUrl: string;
}): boolean {
  const { videoId, thumbnailKey } = video;
  if (!YOUTUBE_VIDEO_ID.test(videoId)) return false;
  if (thumbnailKey === undefined || !THUMBNAIL_KEY.test(thumbnailKey))
    return false;
  if (video.processedThumbnailUrl !== getDecoratedThumbnailUrl(thumbnailKey))
    return false;
  return YOUTUBE_THUMBNAIL_QUALITIES.some(
    (quality) =>
      video.originalThumbnailUrl ===
      `https://img.youtube.com/vi/${videoId}/${quality}.jpg`,
  );
}

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

  // Resize image to max 650 width or height while maintaining aspect ratio
  const maxDimension = 650;
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      const newHeight = Math.floor((height * maxDimension) / width);
      image.resize({ w: maxDimension, h: newHeight });
    } else {
      const newWidth = Math.floor((width * maxDimension) / height);
      image.resize({ w: newWidth, h: maxDimension });
    }
  }

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

export const daysToMilliseconds = (days: number) => days * 24 * 60 * 60 * 1000;

export const daysFromNowInMilliseconds = (days: number) =>
  Date.now() + daysToMilliseconds(days);

// Calculate the next check interval for thumbnail monitoring
export const calculateNextInterval = (
  currentInterval: number,
  thumbnailChanged: boolean,
  error: boolean,
): number => {
  if (error) return currentInterval; // If error, keep same interval
  if (thumbnailChanged) return 1; // If thumbnail changed, reset to 1 day
  return Math.min(currentInterval * 2, 32); // If unchanged, double the interval (max 32 days)
};
