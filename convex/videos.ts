import { v } from "convex/values";
import { mutation, query, action, internalQuery } from "./_generated/server";
import { R2 } from "@convex-dev/r2";
import { components, api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  extractVideoId,
  getYoutubeVideoTitle,
  getThumbnailUrlForYoutubeVideo,
  fetchAndDecorateThumb,
  getDecoratedThumbnailUrl,
} from "./utils";

export const r2 = new R2(components.r2);

export const createVideo = mutation({
  args: {
    url: v.string(),
    videoId: v.string(),
    title: v.string(),
    thumbnailKey: v.optional(v.string()),
    originalThumbnailUrl: v.string(),
    processedThumbnailUrl: v.string(),
    initialThumbnailHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"videos">> => {
    // Create new video entry
    const videoId = await ctx.db.insert("videos", {
      url: args.url,
      videoId: args.videoId,
      title: args.title,
      thumbnailKey: args.thumbnailKey,
      originalThumbnailUrl: args.originalThumbnailUrl,
      processedThumbnailUrl: args.processedThumbnailUrl,
      // Initialize thumbnail monitoring fields
      lastThumbnailHash: args.initialThumbnailHash,
      checkIntervalDays: 1, // Start with 1 day
      lastCheckedAt: Date.now(),
      nextCheckAt: undefined,
    });

    return videoId;
  },
});

export const getVideos = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const videos = await ctx.db.query("videos").order("desc").take(limit);
    return videos;
  },
});

export const getVideo = query({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const video = await ctx.db.get(id);
    return video;
  },
});

export const getVideoUrl = query({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const video = await ctx.db.get(id);
    if (!video) throw new Error("Video not found");
    return r2.getUrl(video.thumbnailKey || "");
  },
});

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
    await ctx.runMutation(internal.thumbnailMonitor.scheduleInitialCheck, {
      videoId: videoDocId,
    });

    return videoDocId;
  },
});
