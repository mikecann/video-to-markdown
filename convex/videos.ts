import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { R2 } from "@convex-dev/r2";
import { components, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const r2 = new R2(components.r2);

// Configure R2 client API
export const { generateUploadUrl, syncMetadata } = r2.clientApi({
  checkUpload: async (_ctx, _bucket) => {
    // Add any upload validation logic here if needed
    // For now, we'll allow all uploads
  },
  onUpload: async (_ctx, key) => {
    // This runs after successful upload to R2
    console.log(`Successfully uploaded file with key: ${key}`);
  },
});

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch video metadata from YouTube oEmbed API
export const fetchVideoMetadata = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }) => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    try {
      // Use YouTube oEmbed API to get video metadata
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const response = await fetch(oEmbedUrl);

      if (!response.ok) {
        throw new Error("Failed to fetch video metadata");
      }

      const metadata = await response.json();

      return {
        videoId,
        title: metadata.title,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        cleanUrl: `https://youtu.be/${videoId}`,
      };
    } catch (error) {
      throw new Error(`Failed to fetch video metadata: ${error}`);
    }
  },
});

// Generate thumbnail with play button overlay and store in R2
export const generateThumbnailWithPlayButton = action({
  args: {
    videoId: v.string(),
    thumbnailUrl: v.string(),
  },
  handler: async (ctx, { videoId, thumbnailUrl }) => {
    try {
      // Fetch the original thumbnail
      const thumbnailResponse = await fetch(thumbnailUrl);
      if (!thumbnailResponse.ok) {
        throw new Error("Failed to fetch thumbnail image");
      }

      const thumbnailBuffer = await thumbnailResponse.arrayBuffer();

      // For now, we'll store the original thumbnail
      // In a future enhancement, we could add play button overlay using canvas API
      const blob = new Blob([thumbnailBuffer], { type: "image/jpeg" });

      // Store the thumbnail in R2
      const key = await r2.store(ctx, blob, {
        key: `thumbnails/${videoId}.jpg`,
        type: "image/jpeg",
      });

      return key;
    } catch (error) {
      throw new Error(`Failed to generate thumbnail: ${error}`);
    }
  },
});

// Create a new video entry
export const createVideo = mutation({
  args: {
    url: v.string(),
    videoId: v.string(),
    title: v.string(),
    thumbnailKey: v.optional(v.string()),
    originalThumbnailUrl: v.string(),
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

    // Generate markdown code
    const markdownCode = `[![${args.title}](${args.originalThumbnailUrl})](${args.url})`;

    // Create new video entry
    const videoId = await ctx.db.insert("videos", {
      url: args.url,
      videoId: args.videoId,
      title: args.title,
      thumbnailKey: args.thumbnailKey,
      originalThumbnailUrl: args.originalThumbnailUrl,
      markdownCode,
      createdAt: Date.now(),
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
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_creation_time")
      .order("desc")
      .take(limit);

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

// Complete workflow: process YouTube URL and create video entry
export const processVideoUrl = action({
  args: { url: v.string() },
  handler: async (ctx, { url }): Promise<Id<"videos">> => {
    // Step 1: Extract video ID and validate URL
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL");
    }

    // Step 2: Fetch video metadata from YouTube oEmbed API
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch video metadata");
    }

    const metadata = await response.json();
    const cleanUrl = `https://youtu.be/${videoId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    // Step 3: Generate and store thumbnail (optional - can be done async)
    let thumbnailKey: string | undefined;
    try {
      // Fetch the original thumbnail
      const thumbnailResponse = await fetch(thumbnailUrl);
      if (thumbnailResponse.ok) {
        const thumbnailBuffer = await thumbnailResponse.arrayBuffer();
        const blob = new Blob([thumbnailBuffer], { type: "image/jpeg" });

        // Store the thumbnail in R2
        thumbnailKey = await r2.store(ctx, blob, {
          key: `thumbnails/${videoId}.jpg`,
          type: "image/jpeg",
        });
      }
    } catch (error) {
      console.error(
        "Failed to generate custom thumbnail, using original:",
        error,
      );
    }

    // Step 4: Create video entry in database
    const videoDocId = await ctx.runMutation(api.videos.createVideo, {
      url: cleanUrl,
      videoId: videoId,
      title: metadata.title,
      thumbnailKey,
      originalThumbnailUrl: thumbnailUrl,
    });

    return videoDocId;
  },
});
