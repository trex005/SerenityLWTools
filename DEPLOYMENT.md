
# Daily Agenda Creator - Deployment Guide

This application has been built for static hosting. Follow these steps to deploy:

## Option 1: Deploy to any static web server

1. Upload all files from the 'out' directory to your web server's root directory
2. Ensure your server is configured to serve index.html for directory requests
3. No server-side processing is required - all data is stored in the browser

## Option 2: Deploy to Vercel, Netlify, or similar platforms

1. Connect your repository to the platform
2. Set the build command to: npm run build
3. Set the output directory to: out

## Option 3: Test locally

1. Serve the static files using any HTTP server, for example:
  - Using Node.js: npx serve out
  - Using Python: python -m http.server --directory out

## Notes

- All data is stored in the browser's localStorage
- No backend or database is required
- The application is fully functional offline after initial load
