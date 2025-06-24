import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { r2 } from "./videos";
import {
  extractVideoId,
  getYoutubeVideoTitle,
  fetchAndAddThumbToVideo,
  getThumbnailUrlForYoutubeVideo,
} from "./utils";

// Complete workflow: process YouTube URL and create video entry
export const processVideoUrl = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<Id<"videos">> => {
    // Step 1: Extract video ID and validate URL
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    // Step 2: Fetch video metadata from YouTube oEmbed API
    const title = await getYoutubeVideoTitle(videoId);
    const cleanUrl = `https://youtu.be/${videoId}`;
    const thumbnailUrl = getThumbnailUrlForYoutubeVideo(videoId);

    // Step 3: Generate and store thumbnail in R2
    // Fetch the original thumbnail
    const { processedImageBuffer, thumbnailHash } =
      await fetchAndAddThumbToVideo(thumbnailUrl);

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
      title,
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
