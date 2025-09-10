#!/bin/bash

# Build the site
npm run build:static

# Sync the built files to S3
aws s3 sync out/ s3://lwserenity.com/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
