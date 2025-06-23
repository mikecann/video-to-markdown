export interface Video {
  _id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  createdAt: number;
  // Thumbnail monitoring fields
  checkIntervalDays?: number;
  lastCheckedAt?: number;
  scheduledFunctionId?: string;
}
