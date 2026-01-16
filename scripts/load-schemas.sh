#!/bin/bash
# Load JSON schemas and set template file paths in the database
#
# This script:
# 1. Loads JSON schemas from forms-service/app/data/schemas/ into templates table
# 2. Sets original_file_path to point to DOCX files in storage/templates/
#
# Usage:
#   ./scripts/load-schemas.sh
#
# Requirements:
#   - psql client installed locally, OR
#   - Run via docker: docker exec -it radiology-db psql ...
#
# IMPORTANT: Run this script after initial database seeding to populate
# template schemas and file paths required for PDF/DOCX generation.

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

# Template file paths (must match actual files in storage/templates/)
TEMPLATE_PATH_PREFIX="/app/storage/templates"
TEMPLATE_1_FILE="irb-application-standard 1_21_2019 (1).docx"
TEMPLATE_2_FILE="irb-application-minimal-risk 11.1.2024 (1).docx"
TEMPLATE_3_FILE="IRB application for anonymous survey 9.9.25_0.docx"
TEMPLATE_4_FILE="irb-application-archival-retrospective 6_6_25.docx"

export PGPASSWORD="$DB_PASSWORD"

echo "=============================================="
echo "Loading JSON schemas and template file paths"
echo "=============================================="
echo ""

# Template 1: IRB Application - Standard
echo "Loading Template 1 (Standard)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_standard_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb, original_file_path = '$TEMPLATE_PATH_PREFIX/$TEMPLATE_1_FILE', original_file_name = '$TEMPLATE_1_FILE' WHERE id = 1;"

# Template 2: IRB Application for Minimal Risk Studies
echo "Loading Template 2 (Minimal Risk)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_minimal_risk_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb, original_file_path = '$TEMPLATE_PATH_PREFIX/$TEMPLATE_2_FILE', original_file_name = '$TEMPLATE_2_FILE' WHERE id = 2;"

# Template 3: IRB Application for Anonymous Survey
echo "Loading Template 3 (Anonymous Survey)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_anonymous_survey_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb, original_file_path = '$TEMPLATE_PATH_PREFIX/$TEMPLATE_3_FILE', original_file_name = '$TEMPLATE_3_FILE' WHERE id = 3;"

# Template 4: IRB Application for Archival/Retrospective Research
echo "Loading Template 4 (Archival/Retrospective)..."
SCHEMA=$(cat "$SCHEMAS_DIR/irb_archival_retrospective_schema.json" | sed "s/'/''/g")
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "UPDATE templates SET schema = '$SCHEMA'::jsonb, original_file_path = '$TEMPLATE_PATH_PREFIX/$TEMPLATE_4_FILE', original_file_name = '$TEMPLATE_4_FILE' WHERE id = 4;"

echo ""
echo "=============================================="
echo "Loading complete! Verification:"
echo "=============================================="
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, name, jsonb_array_length(schema->'sections') as sections, jsonb_array_length(schema->'fields') as fields, original_file_path IS NOT NULL as has_file_path FROM templates ORDER BY id;"
