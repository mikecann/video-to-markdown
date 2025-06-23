import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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
    // Get video details
    const video = await ctx.runQuery(
      internal.thumbnailMonitor.getVideoForCheck,
      { videoId },
    );

    if (!video) {
      console.log(`Video ${videoId} not found for thumbnail check`);
      return;
    }

    try {
      // Download current thumbnail from YouTube and check if it changed
      const thumbnailCheckResult = await ctx.runAction(
        internal.imageProcessing.checkThumbnailChanged,
        {
          originalThumbnailUrl: video.originalThumbnailUrl,
          lastThumbnailHash: video.lastThumbnailHash || "",
        },
      );

      if (thumbnailCheckResult.error) {
        console.log(
          `Failed to check thumbnail for video ${video.videoId}: ${thumbnailCheckResult.error}`,
        );
        // Schedule next check with same interval
        await ctx.runMutation(internal.thumbnailMonitor.scheduleNextCheck, {
          videoId,
          thumbnailChanged: false,
          error: true,
        });
        return;
      }

      const { thumbnailChanged, newHash } = thumbnailCheckResult;

      if (thumbnailChanged) {
        console.log(
          `Thumbnail changed for video ${video.videoId}, regenerating...`,
        );

        // Process the new thumbnail and update R2
        if (video.thumbnailKey) {
          await ctx.runAction(
            internal.imageProcessing.updateProcessedThumbnail,
            {
              originalThumbnailUrl: video.originalThumbnailUrl,
              thumbnailKey: video.thumbnailKey,
            },
          );
        }

        // Update video record with new hash and reset interval
        await ctx.runMutation(internal.thumbnailMonitor.updateVideoAfterCheck, {
          videoId,
          newHash,
          thumbnailChanged: true,
        });
      } else {
        console.log(
          `Thumbnail unchanged for video ${video.videoId}, increasing check interval`,
        );

        // Update video record and increase interval
        await ctx.runMutation(internal.thumbnailMonitor.updateVideoAfterCheck, {
          videoId,
          newHash,
          thumbnailChanged: false,
        });
      }

      // Schedule the next check
      await ctx.runMutation(internal.thumbnailMonitor.scheduleNextCheck, {
        videoId,
        thumbnailChanged,
        error: false,
      });
    } catch (error) {
      console.error(
        `Error checking thumbnail for video ${video.videoId}:`,
        error,
      );

      // Schedule next check with same interval on error
      await ctx.runMutation(internal.thumbnailMonitor.scheduleNextCheck, {
        videoId,
        thumbnailChanged: false,
        error: true,
      });
    }
  },
});

// Update video after thumbnail check
export const updateVideoAfterCheck = internalMutation({
  args: {
    videoId: v.id("videos"),
    newHash: v.string(),
    thumbnailChanged: v.boolean(),
  },
  handler: async (ctx, { videoId, newHash, thumbnailChanged }) => {
    const video = await ctx.db.get(videoId);
    if (!video) return;

    const currentInterval = video.checkIntervalDays || 1;

    // If thumbnail changed, reset to 1 day. Otherwise, double the interval (max 16 days)
    const nextInterval = thumbnailChanged
      ? 1
      : Math.min(currentInterval * 2, 16);

    await ctx.db.patch(videoId, {
      lastThumbnailHash: newHash,
      checkIntervalDays: nextInterval,
      lastCheckedAt: Date.now(),
    });
  },
});

// Schedule the next thumbnail check
export const scheduleNextCheck = internalMutation({
  args: {
    videoId: v.id("videos"),
    thumbnailChanged: v.boolean(),
    error: v.boolean(),
  },
  handler: async (ctx, { videoId, thumbnailChanged, error }) => {
    const video = await ctx.db.get(videoId);
    if (!video) return;

    // Cancel existing scheduled function if it exists
    if (video.scheduledFunctionId) {
      await ctx.scheduler.cancel(video.scheduledFunctionId);
    }

    // Calculate next check time
    const currentInterval = video.checkIntervalDays || 1;
    let nextInterval;

    if (error) {
      // On error, keep same interval
      nextInterval = currentInterval;
    } else if (thumbnailChanged) {
      // If thumbnail changed, reset to 1 day
      nextInterval = 1;
    } else {
      // If unchanged, use the updated interval from updateVideoAfterCheck
      nextInterval = Math.min(currentInterval * 2, 16);
    }

    // Schedule next check
    const scheduledTime = Date.now() + nextInterval * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const newScheduledFunctionId = await ctx.scheduler.runAt(
      scheduledTime,
      internal.thumbnailMonitor.checkThumbnailChanges,
      { videoId },
    );

    // Update video with new scheduled function ID
    await ctx.db.patch(videoId, {
      scheduledFunctionId: newScheduledFunctionId,
      checkIntervalDays: nextInterval,
    });
  },
});
