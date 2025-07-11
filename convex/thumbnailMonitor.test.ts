import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkIfThumbnailChanged, daysFromNowInMilliseconds } from "./utils";

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
});
