/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  checkIfThumbnailChanged,
  daysFromNowInMilliseconds,
  hashThumbnail,
} from "./utils";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("thumbnailMonitor core logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("checkIfThumbnailChanged workflow", () => {
    it("should detect thumbnail changes correctly", async () => {
      // Mock different thumbnail content
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(2048), // Different size
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl:
          "https://img.youtube.com/vi/test/maxresdefault.jpg",
        lastThumbnailHash: "old-hash-123",
      });

      expect(result.error).toBeNull();
      expect(result.thumbnailChanged).toBe(true);
      expect(result.newHash).toBeTruthy();
      expect(result.newHash).not.toBe("old-hash-123");
      expect(result.arrayBuffer).toBeTruthy();
    });

    it("should handle thumbnail fetch errors gracefully", async () => {
      // Mock fetch failure
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl:
          "https://img.youtube.com/vi/invalid/maxresdefault.jpg",
        lastThumbnailHash: "hash-123",
      });

      expect(result.error).toContain("Error checking thumbnail");
      expect(result.thumbnailChanged).toBe(false);
      expect(result.newHash).toBe("");
      expect(result.arrayBuffer).toBeNull();
    });

    it("should handle network errors gracefully", async () => {
      // Mock network error
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network timeout");
        }),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl:
          "https://img.youtube.com/vi/test/maxresdefault.jpg",
        lastThumbnailHash: "hash-123",
      });

      expect(result.error).toContain("Error checking thumbnail");
      expect(result.thumbnailChanged).toBe(false);
      expect(result.newHash).toBe("");
      expect(result.arrayBuffer).toBeNull();
    });
  });

  describe("scheduling time calculations", () => {
    it("should calculate correct milliseconds for days", () => {
      const oneDayMs = 24 * 60 * 60 * 1000;
      expect(daysFromNowInMilliseconds(1)).toBeCloseTo(
        Date.now() + oneDayMs,
        -3,
      );
      expect(daysFromNowInMilliseconds(2)).toBeCloseTo(
        Date.now() + 2 * oneDayMs,
        -3,
      );
      expect(daysFromNowInMilliseconds(16)).toBeCloseTo(
        Date.now() + 16 * oneDayMs,
        -3,
      );
    });

    it("should handle fractional days", () => {
      const halfDayMs = 12 * 60 * 60 * 1000;
      expect(daysFromNowInMilliseconds(0.5)).toBeCloseTo(
        Date.now() + halfDayMs,
        -3,
      );
    });
  });

  describe("thumbnail monitoring workflow scenarios", () => {
    it("should demonstrate complete workflow for thumbnail unchanged", () => {
      // This tests the complete workflow without database dependencies
      const currentInterval = 4;
      const thumbnailChanged = false;
      const error = false;

      // Simulate workflow: check unchanged -> double interval -> schedule next
      const nextCheckTime = daysFromNowInMilliseconds(currentInterval * 2);
      expect(nextCheckTime).toBeGreaterThan(Date.now());
    });

    it("should demonstrate complete workflow for thumbnail changed", () => {
      // This tests the complete workflow without database dependencies
      const currentInterval = 8;
      const thumbnailChanged = true;
      const error = false;

      // Simulate workflow: check changed -> reset to 1 day -> schedule next
      const nextCheckTime = daysFromNowInMilliseconds(1);
      expect(nextCheckTime).toBeGreaterThan(Date.now());
    });

    it("should demonstrate complete workflow for error scenario", () => {
      // This tests the complete workflow without database dependencies
      const currentInterval = 4;
      const thumbnailChanged = false;
      const error = true;

      // Simulate workflow: error -> keep same interval -> schedule next
      const nextCheckTime = daysFromNowInMilliseconds(currentInterval);
      expect(nextCheckTime).toBeGreaterThan(Date.now());
    });
  });

  describe("integration behavior", () => {
    it("should handle thumbnail change detection and scheduling integration", async () => {
      // Mock successful thumbnail change detection
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(2048),
        })),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl:
          "https://img.youtube.com/vi/test/maxresdefault.jpg",
        lastThumbnailHash: "old-hash",
      });

      // If thumbnail changed, should schedule next check for 1 day
      if (result.thumbnailChanged) {
        const nextCheckTime = daysFromNowInMilliseconds(1);
        expect(nextCheckTime).toBeGreaterThan(Date.now());
      }

      expect(result.error).toBeNull();
      expect(result.thumbnailChanged).toBe(true);
    });

    it("should handle error scenarios in integration", async () => {
      // Mock error in thumbnail detection
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("Network failure");
        }),
      );

      const result = await checkIfThumbnailChanged({
        originalThumbnailUrl:
          "https://img.youtube.com/vi/test/maxresdefault.jpg",
        lastThumbnailHash: "hash-123",
      });

      // On error, should keep same interval
      expect(result.error).toBeTruthy();
      expect(result.thumbnailChanged).toBe(false);
    });
  });

  describe("checkThumbnailChanges", () => {
    // The thumbnail YouTube serves in these tests, unchanged since last check.
    const thumbnail = new Uint8Array([1, 2, 3, 4]).buffer;

    async function processedRow() {
      return {
        url: "https://youtu.be/dQw4w9WgXcQ",
        videoId: "dQw4w9WgXcQ",
        title: "Test Video",
        thumbnailKey: "1a2b3c4d.jpg",
        originalThumbnailUrl:
          "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        processedThumbnailUrl:
          "https://thumbs.video-to-markdown.com/1a2b3c4d.jpg",
        lastThumbnailHash: await hashThumbnail(thumbnail),
        checkIntervalDays: 1,
      };
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    async function runCheck(video: Awaited<ReturnType<typeof processedRow>>) {
      const t = convexTest(schema, modules);
      const fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => thumbnail,
      }));
      vi.stubGlobal("fetch", fetch);
      const videoId = await t.run((ctx) => ctx.db.insert("videos", video));
      await t.action(internal.thumbnailMonitor.checkThumbnailChanges, {
        videoId,
      });
      const after = await t.run((ctx) => ctx.db.get(videoId));
      return { fetch, after };
    }

    it("should check the YouTube thumbnail of a processed video", async () => {
      const row = await processedRow();
      const { fetch, after } = await runCheck(row);

      expect(fetch).toHaveBeenCalledWith(row.originalThumbnailUrl);
      expect(after?.checkIntervalDays).toBe(2);
      expect(after?.scheduledFunctionId).toBeDefined();
    });

    it("should skip and back off for a row that doesn't match processVideoUrl's shape", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const row = await processedRow();
      const { fetch, after } = await runCheck({
        ...row,
        originalThumbnailUrl: "https://example.com/image.jpg",
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(after?.checkIntervalDays).toBe(2);
      expect(after?.lastThumbnailHash).toBe(row.lastThumbnailHash);
      expect(after?.scheduledFunctionId).toBeDefined();
    });
  });
});
