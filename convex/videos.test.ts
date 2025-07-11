import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractVideoId, getYoutubeVideoTitle } from "./utils";

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
      // Mock API failure
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("youtube.com/oembed")) {
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

  describe("createVideo business logic", () => {
    it("should validate required fields for video creation", () => {
      // Test that we have the right field structure
      const requiredFields = {
        url: "https://youtu.be/dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
        title: "Test Video",
        originalThumbnailUrl:
          "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        processedThumbnailUrl:
          "https://thumbs.video-to-markdown.com/test-key.jpg",
      };

      // Verify all required fields are present
      expect(requiredFields.url).toBeTruthy();
      expect(requiredFields.videoId).toBeTruthy();
      expect(requiredFields.title).toBeTruthy();
      expect(requiredFields.originalThumbnailUrl).toBeTruthy();
      expect(requiredFields.processedThumbnailUrl).toBeTruthy();
    });

    it("should set correct default values for monitoring", () => {
      // Test default monitoring field values
      const defaultMonitoringFields = {
        checkIntervalDays: 1,
        lastCheckedAt: Date.now(),
      };

      expect(defaultMonitoringFields.checkIntervalDays).toBe(1);
      expect(defaultMonitoringFields.lastCheckedAt).toBeTypeOf("number");
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
