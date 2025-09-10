# Daily Agenda Creator

A static web application for creating and managing daily agendas. This application works entirely client-side and stores all data in the browser's localStorage.

## Features

- Create and manage events for each day of the week
- Organize events with drag-and-drop functionality
- Archive completed events
- Generate formatted briefings with your agenda
- Manage a collection of tips to include in your briefings
- Import and export your agenda data
- Dark mode support

## Getting Started

### Development

1. Clone this repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

### Building for Static Deployment

1. Build the static version:
   \`\`\`bash
   npm run build:static
   \`\`\`
2. The static files will be generated in the `out` directory
3. Deploy these files to any static web hosting service

### Testing Locally

After building, you can test the static version locally:

\`\`\`bash
npx serve out
\`\`\`

## Deployment Options

### Option 1: Any Static Web Server

1. Upload all files from the 'out' directory to your web server's root directory
2. Ensure your server is configured to serve index.html for directory requests

### Option 2: Vercel, Netlify, or Similar Platforms

1. Connect your repository to the platform
2. Set the build command to: `npm run build`
3. Set the output directory to: `out`

## Notes

- All data is stored in the browser's localStorage
- No backend or database is required
- The application is fully functional offline after initial load
