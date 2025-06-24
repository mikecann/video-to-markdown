import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { r2 } from "./videos";
import {
  extractVideoId,
  getYoutubeVideoTitle,
  fetchAndDecorateThumb,
  getThumbnailUrlForYoutubeVideo,
  getDecoratedThumbnailUrl,
  hoursToMilliseconds,
  hoursFromNowInMilliseconds,
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
    const originalThumbnailUrl = getThumbnailUrlForYoutubeVideo(videoId);

    // Step 3: Generate and store thumbnail in R2
    // Fetch the original thumbnail
    const { decoratedBuffer, initialThumbnailHash } =
      await fetchAndDecorateThumb(originalThumbnailUrl);

    // Store the processed thumbnail in R2
    const shortId = crypto.randomUUID().substring(0, 8); // Generate 8-character random ID
    const thumbnailKey = await r2.store(ctx, decoratedBuffer, {
      key: `${shortId}.jpg`,
      type: "image/jpeg",
    });

    // Step 4: Create video entry in database
    const videoDocId = await ctx.runMutation(api.videos.createVideo, {
      url: `https://youtu.be/${videoId}`,
      videoId: videoId,
      title,
      thumbnailKey,
      originalThumbnailUrl,
      processedThumbnailUrl: getDecoratedThumbnailUrl(thumbnailKey),
      initialThumbnailHash,
    });

    // Step 5: Schedule initial thumbnail check for tomorrow
    const scheduledFunctionId = await ctx.scheduler.runAt(
      hoursFromNowInMilliseconds(24),
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
