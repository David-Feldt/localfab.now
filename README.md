# 3D Print Service

A Next.js application for submitting 3D print orders with real-time price estimation and model preview.

## Features

- Upload 3D models (STL, OBJ, 3MF)
- Real-time 3D model preview with Three.js
- Automatic price estimation based on print time and speed
- Local delivery distance calculation for Toronto area
- Email notifications for new orders

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env.local`:
```
RESEND_API_KEY=re_your_api_key_here
```

3. Run development server:
```bash
npm run dev
```

## Deployment to Vercel

1. Push your code to GitHub (or GitLab/Bitbucket)

2. Go to [Vercel](https://vercel.com) and sign in

3. Click "New Project" and import your repository

4. Add environment variable:
   - `RESEND_API_KEY` - Your Resend API key

5. Click "Deploy"

## Environment Variables

- `RESEND_API_KEY` - Required for sending order emails via Resend API

## Build Plate

- Dimensions: 400×400×400 mm
