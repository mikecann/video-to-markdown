import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { daysFromNowInMilliseconds } from "./utils";

// Debug query to check scheduled function status
// this is a debug function and should not be tested
export const getScheduledFunctionStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const videos = await ctx.db.query("videos").collect();
    const now = Date.now();

    return videos.map((video) => {
      const nextCheckTime = video.lastCheckedAt
        ? video.lastCheckedAt +
          daysFromNowInMilliseconds(video.checkIntervalDays || 1) -
          now
        : null;

      return {
        videoId: video.videoId,
        title: video.title,
        scheduledFunctionId: video.scheduledFunctionId,
        checkIntervalDays: video.checkIntervalDays,
        lastCheckedAt: video.lastCheckedAt,
        nextCheckInHours: nextCheckTime
          ? Math.round(nextCheckTime / (1000 * 60 * 60))
          : null,
        hasScheduledFunction: !!video.scheduledFunctionId,
      };
    });
  },
});

// Utility function to reschedule all videos (for fixing broken scheduled functions)
// this is a debug function and should not be tested
export const rescheduleAllVideos = internalMutation({
  args: {},
  handler: async (ctx) => {
    const videos = await ctx.db.query("videos").collect();
    console.log(`Rescheduling ${videos.length} videos`);

    let rescheduled = 0;
    let errors = 0;

    for (const video of videos) {
      try {
        // Cancel existing scheduled function if it exists
        if (video.scheduledFunctionId) {
          try {
            await ctx.scheduler.cancel(video.scheduledFunctionId);
          } catch (e) {
            console.warn(
              `Failed to cancel existing scheduled function for video ${video._id}: ${e}`,
            );
          }
        }

        // Schedule new check based on current interval or default to 1 day
        const intervalDays = video.checkIntervalDays || 1;
        const scheduledFunctionId = await ctx.scheduler.runAt(
          daysFromNowInMilliseconds(intervalDays),
          internal.thumbnailMonitor.checkThumbnailChanges,
          { videoId: video._id },
        );

        // Update video with new scheduled function ID
        await ctx.db.patch(video._id, {
          scheduledFunctionId,
        });

        rescheduled++;
        console.log(`Rescheduled video ${video.videoId} (${video._id})`);
      } catch (e) {
        errors++;
        console.error(
          `Failed to reschedule video ${video.videoId} (${video._id}): ${e}`,
        );
      }
    }

    console.log(
      `Rescheduling complete: ${rescheduled} successful, ${errors} errors`,
    );
    return { rescheduled, errors };
  },
});

// Temporary mutation to remove the legacy 'createdAt' field from all video documents
export const removeCreatedAtField = internalMutation({
  args: {},
  handler: async (ctx) => {
    const videos = await ctx.db.query("videos").collect();

    let updatedCount = 0;
    for (const video of videos) {
      if ("createdAt" in video) {
        // TypeScript doesn't know about this field, so we use `as any`
        // Setting it to `undefined` should remove the field from the document.
        await ctx.db.patch(video._id, { createdAt: undefined } as any);
        updatedCount++;
      }
    }

    const message = `Cleanup complete. Checked ${videos.length} videos and removed 'createdAt' field from ${updatedCount} of them.`;
    console.log(message);
    return message;
  },
});
