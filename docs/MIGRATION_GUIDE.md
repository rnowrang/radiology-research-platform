# Migration Guide

## Overview

The Radiology Research Platform uses two migration systems to manage database schema changes:

1. **Alembic (Python)** - Used for forms-service schema changes. Alembic provides version-controlled, reversible migrations that integrate with SQLAlchemy models.
2. **Raw SQL migrations** - Used for additional database features that require direct SQL execution, such as complex constraints, triggers, or cross-service schema modifications.

Both systems must be applied in the correct order for the platform to function properly.

## Alembic Migrations (Forms Service)

**Location:** `forms-service/alembic/versions/`

**Command to run:**
```bash
docker exec radiology-forms alembic upgrade head
```

### Migration List

1. **001_add_task_definition_columns.py** - Adds `template_id` and `file_category` to task_definitions table
2. **002_add_project_approval_columns.py** - Adds approval workflow columns (submitted_for_approval_at, approved_at, approved_by_id, rejected_at, rejected_by_id, rejection_notes) to projects table
3. **003_add_section_id_to_field_changes.py** - Adds `section_id` column to field_changes table with index
4. **004_add_form_version_column.py** - Adds `version` column (Integer, default 1) to form_instances table for optimistic locking to prevent concurrent edit conflicts

## SQL Migrations (Database)

**Location:** `database/migrations/`

**Command to run each:**
```bash
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/<filename>
```

### Migration List

1. **002_notification_preferences.sql** - Creates email_preferences table for user notification settings
2. **003_update_files_category_constraint.sql** - Updates the category constraint on files table to include new categories
3. **004_add_task_status_history.sql** - Creates task_status_history table for tracking task status changes
4. **005_add_project_approval_statuses.sql** - Updates project status constraint to include approval workflow statuses

## Form Schema Loading

After migrations are complete, form schemas must be loaded into the database.

**Script:** `./scripts/load-schemas.sh`

**What it does:**
- Loads 4 IRB form templates into the templates table
- Sets schema JSON and file paths for each template

**Templates loaded:**
1. IRB Application - Standard
2. IRB Application - Minimal Risk Studies
3. IRB Application - Anonymous Survey
4. IRB Application - Archival/Retrospective Research

## Migration Order

For a fresh deployment, execute the following steps in order:

1. **Start services:**
   ```bash
   docker compose up -d
   ```

2. **Wait for database to be ready:**
   ```bash
   sleep 30
   ```

3. **Run Alembic migrations:**
   ```bash
   docker exec radiology-forms alembic upgrade head
   ```

4. **Run SQL migrations in order:**
   ```bash
   docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/002_notification_preferences.sql
   docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/003_update_files_category_constraint.sql
   docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/004_add_task_status_history.sql
   docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/005_add_project_approval_statuses.sql
   ```

5. **Load form schemas:**
   ```bash
   ./scripts/load-schemas.sh
   ```

## Troubleshooting

### Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "relation does not exist" | SQL migrations not applied | Run the SQL migrations in order |
| "column does not exist" | Alembic migrations not applied | Run `docker exec radiology-forms alembic upgrade head` |
| "No templates found" | Schema loading script not run | Run `./scripts/load-schemas.sh` |

### Checking Migration Status

**Alembic migrations:**
```bash
docker exec radiology-forms alembic current
docker exec radiology-forms alembic history
```

**Verify SQL migrations:**
```bash
docker exec radiology-db psql -U radiology -d radiology_research -c "\dt"
```

### Rolling Back Alembic Migrations

To rollback the last migration:
```bash
docker exec radiology-forms alembic downgrade -1
```

To rollback to a specific revision:
```bash
docker exec radiology-forms alembic downgrade <revision_id>
```
