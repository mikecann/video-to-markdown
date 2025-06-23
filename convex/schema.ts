import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  videos: defineTable({
    url: v.string(), // Original YouTube URL
    videoId: v.string(), // Extracted YouTube video ID
    title: v.string(), // Video title from oEmbed
    thumbnailKey: v.optional(v.string()), // R2 object key for the generated thumbnail
    originalThumbnailUrl: v.string(), // Original YouTube thumbnail URL
    processedThumbnailUrl: v.string(), // Processed thumbnail URL
    markdownCode: v.string(), // Generated markdown code
    createdAt: v.number(), // Timestamp
    // Thumbnail monitoring fields
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")), // ID of scheduled thumbnail check
    lastThumbnailHash: v.optional(v.string()), // Hash of the last downloaded thumbnail
    checkIntervalDays: v.optional(v.number()), // Current check interval in days (1, 2, 4, 8, 16)
    lastCheckedAt: v.optional(v.number()), // Timestamp of last thumbnail check
  }).index("by_videoId", ["videoId"]),
});
