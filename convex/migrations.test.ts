/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("removeDuplicateVideos", () => {
  // Inserts one row per entry, oldest first: three for "aaa", one for "bbb",
  // two for "ccc", each with its own thumbnail and a pending thumbnail check.
  async function seed(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const ids: Record<string, Id<"videos">[]> = {};
      for (const [i, videoId] of [
        "aaa",
        "bbb",
        "aaa",
        "ccc",
        "aaa",
        "ccc",
      ].entries()) {
        const id = await ctx.db.insert("videos", {
          url: `https://youtu.be/${videoId}`,
          videoId,
          title: `Video ${videoId}`,
          thumbnailKey: `key${i}.jpg`,
          originalThumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          processedThumbnailUrl: `https://thumbs.video-to-markdown.com/key${i}.jpg`,
        });
        const scheduledFunctionId = await ctx.scheduler.runAfter(
          24 * 60 * 60 * 1000,
          internal.thumbnailMonitor.checkThumbnailChanges,
          { videoId: id },
        );
        await ctx.db.patch(id, { scheduledFunctionId });
        (ids[videoId] ??= []).push(id);
      }
      return ids;
    });
  }

  it("should only report what it would delete by default", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const report = await t.mutation(
      internal.migrations.removeDuplicateVideos,
      {},
    );

    expect(report).toEqual({
      dryRun: true,
      groups: [
        { videoId: "aaa", kept: ids.aaa[0], deleted: [ids.aaa[1], ids.aaa[2]] },
        { videoId: "ccc", kept: ids.ccc[0], deleted: [ids.ccc[1]] },
      ],
      deletedCount: 3,
    });
    const videos = await t.run((ctx) => ctx.db.query("videos").collect());
    expect(videos).toHaveLength(6);
  });

  it("should keep the oldest row per videoId and delete the rest", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    const report = await t.mutation(internal.migrations.removeDuplicateVideos, {
      dryRun: false,
    });
    expect(report.deletedCount).toBe(3);

    const remaining = await t.run((ctx) => ctx.db.query("videos").collect());
    expect(remaining.map((v) => v._id)).toEqual([
      ids.aaa[0],
      ids.bbb[0],
      ids.ccc[0],
    ]);

    // The deleted rows' thumbnail checks are cancelled; the kept rows' aren't.
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const states = new Map(
      scheduled.map((s) => [
        (s.args[0] as { videoId: string }).videoId,
        s.state.kind,
      ]),
    );
    for (const id of [ids.aaa[1], ids.aaa[2], ids.ccc[1]])
      expect(states.get(id)).toBe("canceled");
    for (const id of [ids.aaa[0], ids.bbb[0], ids.ccc[0]])
      expect(states.get(id)).toBe("pending");

    // Running it again finds nothing left to do.
    const again = await t.mutation(internal.migrations.removeDuplicateVideos, {
      dryRun: false,
    });
    expect(again).toEqual({ dryRun: false, groups: [], deletedCount: 0 });
  });
});
