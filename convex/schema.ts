import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema is entirely optional.
// You can delete this file (schema.ts) and the
// app will continue to work.
// The schema provides more precise TypeScript types.
export default defineSchema({
  videos: defineTable({
    url: v.string(), // Original YouTube URL
    videoId: v.string(), // Extracted YouTube video ID
    title: v.string(), // Video title from oEmbed
    thumbnailKey: v.optional(v.string()), // R2 object key for the generated thumbnail
    originalThumbnailUrl: v.string(), // Original YouTube thumbnail URL
    markdownCode: v.string(), // Generated markdown code
    createdAt: v.number(), // Timestamp
  }).index("by_videoId", ["videoId"]),
});
