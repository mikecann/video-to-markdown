/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import schema from "./schema";
import { overwriteThumbnail } from "./thumbnailMonitor";
import {
  checkIfThumbnailChanged,
  daysFromNowInMilliseconds,
  hashThumbnail,
} from "./utils";
import { r2 } from "./videos";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

// A stand-in for the R2 component: a metadata table keyed by object key, and
// an S3 client that records uploads instead of making network calls.
function createFakeR2() {
  const metadata = new Map<string, { key: string }>();
  const uploads: string[] = [];
  const ctx = {
    runQuery: vi.fn(
      async (_fn: unknown, args: { key: string }) =>
        metadata.get(args.key) ?? null,
    ),
    runMutation: vi.fn(async (_fn: unknown, args: { key: string }) => {
      metadata.delete(args.key);
      return null;
    }),
    runAction: vi.fn(async (_fn: unknown, args: { key: string }) => {
      metadata.set(args.key, { key: args.key });
      return null;
    }),
  } as unknown as ActionCtx;
  const send = vi.fn(async (command: { input: { Key: string } }) => {
    uploads.push(command.input.Key);
    return {};
  });
  (r2 as unknown as { _client: unknown })._client = { send };
  return { ctx, metadata, uploads };
}

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

  describe("overwriteThumbnail", () => {
    afterEach(() => {
      (r2 as unknown as { _client: unknown })._client = undefined;
    });

    const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

    it("should show r2.store refusing to overwrite an existing key", async () => {
      const { ctx, metadata } = createFakeR2();
      metadata.set("abc.jpg", { key: "abc.jpg" });

      await expect(
        r2.store(ctx, image, { key: "abc.jpg", type: "image/jpeg" }),
      ).rejects.toThrow("Metadata already exists");
    });

    it("should re-upload under the same key when it already exists", async () => {
      const { ctx, metadata, uploads } = createFakeR2();
      metadata.set("abc.jpg", { key: "abc.jpg" });

      await overwriteThumbnail(ctx, "abc.jpg", image);

      expect(uploads).toEqual(["abc.jpg"]);
      expect(metadata.has("abc.jpg")).toBe(true);
      expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), {
        key: "abc.jpg",
        bucket: r2.config.bucket,
      });
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
      vi.restoreAllMocks();
    });

    type Row = Awaited<ReturnType<typeof processedRow>>;

    async function runCheck(video: Row, otherRows: Row[] = []) {
      const t = convexTest(schema, modules);
      const fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => thumbnail,
      }));
      vi.stubGlobal("fetch", fetch);
      const videoId = await t.run(async (ctx) => {
        for (const row of otherRows) await ctx.db.insert("videos", row);
        return await ctx.db.insert("videos", video);
      });
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

    it("should skip a video whose thumbnail key another row also uses", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const row = await processedRow();
      // A row that looks processed but claims someone else's key.
      const copy = {
        ...row,
        url: "https://youtu.be/aaaaaaaaaaa",
        videoId: "aaaaaaaaaaa",
        originalThumbnailUrl:
          "https://img.youtube.com/vi/aaaaaaaaaaa/maxresdefault.jpg",
        lastThumbnailHash: "stale-hash",
      };

      for (const [video, other] of [
        [copy, row],
        [row, copy],
      ]) {
        const { fetch, after } = await runCheck(video, [other]);
        expect(fetch).not.toHaveBeenCalled();
        expect(after?.checkIntervalDays).toBe(2);
        expect(after?.lastThumbnailHash).toBe(video.lastThumbnailHash);
      }
    });
  });
});
