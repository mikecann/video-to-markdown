import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { r2 } from "./videos";
import { addPlayIconToThumbnail, createHash, extractVideoId } from "./utils";

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
    const thumbnailHash = await createHash(new Uint8Array(arrayBuffer));

    const processedImageBuffer = await addPlayIconToThumbnail(arrayBuffer);

    // Store the processed thumbnail in R2
    const shortId = crypto.randomUUID().substring(0, 8); // Generate 8-character random ID
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
      const currentHash = await createHash(new Uint8Array(arrayBuffer));

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
