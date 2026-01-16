# Template Setup Guide

This document explains how to set up and manage IRB form templates in the Radiology Research Platform.

## Overview

Templates define the structure and fields of IRB application forms. Each template consists of:

1. **Database Record** (`templates` table) - Contains metadata, JSON schema, and file path
2. **JSON Schema File** (`forms-service/app/data/schemas/`) - Form field definitions
3. **DOCX Template File** (`storage/templates/`) - Word document template for PDF/DOCX generation

## Directory Structure

```
radiology-research-platform/
├── database/
│   └── seeds.sql                    # Creates template records
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

## Database Schema

The `templates` table has these important columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary key |
| `name` | VARCHAR | Display name |
| `description` | TEXT | Template description |
| `version` | VARCHAR | Version string |
| `original_file_name` | VARCHAR | DOCX filename |
| `original_file_path` | VARCHAR | **Full path to DOCX file (required for PDF generation)** |
| `schema` | JSONB | Form field definitions |
| `is_active` | BOOLEAN | Whether template is available |
| `is_published` | BOOLEAN | Whether template is visible to users |

### Critical: original_file_path

The `original_file_path` column **must contain the full path** to the DOCX template file inside the container. Without this, PDF/DOCX generation will fail.

Example: `/app/storage/templates/irb-application-standard 1_21_2019 (1).docx`

## Initial Setup

After deploying the platform, run the schema loader script:

```bash
# From project root
./scripts/load-schemas.sh

# Or if running in Docker without local psql:
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

## Verification

Verify templates are properly configured:

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

## Adding a New Template

1. **Create the DOCX template file**
   - Place in `storage/templates/`
   - Use consistent formatting with existing templates

2. **Create the JSON schema file**
   - Place in `forms-service/app/data/schemas/`
   - Follow the schema structure (see existing files for reference)
   - Include field anchors for document generation

3. **Add database record**
   ```sql
   INSERT INTO templates (name, description, version, original_file_name, original_file_path, schema, is_active, is_published)
   VALUES (
       'New Template Name',
       'Template description',
       '1.0',
       'new-template.docx',
       '/app/storage/templates/new-template.docx',
       '{"sections": [], "fields": [], "rules": []}'::jsonb,
       true,
       true
   );
   ```

4. **Load the schema**
   - Update `scripts/load-schemas.sh` to include the new template
   - Run the script

## JSON Schema Structure

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

## Troubleshooting

### PDF Generation Fails

**Error:** `Failed to generate document` or `TypeError: stat: path should be string`

**Cause:** `original_file_path` is NULL in the database

**Fix:** Update the template with the correct file path:
```sql
UPDATE templates
SET original_file_path = '/app/storage/templates/your-template.docx'
WHERE id = X;
```

### Form Shows No Fields

**Cause:** Schema not loaded into database (empty sections/fields)

**Fix:** Run `./scripts/load-schemas.sh` or manually load the JSON schema

### Template Not Visible to Users

**Cause:** `is_published` is false

**Fix:**
```sql
UPDATE templates SET is_published = true WHERE id = X;
```

## File Mapping Reference

| Template ID | JSON Schema | DOCX File |
|-------------|-------------|-----------|
| 1 | `irb_standard_schema.json` | `irb-application-standard 1_21_2019 (1).docx` |
| 2 | `irb_minimal_risk_schema.json` | `irb-application-minimal-risk 11.1.2024 (1).docx` |
| 3 | `irb_anonymous_survey_schema.json` | `IRB application for anonymous survey 9.9.25_0.docx` |
| 4 | `irb_archival_retrospective_schema.json` | `irb-application-archival-retrospective 6_6_25.docx` |
