import { useState } from "react";
import { Video } from "../types/Video";

interface VideoCardProps {
  video: Video;
}

export default function VideoCard({ video }: VideoCardProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard
      .writeText(video.markdownCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  };

  return (
    <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 overflow-hidden">
      <div className="aspect-video bg-gray-100 relative group">
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
            <svg
              className="w-6 h-6 text-white ml-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-medium text-white mb-2 line-clamp-2">
          {video.title}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              Markdown Code
            </label>
            <div className="relative">
              <pre className="bg-gray-900 p-3 rounded text-xs font-mono text-gray-300 overflow-x-auto border border-gray-600">
                <code>{video.markdownCode}</code>
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 p-1.5 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? (
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
                ) : (
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
                )}
              </button>
            </div>
          </div>

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
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-full rounded"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
