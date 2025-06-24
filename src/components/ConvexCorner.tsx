import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

const ConvexCorner = () => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href="https://convex.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed top-0 left-0 z-50 group"
          style={{ clipPath: "polygon(0 0, 0 100%, 100% 0)" }}
          aria-label="Made with Convex"
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 250 250"
            className="fill-gray-600 hover:fill-gray-500 transition-colors"
          >
            {/* Clean triangle background for top-left corner */}
            <path d="M0,0 L0,250 L250,0 Z" />
          </svg>
          {/* Convex logo positioned over the triangle */}
          <img
            src="/convex.svg"
            alt="Convex"
            className="absolute top-2 left-2 w-8 h-8 group-hover:scale-110 transition-transform duration-200"
          />
        </a>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        sideOffset={-10}
        alignOffset={10}
        className="bg-gray-800 text-white border-gray-600 text-xs px-2 py-1 shadow-lg"
      >
        <p className="font-medium">Made with Convex</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default ConvexCorner;
