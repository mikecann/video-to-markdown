import { useState, FormEvent } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function VideoForm() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Type-safe access to the API - will work once convex generates types
  const processVideo = useAction(api.imageProcessing.processVideoUrl);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!url.trim()) return;

    setIsLoading(true);
    setError("");

    processVideo({ url: url.trim() })
      .then(() => setUrl(""))
      .catch((err) => {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to process video";
        setError(errorMessage);
      })
      .finally(() => setIsLoading(false));
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="url"
            className="block text-sm font-medium text-white mb-2"
          >
            YouTube URL
          </label>
          <input
            type="url"
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/G0kHv7qqqO1"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-colors"
            disabled={isLoading}
            required
          />
        </div>

        {error && (
          <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </>
          ) : (
            "Generate Markdown"
          )}
        </button>
      </form>
    </div>
  );
}
