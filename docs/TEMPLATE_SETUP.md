# Template Setup Guide

This document explains how to set up and manage IRB form templates in the Radiology Research Platform.

## Overview

The platform uses a three-component architecture for form templates that work together to enable dynamic form rendering and document generation:

1. **Database Records** (`templates` table) - Contains metadata, JSON schema, and file paths. This is the primary source of truth that the application queries.

2. **JSON Schema Files** (`forms-service/app/data/schemas/`) - Define the form structure including sections, fields, validation rules, and conditional logic. These files are loaded into the database.

3. **DOCX Template Files** (`storage/templates/`) - Microsoft Word documents used as templates for PDF/DOCX generation. Form data is merged into these templates to produce completed documents.

All three components must be properly configured and synchronized for templates to work correctly.

---

## Template Structure

### Database Table (templates)

The `templates` table stores all template configuration and metadata:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Auto-incrementing unique identifier |
| `name` | VARCHAR | Display name shown to users |
| `description` | TEXT | Detailed description of the template purpose |
| `version` | VARCHAR | Template version string (e.g., "1.0", "2024.1") |
| `original_file_path` | VARCHAR | **Full path to DOCX file inside container** (required for document generation) |
| `original_file_name` | VARCHAR | Original filename of the DOCX template |
| `schema` | JSONB | Complete form field definitions (sections, fields, rules) |
| `is_active` | BOOLEAN | Whether template is available for use (soft delete flag) |
| `is_published` | BOOLEAN | Whether template is visible to end users |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Last modification timestamp |

#### Critical Column: original_file_path

The `original_file_path` column **must contain the full path** to the DOCX template file as it appears inside the Docker container. Without this path correctly set, PDF and DOCX document generation will fail.

**Example path:** `/app/storage/templates/irb-application-standard 1_21_2019 (1).docx`

---

### JSON Schema Files

**Location:** `forms-service/app/data/schemas/`

These JSON files define the complete form structure including sections, fields, validation, and conditional logic.

| File | Template Type |
|------|---------------|
| `irb_standard_schema.json` | Standard IRB Application |
| `irb_minimal_risk_schema.json` | Minimal Risk Studies |
| `irb_anonymous_survey_schema.json` | Anonymous Survey Research |
| `irb_archival_retrospective_schema.json` | Archival/Retrospective Research |

#### Schema File Structure

```json
{
    "sections": [
        {
            "id": "sec_investigator",
            "title": "I. Investigator Information",
            "order": 0,
            "collapsible": true,
            "description": "Optional section description"
        }
    ],
    "fields": [
        {
            "id": "investigator.pi_name",
            "type": "text",
            "label": "Principal Investigator Name",
            "section_id": "sec_investigator",
            "order": 0,
            "required": true,
            "placeholder": "Enter full name",
            "helpText": "The PI must be a faculty member",
            "anchor": {
                "type": "table_cell",
                "table_index": 1,
                "row_index": 1,
                "column_index": 0
            }
        }
    ],
    "rules": [
        {
            "id": "show_other_field",
            "conditions": [{"field": "some_field", "operator": "equals", "value": "other"}],
            "then_actions": [{"action": "show", "field": "other_description"}],
            "else_actions": [{"action": "hide", "field": "other_description"}]
        }
    ]
}
```

#### Field Types Supported

- `text` - Single-line text input
- `textarea` - Multi-line text input
- `number` - Numeric input
- `date` - Date picker
- `select` - Dropdown selection
- `radio` - Radio button group
- `checkbox` - Single checkbox (boolean)
- `checkbox_group` - Multiple checkbox options
- `file` - File upload

#### Anchor Configuration

The `anchor` property maps form fields to locations in the DOCX template for document generation:

```json
"anchor": {
    "type": "table_cell",
    "table_index": 1,
    "row_index": 1,
    "column_index": 0
}
```

---

### DOCX Template Files

**Location:** `storage/templates/`

These are Microsoft Word documents that serve as the base templates for generating completed forms.

| File | Template Type |
|------|---------------|
| `irb-application-standard 1_21_2019 (1).docx` | Standard IRB Application |
| `irb-application-minimal-risk 11.1.2024 (1).docx` | Minimal Risk Studies |
| `IRB application for anonymous survey 9.9.25_0.docx` | Anonymous Survey Research |
| `irb-application-archival-retrospective 6_6_25.docx` | Archival/Retrospective Research |

**Important Notes:**
- File names include version dates for tracking
- Files must be accessible inside the Docker container at `/app/storage/templates/`
- The storage volume must be properly mounted in docker-compose

---

## Directory Structure

```
radiology-research-platform/
├── database/
│   └── seeds.sql                    # Creates initial template records
├── forms-service/
│   └── app/
│       └── data/
│           └── schemas/             # JSON schema files
│               ├── irb_standard_schema.json
│               ├── irb_minimal_risk_schema.json
│               ├── irb_anonymous_survey_schema.json
│               └── irb_archival_retrospective_schema.json
├── storage/
│   └── templates/                   # DOCX template files
│       ├── irb-application-standard 1_21_2019 (1).docx
│       ├── irb-application-minimal-risk 11.1.2024 (1).docx
│       ├── IRB application for anonymous survey 9.9.25_0.docx
│       └── irb-application-archival-retrospective 6_6_25.docx
└── scripts/
    └── load-schemas.sh              # Loads schemas into database
```

---

## Setup Instructions

### Step 1: Ensure DOCX Files Exist

Verify that all required DOCX template files are present in the storage directory:

```bash
ls -la storage/templates/
```

Expected output should show all four template files:
```
-rw-r--r--  1 user  staff   45K Jan 21 2019 irb-application-standard 1_21_2019 (1).docx
-rw-r--r--  1 user  staff   38K Nov  1 2024 irb-application-minimal-risk 11.1.2024 (1).docx
-rw-r--r--  1 user  staff   32K Sep  9 2025 IRB application for anonymous survey 9.9.25_0.docx
-rw-r--r--  1 user  staff   35K Jun  6 2025 irb-application-archival-retrospective 6_6_25.docx
```

If files are missing, obtain them from the IRB office or backup location.

### Step 2: Load Schemas into Database

Run the schema loader script to populate the database with JSON schemas and file paths:

```bash
./scripts/load-schemas.sh
```

**Alternative: Manual Loading via Docker**

If running in Docker without local psql access:

```bash
docker exec radiology-forms python3 -c '
import json, os, psycopg2, urllib.parse

schemas = {
    1: ("irb_standard_schema.json", "irb-application-standard 1_21_2019 (1).docx"),
    2: ("irb_minimal_risk_schema.json", "irb-application-minimal-risk 11.1.2024 (1).docx"),
    3: ("irb_anonymous_survey_schema.json", "IRB application for anonymous survey 9.9.25_0.docx"),
    4: ("irb_archival_retrospective_schema.json", "irb-application-archival-retrospective 6_6_25.docx"),
}

db_url = os.environ.get("DATABASE_URL")
result = urllib.parse.urlparse(db_url)
conn = psycopg2.connect(host=result.hostname, port=result.port or 5432,
                        database=result.path[1:], user=result.username, password=result.password)
cur = conn.cursor()

for template_id, (schema_file, docx_file) in schemas.items():
    with open(f"/app/app/data/schemas/{schema_file}", "r") as f:
        schema = json.load(f)
    file_path = f"/app/storage/templates/{docx_file}"
    cur.execute(
        "UPDATE templates SET schema = %s, original_file_path = %s, original_file_name = %s WHERE id = %s",
        (json.dumps(schema), file_path, docx_file, template_id)
    )
    print(f"Updated template {template_id}")

conn.commit()
conn.close()
print("Done!")
'
```

### Step 3: Verify Loading

Confirm templates are properly configured in the database:

```bash
docker exec radiology-db psql -U radiology -d radiology_research \
  -c "SELECT id, name, original_file_path IS NOT NULL as has_file FROM templates;"
```

Expected output:
```
 id |                        name                         | has_file
----+-----------------------------------------------------+----------
  1 | IRB Application - Standard                          | t
  2 | IRB Application for Minimal Risk Studies            | t
  3 | IRB Application for Anonymous Survey                | t
  4 | IRB Application for Archival/Retrospective Research | t
```

**Detailed Verification:**

```bash
docker exec radiology-db psql -U radiology -d radiology_research -c "
SELECT
    id,
    name,
    jsonb_array_length(schema->'sections') as sections,
    jsonb_array_length(schema->'fields') as fields,
    original_file_path IS NOT NULL as has_file_path
FROM templates ORDER BY id;"
```

Expected output:
```
 id |                        name                         | sections | fields | has_file_path
----+-----------------------------------------------------+----------+--------+---------------
  1 | IRB Application - Standard                          |       10 |     97 | t
  2 | IRB Application for Minimal Risk Studies            |        9 |     62 | t
  3 | IRB Application for Anonymous Survey                |        9 |     58 | t
  4 | IRB Application for Archival/Retrospective Research |        8 |     47 | t
```

---

## Adding New Templates

Follow these steps to add a new template to the system:

### 1. Create DOCX Template File

- Create or obtain the Word document template
- Place the file in `storage/templates/`
- Use consistent naming convention: `template-name date.docx`
- Ensure the document has properly formatted tables for field anchors

### 2. Create JSON Schema File

Create a new schema file in `forms-service/app/data/schemas/`:

```bash
touch forms-service/app/data/schemas/new_template_schema.json
```

Define the schema structure following the format above. Key elements:
- Define all sections with unique IDs and display order
- Define all fields with appropriate types and validation
- Map fields to DOCX locations using anchors
- Add conditional rules as needed

### 3. Update load-schemas.sh Script

Edit `scripts/load-schemas.sh` to include the new template:

```bash
# Add to the schemas mapping
schemas = {
    # ... existing templates ...
    5: ("new_template_schema.json", "new-template-file.docx"),
}
```

### 4. Add Database Record (if not exists)

If the template record doesn't exist in the database, create it:

```sql
INSERT INTO templates (name, description, version, original_file_name, original_file_path, schema, is_active, is_published)
VALUES (
    'New Template Name',
    'Detailed description of what this template is for',
    '1.0',
    'new-template-file.docx',
    '/app/storage/templates/new-template-file.docx',
    '{"sections": [], "fields": [], "rules": []}'::jsonb,
    true,
    true
);
```

### 5. Run Schema Loader

Execute the script to load the schema into the database:

```bash
./scripts/load-schemas.sh
```

### 6. Verify the New Template

```bash
docker exec radiology-db psql -U radiology -d radiology_research \
  -c "SELECT id, name, is_published FROM templates WHERE name LIKE '%New Template%';"
```

---

## Troubleshooting

### "Template not found" Error

**Symptom:** API returns 404 when trying to access a template

**Cause:** Schema not loaded into database, or template record doesn't exist

**Solution:**
1. Verify the template exists in the database:
   ```bash
   docker exec radiology-db psql -U radiology -d radiology_research \
     -c "SELECT id, name FROM templates;"
   ```
2. If missing, run `./scripts/load-schemas.sh`
3. If record exists but schema is empty, check JSON file path and re-run loader

### "PDF generation failed" Error

**Symptom:** Document download fails with error

**Cause:** DOCX file missing or `original_file_path` is NULL/incorrect

**Solution:**
1. Check if the file path is set:
   ```bash
   docker exec radiology-db psql -U radiology -d radiology_research \
     -c "SELECT id, name, original_file_path FROM templates WHERE id = X;"
   ```
2. Verify the file exists in the container:
   ```bash
   docker exec radiology-forms ls -la /app/storage/templates/
   ```
3. Update the path if incorrect:
   ```sql
   UPDATE templates
   SET original_file_path = '/app/storage/templates/your-template.docx'
   WHERE id = X;
   ```

### Schema Mismatch / Form Fields Not Appearing

**Symptom:** Form displays but fields are missing or incorrect

**Cause:** JSON schema doesn't match what's expected, or schema is empty

**Solution:**
1. Check the schema content:
   ```bash
   docker exec radiology-db psql -U radiology -d radiology_research \
     -c "SELECT jsonb_array_length(schema->'fields') as field_count FROM templates WHERE id = X;"
   ```
2. If 0 or NULL, the schema wasn't loaded properly
3. Verify JSON file syntax is valid:
   ```bash
   python3 -m json.tool forms-service/app/data/schemas/your_schema.json
   ```
4. Re-run the schema loader

### Template Not Visible to Users

**Symptom:** Template doesn't appear in the user interface

**Cause:** `is_published` flag is set to false

**Solution:**
```sql
UPDATE templates SET is_published = true WHERE id = X;
```

### Document Generation Produces Empty Fields

**Symptom:** Generated PDF/DOCX has blank fields

**Cause:** Field anchors in schema don't match DOCX table structure

**Solution:**
1. Open the DOCX template and count tables/rows/columns
2. Verify anchor indices in the JSON schema match
3. Test with a single field to confirm anchor configuration

---

## File Mapping Reference

Complete mapping of template IDs to their associated files:

| Template ID | Display Name | JSON Schema | DOCX File |
|-------------|--------------|-------------|-----------|
| 1 | IRB Application - Standard | `irb_standard_schema.json` | `irb-application-standard 1_21_2019 (1).docx` |
| 2 | IRB Application for Minimal Risk Studies | `irb_minimal_risk_schema.json` | `irb-application-minimal-risk 11.1.2024 (1).docx` |
| 3 | IRB Application for Anonymous Survey | `irb_anonymous_survey_schema.json` | `IRB application for anonymous survey 9.9.25_0.docx` |
| 4 | IRB Application for Archival/Retrospective Research | `irb_archival_retrospective_schema.json` | `irb-application-archival-retrospective 6_6_25.docx` |

---

## Maintenance

### Updating an Existing Template

1. Update the JSON schema file
2. Run `./scripts/load-schemas.sh` to reload
3. Existing forms will continue to use their saved data; new forms will use updated schema

### Backing Up Templates

```bash
# Backup database records
docker exec radiology-db pg_dump -U radiology -d radiology_research -t templates > templates_backup.sql

# Backup schema files
cp -r forms-service/app/data/schemas/ ./schemas_backup/

# Backup DOCX files
cp -r storage/templates/ ./templates_backup/
```

### Version Control

- Always commit JSON schema changes to version control
- Document schema changes in commit messages
- Consider maintaining a CHANGELOG for significant template updates
