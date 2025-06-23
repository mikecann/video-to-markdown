import { v } from "convex/values";
import { mutation, query, action, internalQuery } from "./_generated/server";
import { R2 } from "@convex-dev/r2";
import { components, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const r2 = new R2(components.r2);

// Configure R2 client API
export const { generateUploadUrl, syncMetadata } = r2.clientApi();

// Create a new video entry
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
      createdAt: Date.now(),
      // Initialize thumbnail monitoring fields
      lastThumbnailHash: args.initialThumbnailHash,
      checkIntervalDays: 1, // Start with 1 day
      lastCheckedAt: Date.now(),
    });

    return videoId;
  },
});

// Get all videos with pagination
export const getVideos = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 20 }) => {
    const videos = await ctx.db.query("videos").order("desc").take(limit);
    return videos;
  },
});

// Get a single video by ID
export const getVideo = query({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const video = await ctx.db.get(id);
    return video;
  },
});

// Update video with scheduled function ID
export const updateScheduledFunction = mutation({
  args: {
    videoId: v.id("videos"),
    scheduledFunctionId: v.id("_scheduled_functions"),
  },
  handler: async (ctx, { videoId, scheduledFunctionId }) => {
    await ctx.db.patch(videoId, {
      scheduledFunctionId,
    });
  },
});
