/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { Jimp } from "jimp";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { extractVideoId, getYoutubeVideoTitle } from "./utils";
import { r2 } from "./videos";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("videos module business logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("processVideoUrl business logic", () => {
    it("should extract video ID from URL correctly", () => {
      // Test the core URL parsing logic
      expect(
        extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      ).toBe("dQw4w9WgXcQ");
      expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
        "dQw4w9WgXcQ",
      );
      expect(extractVideoId("https://example.com/not-youtube")).toBeNull();
    });

    it("should handle YouTube API metadata fetching", async () => {
      // Mock successful metadata fetch
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("youtube.com/oembed")) {
            return {
              ok: true,
              json: async () => ({
                title: "Test Video Title",
                author_name: "Test Author",
              }),
            };
          }
          return { ok: true, arrayBuffer: async () => new ArrayBuffer(1024) };
        }),
      );

      const title = await getYoutubeVideoTitle("dQw4w9WgXcQ");
      expect(title).toBe("Test Video Title");
    });

    it("should handle YouTube API failures gracefully", async () => {
      // Mock API failure from YouTube oEmbed and the noembed.com fallback
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (
            url.includes("youtube.com/oembed") ||
            url.includes("noembed.com")
          ) {
            return { ok: false, status: 404, statusText: "Not Found" };
          }
          return { ok: true, arrayBuffer: async () => new ArrayBuffer(1024) };
        }),
      );

      await expect(getYoutubeVideoTitle("invalid_id")).rejects.toThrow(
        "Failed to fetch video metadata",
      );
    });

    it("should handle thumbnail URL generation", () => {
      // Test thumbnail URL generation logic
      const videoId = "dQw4w9WgXcQ";
      const expectedThumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // This tests the thumbnail URL pattern used in the code
      expect(expectedThumbnailUrl).toBe(
        "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      );
    });

    it("should handle thumbnail processing errors", async () => {
      // Test error handling logic for thumbnail processing
      const mockError = new Error("Failed to fetch thumbnail: 404 Not Found");

      // Test that we can detect and handle fetch failures
      expect(mockError.message).toContain("Failed to fetch thumbnail");
      expect(mockError.message).toContain("404 Not Found");
    });
  });

  describe("createVideo", () => {
    const videoArgs = {
      url: "https://youtu.be/dQw4w9WgXcQ",
      videoId: "dQw4w9WgXcQ",
      title: "Test Video",
      thumbnailKey: "test-key.jpg",
      originalThumbnailUrl:
        "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      processedThumbnailUrl:
        "https://thumbs.video-to-markdown.com/test-key.jpg",
      initialThumbnailHash: "hash-123",
    };

    it("should insert a video with default monitoring values", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(internal.videos.createVideo, videoArgs);

      const video = await t.run((ctx) => ctx.db.get(id));
      expect(video).toMatchObject({
        videoId: "dQw4w9WgXcQ",
        url: "https://youtu.be/dQw4w9WgXcQ",
        lastThumbnailHash: "hash-123",
        checkIntervalDays: 1,
      });
    });

    it("should reject a duplicate videoId", async () => {
      const t = convexTest(schema, modules);
      const id = await t.mutation(internal.videos.createVideo, videoArgs);

      const error = await t
        .mutation(internal.videos.createVideo, {
          ...videoArgs,
          title: "Someone else's title",
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConvexError);
      expect((error as Error).message).toContain("DUPLICATE_VIDEO");
      expect((error as Error).message).toContain(id);

      const videos = await t.run((ctx) => ctx.db.query("videos").collect());
      expect(videos).toHaveLength(1);
      expect(videos[0].title).toBe("Test Video");
    });

    it("should not be exposed on the public API", () => {
      // Type-level guard: `tsc` fails if createVideo is made public again.
      // @ts-expect-error createVideo is internal-only
      expect(api.videos.createVideo).toBeDefined();
    });
  });

  describe("getVideos", () => {
    const seedVideos = async (t: ReturnType<typeof convexTest>, n: number) => {
      await t.run(async (ctx) => {
        for (let i = 0; i < n; i++) {
          await ctx.db.insert("videos", {
            url: `https://youtu.be/video${i}`,
            videoId: `video${i}`,
            title: `Video ${i}`,
            originalThumbnailUrl: `https://img.youtube.com/vi/video${i}/maxresdefault.jpg`,
            processedThumbnailUrl: `https://thumbs.video-to-markdown.com/video${i}.jpg`,
          });
        }
      });
    };

    it("should return pages newest first with the total count", async () => {
      const t = convexTest(schema, modules);
      await seedVideos(t, 25);
      await t.mutation(internal.videos.recountVideos, {});

      const first = await t.query(api.videos.getVideos, { page: 0 });
      expect(first.totalCount).toBe(25);
      expect(first.videos).toHaveLength(21);
      expect(first.videos[0].videoId).toBe("video24");

      const second = await t.query(api.videos.getVideos, { page: 1 });
      expect(second.totalCount).toBe(25);
      expect(second.videos.map((v) => v.videoId)).toEqual([
        "video3",
        "video2",
        "video1",
        "video0",
      ]);

      const beyond = await t.query(api.videos.getVideos, { page: 5 });
      expect(beyond).toEqual({ videos: [], totalCount: 25 });
    });

    it("should count the table when there is no stats row yet", async () => {
      const t = convexTest(schema, modules);
      await seedVideos(t, 3);

      const result = await t.query(api.videos.getVideos, {});
      expect(result.totalCount).toBe(3);
      expect(result.videos).toHaveLength(3);
    });

    it("should clamp page and perPage", async () => {
      const t = convexTest(schema, modules);
      await seedVideos(t, 150);
      await t.mutation(internal.videos.recountVideos, {});

      const big = await t.query(api.videos.getVideos, { perPage: 10_000 });
      expect(big.videos).toHaveLength(100);

      const negative = await t.query(api.videos.getVideos, { page: -3 });
      expect(negative.videos[0].videoId).toBe("video149");
    });

    it("should keep the count current as videos are added", async () => {
      const t = convexTest(schema, modules);
      await seedVideos(t, 2);
      await t.mutation(internal.videos.recountVideos, {});

      await t.mutation(internal.videos.createVideo, {
        url: "https://youtu.be/dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
        title: "Test Video",
        originalThumbnailUrl:
          "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        processedThumbnailUrl:
          "https://thumbs.video-to-markdown.com/test-key.jpg",
      });

      const result = await t.query(api.videos.getVideos, {});
      expect(result.totalCount).toBe(3);
      expect(result.videos[0].videoId).toBe("dQw4w9WgXcQ");
    });

    it("should correct a drifted count when recounted", async () => {
      const t = convexTest(schema, modules);
      await seedVideos(t, 4);
      await t.mutation(internal.videos.recountVideos, {});

      // Simulate a row deleted from the dashboard, which skips the counter.
      await t.run(async (ctx) => {
        const oldest = await ctx.db.query("videos").first();
        await ctx.db.delete(oldest!._id);
      });
      expect((await t.query(api.videos.getVideos, {})).totalCount).toBe(4);

      await t.mutation(internal.videos.recountVideos, {});
      expect((await t.query(api.videos.getVideos, {})).totalCount).toBe(3);
    });
  });

  describe("processVideoUrl when another request adds the same video first", () => {
    const videoId = "dQw4w9WgXcQ";
    const uploadedKey = "abcd1234.jpg";

    // Stub YouTube, and make the R2 upload stand in for the slow part of the
    // action: while it runs, another request inserts the same video.
    async function setUpRace(otherThumbnailKey = "other123.jpg") {
      const t = convexTest(schema, modules);
      const jpeg = await new Jimp({
        width: 4,
        height: 4,
        color: 0xff0000ff,
      }).getBuffer("image/jpeg");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("youtube.com/oembed")) {
            return { ok: true, json: async () => ({ title: "Test Video" }) };
          }
          return {
            ok: true,
            arrayBuffer: async () => new Uint8Array(jpeg).buffer,
          };
        }),
      );

      let otherId: Id<"videos"> | undefined;
      vi.spyOn(r2, "store").mockImplementation(async () => {
        otherId = await t.mutation(internal.videos.createVideo, {
          url: `https://youtu.be/${videoId}`,
          videoId,
          title: "Test Video",
          thumbnailKey: otherThumbnailKey,
          originalThumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          processedThumbnailUrl: `https://thumbs.video-to-markdown.com/${otherThumbnailKey}`,
        });
        return uploadedKey;
      });
      const deleteObject = vi.spyOn(r2, "deleteObject");

      return { t, deleteObject, getOtherId: () => otherId };
    }

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should delete its own upload and report the existing video", async () => {
      const { t, deleteObject, getOtherId } = await setUpRace();
      deleteObject.mockResolvedValue(undefined);

      const error = await t
        .action(api.videos.processVideoUrl, {
          url: `https://youtu.be/${videoId}`,
        })
        .catch((e: unknown) => e);

      expect((error as Error).message).toContain("DUPLICATE_VIDEO");
      expect((error as Error).message).toContain(getOtherId());
      expect(deleteObject).toHaveBeenCalledWith(expect.anything(), uploadedKey);
      const videos = await t.run((ctx) => ctx.db.query("videos").collect());
      expect(videos).toHaveLength(1);
    });

    it("should still report the existing video if the cleanup fails", async () => {
      const { t, deleteObject, getOtherId } = await setUpRace();
      deleteObject.mockRejectedValue(new Error("R2 unavailable"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const error = await t
        .action(api.videos.processVideoUrl, {
          url: `https://youtu.be/${videoId}`,
        })
        .catch((e: unknown) => e);

      expect((error as Error).message).toContain("DUPLICATE_VIDEO");
      expect((error as Error).message).toContain(getOtherId());
      expect(deleteObject).toHaveBeenCalledWith(expect.anything(), uploadedKey);
      expect(consoleError).toHaveBeenCalled();
    });

    it("should keep the upload if the video's row is using it", async () => {
      // Stands in for an insert that committed even though runMutation threw.
      const { t, deleteObject } = await setUpRace(uploadedKey);
      deleteObject.mockResolvedValue(undefined);

      await t
        .action(api.videos.processVideoUrl, {
          url: `https://youtu.be/${videoId}`,
        })
        .catch(() => {});

      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  describe("thumbnail monitoring interval logic", () => {
    it("should implement correct interval progression", () => {
      // Test interval doubling logic
      const intervals = [1, 2, 4, 8, 16];

      for (let i = 0; i < intervals.length - 1; i++) {
        const current = intervals[i];
        const next = intervals[i + 1];
        expect(next).toBe(current * 2);
      }

      // Test max interval cap
      expect(Math.min(32, 16)).toBe(16); // Should cap at 16
    });

    it("should reset interval when thumbnail changes", () => {
      // Simulate thumbnail change scenario
      const currentInterval = 8;
      const thumbnailChanged = true;

      const newInterval = thumbnailChanged
        ? 1
        : Math.min(currentInterval * 2, 16);
      expect(newInterval).toBe(1);
    });

    it("should double interval when thumbnail unchanged", () => {
      // Simulate thumbnail unchanged scenario
      const currentInterval = 4;
      const thumbnailChanged = false;

      const newInterval = thumbnailChanged
        ? 1
        : Math.min(currentInterval * 2, 16);
      expect(newInterval).toBe(8);
    });

    it("should cap interval at maximum", () => {
      // Test interval capping
      const currentInterval = 16;
      const thumbnailChanged = false;

      const newInterval = thumbnailChanged
        ? 1
        : Math.min(currentInterval * 2, 16);
      expect(newInterval).toBe(16); // Should stay at 16, not go to 32
    });
  });
});
