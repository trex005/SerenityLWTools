const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
}

console.log(
  `${colors.bright}${colors.cyan}=== Building Serenity Last War Tools for Static Deployment ===${colors.reset}\n`,
)

try {
  // Step 1: Build the Next.js application
  console.log(`${colors.yellow}Step 1: Building Next.js application...${colors.reset}`)
  execSync("npm run build", { stdio: "inherit" })
  console.log(`${colors.green}✓ Build completed successfully${colors.reset}\n`)

  // Step 2: Check if the out directory exists
  console.log(`${colors.yellow}Step 2: Verifying output directory...${colors.reset}`)
  const outDir = path.join(__dirname, "out")
  if (fs.existsSync(outDir)) {
    console.log(`${colors.green}✓ Output directory created at: ${outDir}${colors.reset}\n`)
  } else {
    throw new Error("Output directory was not created. Build may have failed.")
  }

  // Step 3: Create a simple deployment guide
  console.log(`${colors.yellow}Step 3: Creating deployment guide...${colors.reset}`)
  const deploymentGuide = `
# Serenity Last War Tools - Deployment Guide

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
`

  fs.writeFileSync(path.join(__dirname, "DEPLOYMENT.md"), deploymentGuide)
  console.log(`${colors.green}✓ Deployment guide created: DEPLOYMENT.md${colors.reset}\n`)

  // Final message
  console.log(`${colors.bright}${colors.magenta}=== Build Complete ===${colors.reset}`)
  console.log(`${colors.cyan}Your static application is ready in the 'out' directory.${colors.reset}`)
  console.log(`${colors.cyan}See DEPLOYMENT.md for deployment instructions.${colors.reset}\n`)

  // Quick test instructions
  console.log(`${colors.bright}To test locally:${colors.reset}`)
  console.log(`npx serve out\n`)
} catch (error) {
  console.error(`${colors.bright}\x1b[31mBuild failed:${colors.reset}`, error.message)
  process.exit(1)
}
