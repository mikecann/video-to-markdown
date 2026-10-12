import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { convex } from "./fluent";

// One-off cleanup for videos added more than once before createVideo started
// rejecting duplicates. Keeps the oldest row for each videoId and deletes the
// others. Their R2 thumbnails stay: people may have pasted markdown that
// points at them. Dry run unless dryRun is false. Run videos:recountVideos
// afterwards to fix the count.
export const removeDuplicateVideos = convex
  .mutation()
  .input({ dryRun: v.optional(v.boolean()) })
  .handler(async (ctx, { dryRun = true }) => {
    // Oldest first, so the first row seen for each videoId is the one to keep.
    const videos = await ctx.db.query("videos").collect();
    const rowsByVideoId = new Map<string, Doc<"videos">[]>();
    for (const video of videos) {
      const rows = rowsByVideoId.get(video.videoId);
      if (rows) rows.push(video);
      else rowsByVideoId.set(video.videoId, [video]);
    }

    const groups: {
      videoId: string;
      kept: Id<"videos">;
      deleted: Id<"videos">[];
    }[] = [];
    for (const [videoId, [kept, ...extras]] of rowsByVideoId) {
      if (extras.length === 0) continue;
      groups.push({
        videoId,
        kept: kept._id,
        deleted: extras.map((r) => r._id),
      });
      if (dryRun) continue;
      for (const extra of extras) {
        if (extra.scheduledFunctionId) {
          try {
            await ctx.scheduler.cancel(extra.scheduledFunctionId);
          } catch {
            // Already ran or was cancelled
          }
        }
        await ctx.db.delete(extra._id);
      }
    }

    return {
      dryRun,
      groups,
      deletedCount: groups.reduce((n, g) => n + g.deleted.length, 0),
    };
  })
  .internal();
