import Header from "./components/Header";
import VideoForm from "./components/VideoForm";
import VideosList from "./components/VideosList";
import { BeamsBackground } from "@/components/ui/beams-background";

const HeroSection = () => (
  <div className="text-center">
    <h2 className="text-3xl font-bold text-white mb-4">
      Convert YouTube Videos to Markdown
    </h2>
    <p className="text-lg text-gray-300 max-w-2xl mx-auto">
      Simply paste a YouTube URL and get beautiful markdown code with
      thumbnails, perfect for documentation, READMEs, and blog posts.
    </p>
  </div>
);

const VideosSection = () => (
  <div>
    <h3 className="text-xl font-semibold text-white mb-6">Generated Videos</h3>
    <VideosList />
  </div>
);

export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 relative">
      <BeamsBackground />

      <div className="relative z-10">
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-8">
            <HeroSection />
            <VideoForm />
            <VideosSection />
          </div>
        </main>
      </div>
    </div>
  );
}
