"use node";

import { api, internal } from "./_generated/api";
import { Jimp } from "jimp";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { r2 } from "./videos";
import { randomUUID, createHash } from "crypto";

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
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

async function addPlayIconToThumbnail(imageBuffer: ArrayBuffer) {
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

// Complete workflow: process YouTube URL and create video entry
export const processVideoUrl = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<Id<"videos">> => {
    // Step 1: Extract video ID and validate URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    // Step 2: Fetch video metadata from YouTube oEmbed API
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch video metadata");
    }

    const metadata = await response.json();
    const cleanUrl = `https://youtu.be/${videoId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Step 3: Generate and store thumbnail in R2
    // Fetch the original thumbnail
    const thumbnailResponse = await fetch(thumbnailUrl);
    if (!thumbnailResponse.ok) {
      throw new Error(
        `Failed to fetch thumbnail: ${thumbnailResponse.status} ${thumbnailResponse.statusText}`,
      );
    }

    const arrayBuffer = await thumbnailResponse.arrayBuffer();

    // Create hash of original thumbnail for monitoring
    const thumbnailHash = createHash("sha256")
      .update(new Uint8Array(arrayBuffer))
      .digest("hex");

    const processedImageBuffer = await addPlayIconToThumbnail(arrayBuffer);

    // Store the processed thumbnail in R2
    const shortId = randomUUID().substring(0, 8); // Generate 8-character random ID
    const thumbnailKey = await r2.store(ctx, processedImageBuffer, {
      key: `${shortId}.jpg`,
      type: "image/jpeg",
    });

    // Step 4: Create video entry in database
    const videoDocId = await ctx.runMutation(api.videos.createVideo, {
      url: cleanUrl,
      videoId: videoId,
      title: metadata.title,
      thumbnailKey,
      originalThumbnailUrl: thumbnailUrl,
      processedThumbnailUrl: `https://thumbs.video-to-markdown.com/${thumbnailKey}`,
      initialThumbnailHash: thumbnailHash,
    });

    // Step 5: Schedule initial thumbnail check for tomorrow
    const scheduledTime = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
    const scheduledFunctionId = await ctx.scheduler.runAt(
      scheduledTime,
      internal.thumbnailMonitor.checkThumbnailChanges,
      { videoId: videoDocId },
    );

    // Update video with scheduled function ID
    await ctx.runMutation(api.videos.updateScheduledFunction, {
      videoId: videoDocId,
      scheduledFunctionId,
    });

    return videoDocId;
  },
});

// Check if thumbnail has changed by comparing hashes
export const checkThumbnailChanged = internalAction({
  args: {
    originalThumbnailUrl: v.string(),
    lastThumbnailHash: v.string(),
  },
  handler: async (ctx, { originalThumbnailUrl, lastThumbnailHash }) => {
    try {
      // Download current thumbnail from YouTube
      const thumbnailResponse = await fetch(originalThumbnailUrl);
      if (!thumbnailResponse.ok) {
        return {
          error: `Failed to fetch thumbnail: ${thumbnailResponse.status}`,
          thumbnailChanged: false,
          newHash: "",
        };
      }

      const arrayBuffer = await thumbnailResponse.arrayBuffer();

      // Create hash of current thumbnail
      const currentHash = createHash("sha256")
        .update(new Uint8Array(arrayBuffer))
        .digest("hex");

      // Compare with stored hash
      const thumbnailChanged = lastThumbnailHash !== currentHash;

      return {
        error: null,
        thumbnailChanged,
        newHash: currentHash,
      };
    } catch (error) {
      return {
        error: `Error checking thumbnail: ${error}`,
        thumbnailChanged: false,
        newHash: "",
      };
    }
  },
});

// Update processed thumbnail in R2 storage
export const updateProcessedThumbnail = internalAction({
  args: {
    originalThumbnailUrl: v.string(),
    thumbnailKey: v.string(),
  },
  handler: async (ctx, { originalThumbnailUrl, thumbnailKey }) => {
    try {
      // Download the original thumbnail
      const thumbnailResponse = await fetch(originalThumbnailUrl);
      if (!thumbnailResponse.ok) {
        throw new Error(
          `Failed to fetch thumbnail: ${thumbnailResponse.status}`,
        );
      }

      const arrayBuffer = await thumbnailResponse.arrayBuffer();
      const processedImageBuffer = await addPlayIconToThumbnail(arrayBuffer);

      // Update the same R2 key to keep URL consistent
      await r2.store(ctx, processedImageBuffer, {
        key: thumbnailKey,
        type: "image/jpeg",
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating processed thumbnail:", error);
      return { success: false, error: String(error) };
    }
  },
});
