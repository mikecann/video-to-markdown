import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { r2 } from "./videos";
import {
  addPlayIconToThumbnail,
  checkIfThumbnailChanged,
  daysFromNowInMilliseconds,
  calculateNextInterval,
} from "./utils";

// Query to get video details for thumbnail checking
export const getVideoForCheck = internalQuery({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    return await ctx.db.get(videoId);
  },
});

// Main scheduled function to check for thumbnail changes
export const checkThumbnailChanges = internalAction({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    console.log(`Starting thumbnail check for video ID: ${videoId}`);

    // Get video details
    const video = await ctx.runQuery(
      internal.thumbnailMonitor.getVideoForCheck,
      { videoId },
    );

    if (!video) {
      console.log(`Video with ID '${videoId}' not found for thumbnail check`);
      return;
    }

    try {
      // Check if thumbnail has changed using helper function
      const thumbnailCheckResult = await checkIfThumbnailChanged({
        originalThumbnailUrl: video.originalThumbnailUrl,
        lastThumbnailHash: video.lastThumbnailHash || "",
      });

      if (thumbnailCheckResult.error) {
        console.error(
          `Failed to check thumbnail for video '${video.videoId}' with ID '${videoId}': ${thumbnailCheckResult.error}`,
        );
        // Schedule next check with same interval on error
        await ctx.runMutation(
          internal.thumbnailMonitor.updateVideoAndScheduleNext,
          {
            videoId,
            newHash: video.lastThumbnailHash || "",
            thumbnailChanged: false,
            error: true,
          },
        );
        return;
      }

      const { thumbnailChanged, newHash, arrayBuffer } = thumbnailCheckResult;

      if (!thumbnailChanged) {
        console.log(
          `Thumbnail unchanged for video '${video.videoId}' with ID '${videoId}', increasing check interval`,
        );
      } else {
        console.log(
          `Thumbnail changed for video '${video.videoId}' with ID '${videoId}', regenerating...`,
        );

        // Process the new thumbnail and update R2
        if (video.thumbnailKey && arrayBuffer) {
          const processedImageBuffer =
            await addPlayIconToThumbnail(arrayBuffer);
          // Update the same R2 key to keep URL consistent
          await r2.store(ctx, processedImageBuffer, {
            key: video.thumbnailKey,
            type: "image/jpeg",
          });
        }
      }

      // Update video record and schedule next check in a single atomic operation
      await ctx.runMutation(
        internal.thumbnailMonitor.updateVideoAndScheduleNext,
        {
          videoId,
          newHash,
          thumbnailChanged,
          error: false,
        },
      );
    } catch (error) {
      console.error(
        `Error checking thumbnail for video '${video.videoId}' with ID '${videoId}':`,
        error,
      );

      // Schedule next check with same interval on error
      await ctx.runMutation(
        internal.thumbnailMonitor.updateVideoAndScheduleNext,
        {
          videoId,
          newHash: video.lastThumbnailHash || "",
          thumbnailChanged: false,
          error: true,
        },
      );
    }
  },
});

// Combined function to update video and schedule next check atomically
export const updateVideoAndScheduleNext = internalMutation({
  args: {
    videoId: v.id("videos"),
    newHash: v.string(),
    thumbnailChanged: v.boolean(),
    error: v.boolean(),
  },
  handler: async (ctx, { videoId, newHash, thumbnailChanged, error }) => {
    const video = await ctx.db.get(videoId);
    if (!video) {
      console.warn(
        `Video with ID '${videoId}' not found for update and scheduling`,
      );
      return;
    }

    // Cancel existing scheduled function if it exists
    if (video.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(video.scheduledFunctionId);
        console.log(
          `Cancelled existing scheduled function for video ${videoId}`,
        );
      } catch (e) {
        console.warn(`Failed to cancel existing scheduled function: ${e}`);
      }
    }

    // Calculate next check interval
    const currentInterval = video.checkIntervalDays || 1;
    const nextInterval = calculateNextInterval(
      currentInterval,
      thumbnailChanged,
      error,
    );

    console.log(
      `Scheduling next check for video ${videoId} in ${nextInterval} days`,
      { thumbnailChanged },
    );

    // Schedule next check
    let newScheduledFunctionId;
    try {
      newScheduledFunctionId = await ctx.scheduler.runAt(
        daysFromNowInMilliseconds(nextInterval),
        internal.thumbnailMonitor.checkThumbnailChanges,
        { videoId },
      );
      console.log(
        `Successfully scheduled next check for video ${videoId} with ID ${newScheduledFunctionId}`,
      );
    } catch (e) {
      console.error(`Failed to schedule next check for video ${videoId}: ${e}`);
      // Don't update the database if scheduling failed
      return;
    }

    // Update video with all changes atomically
    await ctx.db.patch(videoId, {
      lastThumbnailHash: newHash,
      checkIntervalDays: nextInterval,
      lastCheckedAt: Date.now(),
      scheduledFunctionId: newScheduledFunctionId,
    });

    console.log(
      `Updated video ${videoId} with new check interval: ${nextInterval} days`,
    );
  },
});

// Helper function to schedule initial thumbnail check for a new video
export const scheduleInitialCheck = internalMutation({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (!video) {
      console.warn(
        `Video with ID '${videoId}' not found for initial scheduling`,
      );
      return;
    }

    console.log(`Scheduling initial thumbnail check for video ${videoId}`);

    // Schedule first check for 24 hours from now
    const scheduledFunctionId = await ctx.scheduler.runAt(
      daysFromNowInMilliseconds(1),
      internal.thumbnailMonitor.checkThumbnailChanges,
      { videoId },
    );

    // Update video with scheduled function ID
    await ctx.db.patch(videoId, {
      scheduledFunctionId,
    });
  },
});
