#!/bin/bash
# ensure-env.sh — Ensures Supabase credentials are always present in .env
# This script runs BEFORE the dev server starts to prevent .env overwrite issues.

cd /home/z/my-project

ENV_FILE=".env"

# Required Supabase vars
SUPABASE_URL="NEXT_PUBLIC_SUPABASE_URL=https://uvlamiwykxekblposogn.supabase.co"
SUPABASE_ANON="NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bGFtaXd5a3hla2JscG9zb2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMjc5NDEsImV4cCI6MjEwMDgwMzk0MX0.TC44jpWGHMyZ5pmiO5qr6iCNO4mij0md9qcrjPI7rIY"
SUPABASE_SERVICE="SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bGFtaXd5a3hla2JscG9zb2duIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTIyNzk0MSwiZXhwIjoyMTAwODAzOTQxfQ.DufcoCMfO-XmhU6NUsUOa-J9D_iL2nSkoZUWyHrQGaE"

# Required Cloudinary vars
CLOUDINARY_NAME="CLOUDINARY_CLOUD_NAME=dt3sqo86m"
CLOUDINARY_API="CLOUDINARY_API_KEY=UoJ3ACFWxlg2wicw_X9p8-e3Lpg"
CLOUDINARY_PUBLIC="NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dt3sqo86m"

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
    # Key exists — check if value is empty or different
    local current=$(grep "^${key}=" "$ENV_FILE" | head -1)
    if [ "$current" != "$line" ]; then
      # Update the line
      sed -i "s|^${key}=.*|$line|" "$ENV_FILE"
      echo "Updated: $key"
    fi
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

# Ensure DATABASE_URL exists
if ! grep -q "^DATABASE_URL=" "$ENV_FILE"; then
  echo "DATABASE_URL=file:/home/z/my-project/db/custom.db" >> "$ENV_FILE"
  echo "Added: DATABASE_URL"
fi

echo "✅ .env verified — all credentials present"
