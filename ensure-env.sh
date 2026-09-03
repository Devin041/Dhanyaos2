#!/bin/bash
# ensure-env.sh — Ensures Supabase credentials are always present in .env
# This script runs BEFORE the dev server starts to prevent .env overwrite issues.
#
# ⚠️ SECURITY: Real credentials are NOT stored in this file.
# Copy .env.example to .env and fill in your own values.

cd "$(dirname "$0")"

ENV_FILE=".env"

# Required Supabase vars (placeholders — set real values in .env)
SUPABASE_URL="NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co"
SUPABASE_ANON="NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here"
SUPABASE_SERVICE="SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here"

# Required Cloudinary vars
CLOUDINARY_NAME="CLOUDINARY_CLOUD_NAME=your-cloud-name"
CLOUDINARY_API="CLOUDINARY_API_KEY=your-api-key"
CLOUDINARY_PUBLIC="NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name"

# Check if .env exists, create if not
if [ ! -f "$ENV_FILE" ]; then
  echo "Creating .env file..."
  touch "$ENV_FILE"
fi

# Function: ensure a line exists in .env
ensure_line() {
  local line="$1"
  local key=$(echo "$line" | cut -d'=' -f1)

  if grep -q "^${key}=" "$ENV_FILE"; then
    # Key exists — skip (never overwrite real values with placeholders)
    echo "Kept existing: $key"
  else
    # Key doesn't exist — append
    echo "$line" >> "$ENV_FILE"
    echo "Added: $key"
  fi
}

echo "Ensuring Supabase & Cloudinary credentials in .env..."

ensure_line "$SUPABASE_URL"
ensure_line "$SUPABASE_ANON"
ensure_line "$SUPABASE_SERVICE"
ensure_line "$CLOUDINARY_NAME"
ensure_line "$CLOUDINARY_API"
ensure_line "$CLOUDINARY_PUBLIC"

echo "✅ .env verified — all credentials present"
