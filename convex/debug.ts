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
    console.log(`Triggering immediate check for ${videos.length} videos`);

    let triggered = 0;
    let errors = 0;

    for (const video of videos) {
      try {
        // Schedule an immediate check for the video's thumbnail.
        // The checkThumbnailChanges action will handle cancelling any old scheduled
        // function and scheduling the next one.
        await ctx.scheduler.runAfter(
          0, // Run as soon as possible
          internal.thumbnailMonitor.checkThumbnailChanges,
          { videoId: video._id },
        );
        triggered++;
        console.log(
          `Triggered immediate check for video ${video.videoId} (${video._id})`,
        );
      } catch (e) {
        errors++;
        console.error(
          `Failed to trigger check for video ${video.videoId} (${video._id}): ${e}`,
        );
      }
    }

    console.log(
      `Triggering complete: ${triggered} successful, ${errors} errors`,
    );
    return { triggered, errors };
  },
});
