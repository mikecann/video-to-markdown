import { v, ConvexError } from "convex/values";
import { R2 } from "@convex-dev/r2";
import { components, internal as internalApi } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { convex } from "./fluent";
import {
  extractVideoId,
  getYoutubeVideoTitle,
  fetchYoutubeThumbnailWithFallback,
  hashThumbnail,
  addPlayIconToThumbnail,
  getDecoratedThumbnailUrl,
} from "./utils";

export const r2 = new R2(components.r2);

const DEFAULT_PER_PAGE = 21;
const MAX_PER_PAGE = 100;

async function getVideoCount(ctx: QueryCtx): Promise<number> {
  const stats = await ctx.db.query("videoStats").first();
  if (stats) return stats.count;
  // Until recountVideos has run once there's no stats row, so count directly.
  return (await ctx.db.query("videos").collect()).length;
}

export const createVideo = convex
  .mutation()
  .input({
    url: v.string(),
    videoId: v.string(),
    title: v.string(),
    thumbnailKey: v.optional(v.string()),
    originalThumbnailUrl: v.string(),
    processedThumbnailUrl: v.string(),
    initialThumbnailHash: v.optional(v.string()),
  })
  .handler(async (ctx, args): Promise<Id<"videos">> => {
    // processVideoUrl checks for duplicates too, but two requests for the same
    // video can both pass that check while they fetch the thumbnail. Checking
    // again here, inside the transaction, keeps videoId unique.
    const existing = await ctx.db
      .query("videos")
      .withIndex("by_videoId", (q) => q.eq("videoId", args.videoId))
      .first();
    if (existing)
      throw new ConvexError({ type: "DUPLICATE_VIDEO", id: existing._id });

    const videoId = await ctx.db.insert("videos", {
      url: args.url,
      videoId: args.videoId,
      title: args.title,
      thumbnailKey: args.thumbnailKey,
      originalThumbnailUrl: args.originalThumbnailUrl,
      processedThumbnailUrl: args.processedThumbnailUrl,
      lastThumbnailHash: args.initialThumbnailHash,
      checkIntervalDays: 1,
      lastCheckedAt: Date.now(),
      nextCheckAt: undefined,
    });

    // If there's no stats row yet, recountVideos will create it.
    const stats = await ctx.db.query("videoStats").first();
    if (stats) await ctx.db.patch(stats._id, { count: stats.count + 1 });

    return videoId;
  })
  .internal();

export const getVideoById = convex
  .query()
  .input({ id: v.id("videos") })
  .handler(async (ctx, { id }) => {
    return await ctx.db.get(id);
  })
  .public();

export const getVideoByYoutubeId = convex
  .query()
  .input({ videoId: v.string() })
  .handler(async (ctx, { videoId }) => {
    return await ctx.db
      .query("videos")
      .withIndex("by_videoId", (q) => q.eq("videoId", videoId))
      .unique();
  })
  .internal();

export const getVideos = convex
  .query()
  .input({
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  })
  .handler(async (ctx, { page = 0, perPage = DEFAULT_PER_PAGE }) => {
    const pageSize = Number.isFinite(perPage)
      ? Math.min(Math.max(Math.floor(perPage), 1), MAX_PER_PAGE)
      : DEFAULT_PER_PAGE;
    const start = Number.isFinite(page)
      ? Math.max(Math.floor(page), 0) * pageSize
      : 0;

    const totalCount = await getVideoCount(ctx);
    if (start >= totalCount) return { videos: [], totalCount };

    // Convex has no offset, so read only the newest rows up to the end of this
    // page rather than the whole table.
    const newest = await ctx.db
      .query("videos")
      .order("desc")
      .take(start + pageSize);
    return { videos: newest.slice(start), totalCount };
  })
  .public();

// Recomputes videoStats.count from the table, creating the row if needed.
// Runs daily from crons.ts so the count recovers from rows deleted in the
// dashboard; run it by hand after a deploy or a manual cleanup.
export const recountVideos = convex
  .mutation()
  .handler(async (ctx) => {
    const count = (await ctx.db.query("videos").collect()).length;
    const stats = await ctx.db.query("videoStats").first();
    if (stats) await ctx.db.patch(stats._id, { count });
    else await ctx.db.insert("videoStats", { count });
  })
  .internal();

export const processVideoUrl = convex
  .action()
  .input({ url: v.string() })
  .handler(async (ctx, { url }): Promise<Id<"videos">> => {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("Invalid YouTube URL");

    const existing = await ctx.runQuery(internalApi.videos.getVideoByYoutubeId, { videoId });
    if (existing) throw new ConvexError({ type: "DUPLICATE_VIDEO", id: existing._id });

    const title = await getYoutubeVideoTitle(videoId);

    const { url: originalThumbnailUrl, buffer: thumbnailBuffer } =
      await fetchYoutubeThumbnailWithFallback(videoId);
    const initialThumbnailHash = await hashThumbnail(thumbnailBuffer);
    const decoratedBuffer = await addPlayIconToThumbnail(thumbnailBuffer);

    const shortId = crypto.randomUUID().substring(0, 8);
    const thumbnailKey = await r2.store(ctx, decoratedBuffer, {
      key: `${shortId}.jpg`,
      type: "image/jpeg",
    });

    let videoDocId: Id<"videos">;
    try {
      videoDocId = await ctx.runMutation(internalApi.videos.createVideo, {
        url: `https://youtu.be/${videoId}`,
        videoId: videoId,
        title,
        thumbnailKey,
        originalThumbnailUrl,
        processedThumbnailUrl: getDecoratedThumbnailUrl(thumbnailKey),
        initialThumbnailHash,
      });
    } catch (error) {
      // Don't leave an orphaned thumbnail in R2 if the insert was rejected
      // (e.g. another request added the same video first). An error here
      // doesn't prove the insert didn't commit, so only delete the upload if
      // the row for this video isn't using it. A failed cleanup mustn't hide
      // the original error, which callers use to show the existing video.
      try {
        const row = await ctx.runQuery(internalApi.videos.getVideoByYoutubeId, {
          videoId,
        });
        if (row?.thumbnailKey !== thumbnailKey)
          await r2.deleteObject(ctx, thumbnailKey);
      } catch (cleanupError) {
        console.error(
          `Failed to delete orphaned thumbnail ${thumbnailKey}:`,
          cleanupError,
        );
      }
      throw error;
    }

    await ctx.runMutation(internalApi.thumbnailMonitor.scheduleInitialCheck, {
      videoId: videoDocId,
    });

    return videoDocId;
  })
  .public();
