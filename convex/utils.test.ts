import { convexTest } from "convex-test";
import { describe, it, expect, vi } from "vitest";
import {
  extractVideoId,
  getYoutubeOembedMetadata,
  getYoutubeVideoTitle,
  fetchThumbnailFromUrl,
  hashThumbnail,
  createHash,
  checkIfThumbnailChanged,
  calculateNextInterval,
} from "./utils";

describe("utils", () => {
  describe("extractVideoId", () => {
    it("should extract video ID from youtube.com/watch URL", async () => {
      const videoId = extractVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(videoId).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from youtu.be URL", async () => {
      const videoId = extractVideoId("https://youtu.be/dQw4w9WgXcQ");
      expect(videoId).toBe("dQw4w9WgXcQ");
    });

    it("should extract video ID from youtube.com/embed URL", async () => {
      const videoId = extractVideoId(
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      );
      expect(videoId).toBe("dQw4w9WgXcQ");
    });

    it("should return null for invalid URLs", async () => {
      expect(extractVideoId("https://example.com")).toBeNull();
      expect(extractVideoId("not a url")).toBeNull();
      expect(extractVideoId("")).toBeNull();
    });

    it("should handle URLs with additional parameters", async () => {
      const videoId = extractVideoId(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PLrAXtmRdnEQy",
      );
      expect(videoId).toBe("dQw4w9WgXcQ");
    });
  });

  describe("getYoutubeOembedMetadata", () => {
    it("should fetch valid metadata for existing video", async () => {
      const mockMetadata = {
        title: "Test Video",
        author_name: "Test Author",
        thumbnail_url: "https://example.com/thumb.jpg",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => mockMetadata,
        })),
      );

      const metadata = await getYoutubeOembedMetadata("dQw4w9WgXcQ");
      expect(metadata).toEqual(mockMetadata);

      vi.unstubAllGlobals();
    });

    it("should throw error for non-existent video", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })),
      );

      await expect(getYoutubeOembedMetadata("invalid_id")).rejects.toThrow(
        "Failed to fetch video metadata",
      );

      vi.unstubAllGlobals();
    });

    it("should handle network errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network error");
        }),
      );

      await expect(getYoutubeOembedMetadata("dQw4w9WgXcQ")).rejects.toThrow(
        "Network error",
      );

      vi.unstubAllGlobals();
    });
  });

  describe("getYoutubeVideoTitle", () => {
    it("should return title for valid video", async () => {
      const mockMetadata = {
        title: "Test Video Title",
        author_name: "Test Author",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => mockMetadata,
        })),
      );

      const title = await getYoutubeVideoTitle("dQw4w9WgXcQ");
      expect(title).toBe("Test Video Title");

      vi.unstubAllGlobals();
    });

    it("should throw error for invalid metadata", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => null,
        })),
      );

      await expect(getYoutubeVideoTitle("invalid_id")).rejects.toThrow(
        "Invalid YouTube metadata",
      );

      vi.unstubAllGlobals();
    });

    it("should handle missing title in metadata", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            author_name: "Test Author",
            // title is missing
          }),
        })),
      );

      await expect(getYoutubeVideoTitle("dQw4w9WgXcQ")).rejects.toThrow(
        "Invalid YouTube metadata",
      );

      vi.unstubAllGlobals();
    });
  });

  describe("fetchThumbnailFromUrl", () => {
    it("should fetch thumbnail successfully", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      const result = await fetchThumbnailFromUrl(
        "https://example.com/thumb.jpg",
      );
      expect(result).toBe(mockArrayBuffer);

      vi.unstubAllGlobals();
    });

    it("should throw error for 404 response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })),
      );

      await expect(
        fetchThumbnailFromUrl("https://example.com/missing.jpg"),
      ).rejects.toThrow("Failed to fetch thumbnail: 404 Not Found");

      vi.unstubAllGlobals();
    });

    it("should throw error for network failures", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network error");
        }),
      );

      await expect(
        fetchThumbnailFromUrl("https://example.com/thumb.jpg"),
      ).rejects.toThrow("Network error");

      vi.unstubAllGlobals();
    });

    it("should handle different response status codes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })),
      );

      await expect(
        fetchThumbnailFromUrl("https://example.com/thumb.jpg"),
      ).rejects.toThrow("Failed to fetch thumbnail: 500 Internal Server Error");

      vi.unstubAllGlobals();
    });
  });

  describe("hashThumbnail", () => {
    it("should generate consistent hash for same input", async () => {
      const testData = new ArrayBuffer(8);
      const view = new Uint8Array(testData);
      view[0] = 1;
      view[1] = 2;
      view[2] = 3;
      view[3] = 4;

      const hash1 = await hashThumbnail(testData);
      const hash2 = await hashThumbnail(testData);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe("string");
      expect(hash1.length).toBe(64); // SHA-256 hex string length
    });

    it("should generate different hash for different input", async () => {
      const testData1 = new ArrayBuffer(8);
      const view1 = new Uint8Array(testData1);
      view1[0] = 1;

      const testData2 = new ArrayBuffer(8);
      const view2 = new Uint8Array(testData2);
      view2[0] = 2;

      const hash1 = await hashThumbnail(testData1);
      const hash2 = await hashThumbnail(testData2);

      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty ArrayBuffer", async () => {
      const emptyBuffer = new ArrayBuffer(0);
      const hash = await hashThumbnail(emptyBuffer);

      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
    });
  });

  describe("createHash", () => {
    it("should create SHA-256 hash as hex string", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const hash = await createHash(testData);

      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/); // Only hex characters
    });

    it("should handle empty data", async () => {
      const emptyData = new Uint8Array(0);
      const hash = await createHash(emptyData);

      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(64);
      // SHA-256 of empty data should be consistent
      expect(hash).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
    });

    it("should produce consistent results", async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const hash1 = await createHash(testData);
      const hash2 = await createHash(testData);

      expect(hash1).toBe(hash2);
    });
  });

  describe("checkIfThumbnailChanged", () => {
    it("should detect thumbnail changes", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const view = new Uint8Array(mockArrayBuffer);
      view[0] = 1; // Different content

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl: "https://example.com/thumb.jpg",
        lastThumbnailHash: "different_hash",
      });

      expect(result.error).toBeNull();
      expect(result.thumbnailChanged).toBe(true);
      expect(result.newHash).toBeTruthy();
      expect(result.arrayBuffer).toBe(mockArrayBuffer);

      vi.unstubAllGlobals();
    });

    it("should detect when thumbnail is unchanged", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      // Get the actual hash of the mock data
      const actualHash = await hashThumbnail(mockArrayBuffer);

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl: "https://example.com/thumb.jpg",
        lastThumbnailHash: actualHash,
      });

      expect(result.error).toBeNull();
      expect(result.thumbnailChanged).toBe(false);
      expect(result.newHash).toBe(actualHash);
      expect(result.arrayBuffer).toBe(mockArrayBuffer);

      vi.unstubAllGlobals();
    });

    it("should handle fetch errors gracefully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network error");
        }),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl: "https://example.com/thumb.jpg",
        lastThumbnailHash: "some_hash",
      });

      expect(result.error).toContain("Error checking thumbnail");
      expect(result.thumbnailChanged).toBe(false);
      expect(result.newHash).toBe("");
      expect(result.arrayBuffer).toBeNull();

      vi.unstubAllGlobals();
    });

    it("should return appropriate error messages", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl: "https://example.com/missing.jpg",
        lastThumbnailHash: "some_hash",
      });

      expect(result.error).toContain("Error checking thumbnail");
      expect(result.error).toContain("Failed to fetch thumbnail");
      expect(result.thumbnailChanged).toBe(false);

      vi.unstubAllGlobals();
    });

    it("should handle empty lastThumbnailHash", async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => mockArrayBuffer,
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl: "https://example.com/thumb.jpg",
        lastThumbnailHash: "",
      });

      expect(result.error).toBeNull();
      expect(result.thumbnailChanged).toBe(true); // Empty hash should be considered changed
      expect(result.newHash).toBeTruthy();
      expect(result.arrayBuffer).toBe(mockArrayBuffer);

      vi.unstubAllGlobals();
    });
  });

  describe("calculateNextInterval", () => {
    it("should keep same interval on error", () => {
      expect(calculateNextInterval(4, false, true)).toBe(4);
      expect(calculateNextInterval(8, true, true)).toBe(8); // Error takes precedence
      expect(calculateNextInterval(16, false, true)).toBe(16);
    });

    it("should reset to 1 day when thumbnail changes", () => {
      expect(calculateNextInterval(4, true, false)).toBe(1);
      expect(calculateNextInterval(8, true, false)).toBe(1);
      expect(calculateNextInterval(16, true, false)).toBe(1);
    });

    it("should double interval when thumbnail unchanged", () => {
      expect(calculateNextInterval(1, false, false)).toBe(2);
      expect(calculateNextInterval(2, false, false)).toBe(4);
      expect(calculateNextInterval(4, false, false)).toBe(8);
      expect(calculateNextInterval(8, false, false)).toBe(16);
      expect(calculateNextInterval(16, false, false)).toBe(32);
    });

    it("should cap interval at 32 days maximum", () => {
      expect(calculateNextInterval(32, false, false)).toBe(32);
      expect(calculateNextInterval(64, false, false)).toBe(32); // Should never happen, but test boundary
    });

    it("should handle default interval of 1 day", () => {
      expect(calculateNextInterval(1, false, false)).toBe(2);
      expect(calculateNextInterval(1, true, false)).toBe(1);
      expect(calculateNextInterval(1, false, true)).toBe(1);
    });

    it("should follow correct progression: 1 -> 2 -> 4 -> 8 -> 16 -> 32", () => {
      const progression = [1, 2, 4, 8, 16, 32];

      for (let i = 0; i < progression.length - 1; i++) {
        const current = progression[i];
        const expected = progression[i + 1];
        const actual = calculateNextInterval(current, false, false);
        expect(actual).toBe(expected);
      }
    });

    it("should maintain 32 days at maximum", () => {
      // Once at 32 days, should stay there
      expect(calculateNextInterval(32, false, false)).toBe(32);
      expect(calculateNextInterval(32, false, false)).toBe(32);
      expect(calculateNextInterval(32, false, false)).toBe(32);
    });

    it("should reset progression when thumbnail changes", () => {
      // At any point in progression, should reset to 1 day
      expect(calculateNextInterval(16, true, false)).toBe(1);
      expect(calculateNextInterval(32, true, false)).toBe(1);
      expect(calculateNextInterval(8, true, false)).toBe(1);
      expect(calculateNextInterval(4, true, false)).toBe(1);
      expect(calculateNextInterval(2, true, false)).toBe(1);
    });

    it("should handle edge cases gracefully", () => {
      // Invalid intervals should still work
      expect(calculateNextInterval(0, false, false)).toBe(0);
      expect(calculateNextInterval(-1, false, false)).toBe(-2); // Mathematically correct

      // Error takes precedence over thumbnail change
      expect(calculateNextInterval(8, true, true)).toBe(8);
      expect(calculateNextInterval(32, true, true)).toBe(32);
    });
  });
});
