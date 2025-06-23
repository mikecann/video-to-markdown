# Video to Markdown Generator

A simple web application that converts YouTube videos into markdown-friendly format with thumbnails and play buttons.

## What it does

This tool allows you to:
1. **Input a YouTube URL** - Simply paste any YouTube video URL
2. **Generate a thumbnail with play button** - Automatically fetches the video thumbnail and overlays a play button icon
3. **Get markdown code** - Provides ready-to-use markdown code that displays the thumbnail image and links to the video

Perfect for documentation, README files, blog posts, or anywhere you want to embed YouTube videos in markdown format while showing an attractive thumbnail preview.

## Features

- ✅ **No API keys required** - Uses YouTube's oEmbed endpoint to fetch video metadata
- ✅ **Automatic title detection** - Extracts video title directly from the URL
- ✅ **Responsive design** - Built with Mantine UI components
- ✅ **Copy-paste ready** - Generated markdown is ready to use anywhere
- ✅ **Real-time preview** - See exactly how your markdown will look

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Convex (database, server logic)
- **Storage**: Cloudflare R2 (thumbnail storage)
- **Deployment**: Ready for production deployment

## Get Started

```bash
npm install
npm run dev
```

Then start the Convex development server in a separate terminal:
```bash
npx convex dev
```

## Example Usage

Input: `https://youtu.be/G0kHv7qqqO1`

Output:
```markdown
[![The Ultimate Convex Beginner Tutorial](https://img.youtube.com/vi/G0kHv7qqqO1/maxresdefault.jpg)](https://youtu.be/G0kHv7qqqO1)
```

Result: A clickable thumbnail that opens the YouTube video when clicked.

## Learn More

Built with [Convex](https://convex.dev/) - the full-stack TypeScript platform that makes building apps delightfully simple.
