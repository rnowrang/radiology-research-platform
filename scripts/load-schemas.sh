#!/bin/bash
# Load JSON schemas into template records in the database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCHEMAS_DIR="$PROJECT_DIR/forms-service/app/data/schemas"

# Database connection - use environment variables or defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="${DB_USER:-radiology}"
DB_NAME="${DB_NAME:-radiology_research}"
DB_PASSWORD="${DB_PASSWORD:-radiology_secret}"

export PGPASSWORD="$DB_PASSWORD"

echo "Loading JSON schemas into templates..."

# Template 1: IRB Application - Standard
echo "Loading schema for Template 1 (Standard)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_standard_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb WHERE id = 1;"

# Template 2: IRB Application for Minimal Risk Studies
echo "Loading schema for Template 2 (Minimal Risk)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_minimal_risk_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb WHERE id = 2;"

# Template 3: IRB Application for Anonymous Survey
echo "Loading schema for Template 3 (Anonymous Survey)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_anonymous_survey_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb WHERE id = 3;"

# Template 4: IRB Application for Archival/Retrospective Research
echo "Loading schema for Template 4 (Archival/Retrospective)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_archival_retrospective_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb WHERE id = 4;"

echo "Schema loading complete!"

# Verify
echo ""
echo "Verification:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, name, jsonb_array_length(schema->'sections') as sections FROM templates ORDER BY id;"
