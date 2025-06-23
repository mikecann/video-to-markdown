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
    // Check if video already exists
    const existingVideo = await ctx.db
      .query("videos")
      .withIndex("by_videoId", (q) => q.eq("videoId", args.videoId))
      .first();

    if (existingVideo) {
      return existingVideo._id;
    }

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
  handler: async (ctx, { limit = 10 }) => {
    const videos = await ctx.db.query("videos").order("desc").take(limit);

    // Generate URLs for R2-stored thumbnails
    const videosWithUrls = await Promise.all(
      videos.map(async (video) => {
        let thumbnailUrl = video.originalThumbnailUrl;

        if (video.thumbnailKey) {
          try {
            thumbnailUrl = await r2.getUrl(video.thumbnailKey);
          } catch (error) {
            console.error(
              "Failed to get R2 URL, falling back to original:",
              error,
            );
          }
        }

        return {
          ...video,
          thumbnailUrl,
        };
      }),
    );

    return videosWithUrls;
  },
});

// Get a single video by ID
export const getVideo = query({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const video = await ctx.db.get(id);
    if (!video) return null;

    let thumbnailUrl = video.originalThumbnailUrl;

    if (video.thumbnailKey) {
      try {
        thumbnailUrl = await r2.getUrl(video.thumbnailKey);
      } catch (error) {
        console.error("Failed to get R2 URL, falling back to original:", error);
      }
    }

    return {
      ...video,
      thumbnailUrl,
    };
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
