# Video to Markdown Generator

A simple web application that converts YouTube videos into markdown-friendly format with thumbnails and play buttons.

So that it looks somthing like this:

[![What is Convex & Why Should Developers Care?](https://video-to-markdown.7f9207df9026a35463a24d26a1d1e47b.r2.cloudflarestorage.com/thumbnails/BPPThblvitQ-814ce2bb-a5ac-4267-a9c9-4207544bd2fb.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=e75d836f66345c5ec31f9af290a538f0%2F20250623%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20250623T061035Z&X-Amz-Expires=900&X-Amz-Signature=7c4caf5ff58f8451fe2b441d3ceca062089fcab781e3e890f3a1660371d61f8c&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)](https://youtu.be/BPPThblvitQ)

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
