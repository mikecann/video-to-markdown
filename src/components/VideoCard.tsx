import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { Doc } from "../../convex/_generated/dataModel";

// Helper function to calculate next check time
function getNextCheckTime(video: Doc<"videos">): string {
  // Prefer the actual scheduled time if present
  if (video.nextCheckAt) {
    const now = Date.now();
    if (video.nextCheckAt <= now) return "Due now";
    const diffMs = video.nextCheckAt - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return "<1h";
  }

  if (!video.lastCheckedAt || !video.checkIntervalDays) {
    return "Unknown";
  }

  const nextCheckTime =
    video.lastCheckedAt + video.checkIntervalDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (nextCheckTime < now) {
    return "Due now";
  }

  const diffMs = nextCheckTime - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays}d`;
  } else if (diffHours > 0) {
    return `${diffHours}h`;
  } else {
    return "<1h";
  }
}

interface VideoCardProps {
  video: Doc<"videos">;
}

export default function VideoCard({ video }: VideoCardProps) {
  const [copied, setCopied] = useState(false);

  // Dynamically generate markdown code using the processed thumbnail URL
  const markdownCode = `[![${video.title}](${video.processedThumbnailUrl})](${video.url})`;

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(markdownCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error("Failed to copy:", err));
  };

  const CopyIcon = () => (
    <svg
      className="w-4 h-4 text-gray-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );

  const CheckIcon = () => (
    <svg
      className="w-4 h-4 text-green-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );

  const nextCheckTime = getNextCheckTime(video);
  const isDueSoon = nextCheckTime === "Due now" || nextCheckTime === "<1h";

  return (
    <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-hidden relative">
      {/* Next check indicator - floating overlay */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`absolute top-2 right-3 z-20 px-2 py-1 rounded-sm text-xs font-medium cursor-pointer shadow-lg ${
                isDueSoon ? "text-orange-300" : "text-blue-300"
              }`}
            >
              🔄 {nextCheckTime}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Checks for thumbnail changes automatically.
              <br />
              Interval increases (1d→2d→4d→8d→16d→32d) when unchanged.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Preview
            </label>
            <div className="border border-gray-600 rounded p-3 bg-gray-900">
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:opacity-80 transition-opacity"
              >
                <img
                  src={video.processedThumbnailUrl}
                  alt={video.title}
                  className="w-full rounded"
                />
              </a>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Markdown Code
            </label>
            <div className="relative">
              <pre className="bg-gray-900 p-3 rounded text-xs font-mono text-gray-300 overflow-x-auto border border-gray-600">
                <code>{markdownCode}</code>
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
