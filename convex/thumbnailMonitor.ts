import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { convex } from "./fluent";
import { r2 } from "./videos";
import {
  addPlayIconToThumbnail,
  checkIfThumbnailChanged,
  daysFromNowInMilliseconds,
  calculateNextInterval,
  hasProcessedThumbnailShape,
} from "./utils";

// Replace a stored thumbnail in place, keeping its key and so its public URL
// (which people have pasted into READMEs). r2.store() throws if the key
// already has metadata, so clear that first. r2.deleteObject() isn't safe
// here: it deletes the R2 object in a background job that can run after the
// new upload and remove it.
export async function overwriteThumbnail(
  ctx: ActionCtx,
  key: string,
  image: Uint8Array,
) {
  await ctx.runMutation(components.r2.lib.deleteMetadata, {
    key,
    bucket: r2.config.bucket,
  });
  await r2.store(ctx, image, { key, type: "image/jpeg" });
}

export const getVideoForCheck = convex
  .query()
  .input({ videoId: v.id("videos") })
  .handler(async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (!video) return null;
    // A refresh overwrites the image at the row's key, so only the one row
    // with that key may do it. Rows from the old public createVideo could
    // copy a real video's key.
    const rowsWithKey = video.thumbnailKey
      ? await ctx.db
          .query("videos")
          .withIndex("by_thumbnailKey", (q) =>
            q.eq("thumbnailKey", video.thumbnailKey),
          )
          .take(2)
      : [];
    return { video, ownsThumbnailKey: rowsWithKey.length === 1 };
  })
  .internal();

export const checkThumbnailChanges = convex
  .action()
  .input({ videoId: v.id("videos") })
  .handler(async (ctx, { videoId }) => {
    const check = await ctx.runQuery(
      internal.thumbnailMonitor.getVideoForCheck,
      { videoId },
    );

    if (!check) {
      console.warn(`Thumbnail check: video ${videoId} not found, skipping`);
      return;
    }

    const { video, ownsThumbnailKey } = check;
    const skipReason = !hasProcessedThumbnailShape(video)
      ? "doesn't look like one processVideoUrl created"
      : !ownsThumbnailKey
        ? `shares thumbnail key ${video.thumbnailKey} with another video`
        : null;
    if (skipReason) {
      console.warn(`Thumbnail check: video ${videoId} ${skipReason}, skipping`);
      // Back off as if unchanged, so the repair cron doesn't retry it daily.
      await ctx.runMutation(
        internal.thumbnailMonitor.updateVideoAndScheduleNext,
        {
          videoId,
          newHash: video.lastThumbnailHash || "",
          thumbnailChanged: false,
          error: false,
        },
      );
      return;
    }

    try {
      const thumbnailCheckResult = await checkIfThumbnailChanged({
        originalThumbnailUrl: video.originalThumbnailUrl,
        lastThumbnailHash: video.lastThumbnailHash || "",
      });

      if (thumbnailCheckResult.error) {
        console.error(
          `Thumbnail check failed for ${video.videoId}: ${thumbnailCheckResult.error}`,
        );
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

      if (thumbnailChanged && video.thumbnailKey && arrayBuffer) {
        const processedImageBuffer =
          await addPlayIconToThumbnail(arrayBuffer);
        await overwriteThumbnail(ctx, video.thumbnailKey, processedImageBuffer);
      }

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
      console.error(`Thumbnail check error for ${video.videoId}:`, error);

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
  })
  .internal();

export const updateVideoAndScheduleNext = convex
  .mutation()
  .input({
    videoId: v.id("videos"),
    newHash: v.string(),
    thumbnailChanged: v.boolean(),
    error: v.boolean(),
  })
  .handler(async (ctx, { videoId, newHash, thumbnailChanged, error }) => {
    const video = await ctx.db.get(videoId);
    if (!video) {
      console.warn(`updateVideoAndScheduleNext: video ${videoId} not found`);
      return;
    }

    if (video.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(video.scheduledFunctionId);
      } catch {
        // Already completed or cancelled — safe to ignore
      }
    }

    const currentInterval = video.checkIntervalDays || 1;
    const nextInterval = calculateNextInterval(
      currentInterval,
      thumbnailChanged,
      error,
    );

    const nextCheckAt = daysFromNowInMilliseconds(nextInterval);
    let newScheduledFunctionId;
    try {
      newScheduledFunctionId = await ctx.scheduler.runAt(
        nextCheckAt,
        internal.thumbnailMonitor.checkThumbnailChanges,
        { videoId },
      );
    } catch (e) {
      console.error(`Failed to schedule next check for ${videoId}: ${e}`);
      return;
    }

    await ctx.db.patch(videoId, {
      lastThumbnailHash: newHash,
      checkIntervalDays: nextInterval,
      lastCheckedAt: Date.now(),
      nextCheckAt,
      scheduledFunctionId: newScheduledFunctionId,
    });
  })
  .internal();

function isScheduleStale(
  state: { kind: string } | undefined,
): boolean {
  if (!state) return true;
  return ["success", "failed", "canceled"].includes(state.kind);
}

// Called daily by cron as a safety net to reschedule stale checks.
export const repairStaleSchedules = convex
  .mutation()
  .handler(async (ctx) => {
    const videos = await ctx.db.query("videos").collect();
    const now = Date.now();
    let repaired = 0;

    for (const video of videos) {
      let needsReschedule = false;

      if (video.scheduledFunctionId) {
        const scheduled = await ctx.db.system.get(video.scheduledFunctionId);
        needsReschedule = isScheduleStale(scheduled?.state);
      } else {
        needsReschedule = true;
      }

      if (needsReschedule) {
        const intervalDays = video.checkIntervalDays || 1;
        const nextCheckAt = now + intervalDays * 24 * 60 * 60 * 1000;
        const scheduledFunctionId = await ctx.scheduler.runAt(
          nextCheckAt,
          internal.thumbnailMonitor.checkThumbnailChanges,
          { videoId: video._id },
        );
        await ctx.db.patch(video._id, {
          scheduledFunctionId,
          nextCheckAt,
        });
        repaired++;
      }
    }

    if (repaired > 0) {
      console.log(`Repaired ${repaired}/${videos.length} stale thumbnail schedules`);
    }
  })
  .internal();

export const scheduleInitialCheck = convex
  .mutation()
  .input({ videoId: v.id("videos") })
  .handler(async (ctx, { videoId }) => {
    const video = await ctx.db.get(videoId);
    if (!video) {
      console.warn(`scheduleInitialCheck: video ${videoId} not found`);
      return;
    }

    const scheduledFunctionId = await ctx.scheduler.runAt(
      daysFromNowInMilliseconds(1),
      internal.thumbnailMonitor.checkThumbnailChanges,
      { videoId },
    );

    await ctx.db.patch(videoId, {
      scheduledFunctionId,
      nextCheckAt: daysFromNowInMilliseconds(1),
    });
  })
  .internal();
