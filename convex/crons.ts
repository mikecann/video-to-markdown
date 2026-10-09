import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "repair stale thumbnail schedules",
  { hourUTC: 3, minuteUTC: 0 },
  internal.thumbnailMonitor.repairStaleSchedules,
);

crons.daily(
  "recount videos",
  { hourUTC: 3, minuteUTC: 30 },
  internal.videos.recountVideos,
);

export default crons;
