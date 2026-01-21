# Section-Based Form Architecture Plan

## Executive Summary

This document outlines the implementation plan for section-based form management, enabling:
- Section-based autosave batching (immediate fix)
- Section-level change requests from admin
- Section-based version diffs
- Section-level locking
- Partial approvals by section
- Section-specific comments

---

## Current State Analysis

### Form Schema Structure
Forms are already organized into sections in the template schema:
```
sec_investigator    → I. Investigator Information
sec_protocol        → II. Title of Protocol
sec_project_period  → III. Project Period
sec_funding         → IV. Funding Sources
sec_required_info   → V. Required Information
sec_population      → VI. Description of Population
sec_methods_risks   → VII. Subject-Related Methods and Risks
sec_benefits        → VIII. Benefits
sec_confidentiality → IX. Confidentiality and Data Security
sec_signatures      → X. Supporting Signatures
```

### Field Section Mapping
Fields have an **explicit `section_id` property** in the template schema:
```json
{
  "id": "investigator.pi_name",
  "label": "Principal Investigator Name",
  "section_id": "sec_investigator",  // ← Authoritative mapping
  "type": "text",
  ...
}
```

This is the **authoritative** mapping - we will use `field.section_id` from the schema,
NOT derive it from the field ID prefix.

### Current Data Models

**FieldChange** (audit trail):
```
- form_instance_id
- version_id
- user_id
- field_id (e.g., "investigator.pi_name")
- field_label
- old_value, new_value
- created_at
```

**FormData** (working data):
```
- form_instance_id
- data (JSONB - flat structure with nested keys)
- conditional_state
```

**FormVersion** (snapshots):
```
- version_number
- data_snapshot (full form data)
- change_summary
- created_by_id
```

---

## Implementation Plan

### Phase 1: Section-Based Autosave (Immediate Fix)

#### 1.1 Frontend Changes

**File:** `frontend/src/pages/forms/FormEditorPage.tsx`

**Current (Broken):**
```typescript
// Single timer cancels previous saves
const [saveTimer, setSaveTimer] = useState(null);

const handleFieldChange = (fieldId, value) => {
  if (saveTimer) clearTimeout(saveTimer);  // CANCELS previous!
  const newTimer = setTimeout(() => {
    saveFormData(fieldId, value);  // Only saves ONE field
  }, 1000);
  setSaveTimer(newTimer);
};
```

**New (Section-Based Batching):**
```typescript
// Build a field-to-section map from template schema
const fieldToSectionMap = useMemo(() => {
  const map: Record<string, string> = {};
  form?.template?.schema?.sections?.forEach((section: any) => {
    section.fields?.forEach((field: any) => {
      map[field.id] = field.section_id || section.id;
    });
  });
  return map;
}, [form?.template?.schema]);

// Pending changes grouped by section
const [pendingChanges, setPendingChanges] = useState<Map<string, FieldChange[]>>(new Map());
const sectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
const pendingChangesRef = useRef(pendingChanges); // For cleanup access

// Keep ref in sync
useEffect(() => {
  pendingChangesRef.current = pendingChanges;
}, [pendingChanges]);

// Get section from field ID using schema mapping
const getSectionFromFieldId = useCallback((fieldId: string): string => {
  return fieldToSectionMap[fieldId] || 'sec_other';
}, [fieldToSectionMap]);

const handleFieldChange = useCallback((fieldId: string, value: any, label?: string) => {
  // Update local state immediately
  setFormData(prev => updateNestedValue(prev, fieldId, value));

  const sectionId = getSectionFromFieldId(fieldId);

  // Add to pending changes for this section
  setPendingChanges(prev => {
    const updated = new Map(prev);
    const sectionChanges = [...(updated.get(sectionId) || [])];
    // Replace if same field, otherwise add
    const existingIndex = sectionChanges.findIndex(c => c.field_id === fieldId);
    if (existingIndex >= 0) {
      sectionChanges[existingIndex] = { field_id: fieldId, value, label, sectionId };
    } else {
      sectionChanges.push({ field_id: fieldId, value, label, sectionId });
    }
    updated.set(sectionId, sectionChanges);
    return updated;
  });

  // Reset timer for THIS section only (other sections unaffected)
  const existingTimer = sectionTimers.current.get(sectionId);
  if (existingTimer) clearTimeout(existingTimer);

  const newTimer = setTimeout(() => {
    saveSectionChanges(sectionId);
  }, 1000);

  sectionTimers.current.set(sectionId, newTimer);
}, [getSectionFromFieldId, saveSectionChanges]);

const saveSectionChanges = useCallback(async (sectionId: string) => {
  const changes = pendingChangesRef.current.get(sectionId);
  if (!changes || changes.length === 0) return;

  try {
    await formsApi.updateData(form.id, {
      section_id: sectionId,
      changes: changes.map(c => ({
        field_id: c.field_id,
        field_label: c.label || c.field_id,
        old_value: getNestedValue(originalFormData, c.field_id),
        new_value: c.value,
      })),
      user_id: form.ownerId,
    });

    // Clear saved changes
    setPendingChanges(prev => {
      const updated = new Map(prev);
      updated.delete(sectionId);
      return updated;
    });

    setLastSaved(new Date());
  } catch (error) {
    toast({ variant: 'destructive', title: 'Failed to save section' });
  }
}, [form?.id, form?.ownerId, originalFormData]);

// AUTO-SAVE: Save all pending changes on unmount/navigation
useEffect(() => {
  const saveAllPending = () => {
    pendingChangesRef.current.forEach((changes, sectionId) => {
      if (changes.length > 0) {
        saveSectionChanges(sectionId);
      }
    });
  };

  // Handle browser close/refresh
  const handleBeforeUnload = () => {
    saveAllPending();
  };
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Handle React unmount (navigation)
  return () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    saveAllPending();
  };
}, [saveSectionChanges]);
```

#### 1.2 Backend Changes

**File:** `forms-service/app/routers/forms.py`

Update `update_form_data` endpoint to accept `section_id`:

```python
@router.post("/{form_id}/data")
async def update_form_data(
    form_id: int,
    data_update: FormDataUpdate,  # Add section_id to schema
    db: Session = Depends(get_db),
):
    # ... existing validation ...

    # Apply changes and create audit trail
    for change in data_update.changes:
        field_change = FieldChange(
            form_instance_id=form_id,
            user_id=data_update.user_id,
            section_id=data_update.section_id,  # NEW: Track section
            field_id=change.field_id,
            field_label=change.field_label,
            old_value=change.old_value,
            new_value=change.new_value,
        )
        db.add(field_change)

        # Update data...
```

**File:** `forms-service/app/schemas/form.py`

```python
class FormDataUpdate(BaseModel):
    section_id: Optional[str] = None  # NEW
    changes: List[FieldChangeInput]
    user_id: UUID
```

---

### Phase 2: Database Schema Enhancements

#### 2.1 Add Section Tracking to FieldChange

**Migration:** `add_section_to_field_changes.py`

```sql
-- Add section_id to field_changes for grouping
ALTER TABLE field_changes ADD COLUMN section_id VARCHAR(100);

-- Index for section-based queries
CREATE INDEX idx_field_changes_section ON field_changes(form_instance_id, section_id);
```

#### 2.2 New Table: Section Status

**Migration:** `create_section_status_table.py`

```sql
CREATE TABLE form_section_status (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    section_id VARCHAR(100) NOT NULL,

    -- Status tracking
    status VARCHAR(50) DEFAULT 'draft',  -- draft, submitted, approved, needs_changes, locked
    completion_percentage DECIMAL(5,2) DEFAULT 0,

    -- Locking
    is_locked BOOLEAN DEFAULT FALSE,
    locked_by_id UUID REFERENCES users(id),
    locked_at TIMESTAMP WITH TIME ZONE,
    lock_reason VARCHAR(500),

    -- Review tracking
    last_reviewed_by_id UUID,
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,

    -- Change request tracking
    change_requested BOOLEAN DEFAULT FALSE,
    change_request_notes TEXT,
    change_requested_by_id UUID,
    change_requested_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(form_instance_id, section_id)
);

CREATE INDEX idx_section_status_form ON form_section_status(form_instance_id);
CREATE INDEX idx_section_status_status ON form_section_status(status);
```

#### 2.3 New Table: Section Comments

**Migration:** `create_section_comments_table.py`

```sql
CREATE TABLE section_comments (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    section_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'general',  -- general, change_request, approval, rejection
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by_id UUID,
    resolved_at TIMESTAMP WITH TIME ZONE,
    parent_comment_id INTEGER REFERENCES section_comments(id),  -- For threads
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_section_comments_form_section ON section_comments(form_instance_id, section_id);
```

---

### Phase 3: Section-Level Features

#### 3.1 Section Change Requests (Admin Feature)

**New Endpoint:** `POST /api/forms/{form_id}/sections/{section_id}/request-changes`

```python
@router.post("/{form_id}/sections/{section_id}/request-changes")
async def request_section_changes(
    form_id: int,
    section_id: str,
    request: SectionChangeRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """Admin requests changes to a specific section."""

    # Update section status
    section_status = get_or_create_section_status(db, form_id, section_id)
    section_status.status = 'needs_changes'
    section_status.change_requested = True
    section_status.change_request_notes = request.notes
    section_status.change_requested_by_id = user_id
    section_status.change_requested_at = datetime.utcnow()

    # Create comment for visibility
    comment = SectionComment(
        form_instance_id=form_id,
        section_id=section_id,
        user_id=user_id,
        comment_text=request.notes,
        comment_type='change_request',
    )
    db.add(comment)

    # Notify form owner
    # ... notification logic ...

    db.commit()
    return {"success": True}
```

#### 3.2 Section Locking

**New Endpoint:** `POST /api/forms/{form_id}/sections/{section_id}/lock`

```python
@router.post("/{form_id}/sections/{section_id}/lock")
async def lock_section(
    form_id: int,
    section_id: str,
    request: SectionLockRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """Lock a section to prevent further edits."""

    section_status = get_or_create_section_status(db, form_id, section_id)
    section_status.is_locked = True
    section_status.locked_by_id = user_id
    section_status.locked_at = datetime.utcnow()
    section_status.lock_reason = request.reason

    db.commit()
    return {"success": True}
```

**Frontend Integration:**
```typescript
// In FormEditorPage, check section lock before allowing edits
const handleFieldChange = (fieldId: string, value: any) => {
  const sectionId = getSectionFromFieldId(fieldId);

  if (sectionStatus[sectionId]?.is_locked) {
    toast({
      variant: 'destructive',
      title: 'Section Locked',
      description: 'This section has been locked and cannot be edited.'
    });
    return;
  }

  // ... proceed with change
};
```

#### 3.3 Partial Section Approval

**New Endpoint:** `POST /api/forms/{form_id}/sections/{section_id}/approve`

```python
@router.post("/{form_id}/sections/{section_id}/approve")
async def approve_section(
    form_id: int,
    section_id: str,
    request: SectionApprovalRequest,
    db: Session = Depends(get_db),
    user_id: UUID = Depends(get_user_id),
):
    """Approve a specific section (partial approval)."""

    section_status = get_or_create_section_status(db, form_id, section_id)
    section_status.status = 'approved'
    section_status.is_locked = True  # Lock approved sections
    section_status.last_reviewed_by_id = user_id
    section_status.last_reviewed_at = datetime.utcnow()
    section_status.reviewer_notes = request.notes

    # Create approval comment
    comment = SectionComment(
        form_instance_id=form_id,
        section_id=section_id,
        user_id=user_id,
        comment_text=request.notes or 'Section approved',
        comment_type='approval',
    )
    db.add(comment)

    # Check if all sections approved → auto-approve form
    all_sections_approved = check_all_sections_approved(db, form_id)
    if all_sections_approved:
        form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
        form.status = 'approved'

    db.commit()
    return {"success": True, "all_approved": all_sections_approved}
```

#### 3.4 Section-Based Version Diffs

**New Endpoint:** `GET /api/forms/{form_id}/versions/{version_id}/diff?by_section=true`

```python
@router.get("/{form_id}/versions/{version_id}/diff")
async def get_version_diff(
    form_id: int,
    version_id: int,
    compare_to: Optional[int] = None,  # Compare to another version
    by_section: bool = False,
    db: Session = Depends(get_db),
):
    """Get differences between versions, optionally grouped by section."""

    version = db.query(FormVersion).filter(FormVersion.id == version_id).first()

    # Get comparison version (previous or specified)
    if compare_to:
        compare_version = db.query(FormVersion).filter(FormVersion.id == compare_to).first()
    else:
        compare_version = db.query(FormVersion).filter(
            FormVersion.form_instance_id == form_id,
            FormVersion.version_number == version.version_number - 1
        ).first()

    if not compare_version:
        return {"changes": [], "by_section": {}}

    # Calculate diff
    changes = calculate_diff(compare_version.data_snapshot, version.data_snapshot)

    if by_section:
        # Group changes by section
        grouped = {}
        for change in changes:
            section_id = get_section_from_field_id(change['field_id'])
            if section_id not in grouped:
                grouped[section_id] = []
            grouped[section_id].append(change)

        return {
            "from_version": compare_version.version_number,
            "to_version": version.version_number,
            "by_section": grouped,
            "section_summary": {
                section_id: len(changes)
                for section_id, changes in grouped.items()
            }
        }

    return {"changes": changes}
```

---

### Phase 4: Frontend UI Components

#### 4.1 Section Status Indicators

```typescript
// SectionStatusBadge component
interface SectionStatusBadgeProps {
  status: 'draft' | 'submitted' | 'approved' | 'needs_changes' | 'locked';
  isLocked: boolean;
}

export function SectionStatusBadge({ status, isLocked }: SectionStatusBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <Badge variant={getStatusVariant(status)}>{status}</Badge>
      {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}
```

#### 4.2 Section Header with Actions (Admin View)

```typescript
// SectionHeader component for admin review
interface SectionHeaderProps {
  section: FormSection;
  sectionStatus: SectionStatus;
  onApprove: () => void;
  onRequestChanges: () => void;
  onLock: () => void;
}

export function SectionHeader({
  section,
  sectionStatus,
  onApprove,
  onRequestChanges,
  onLock
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-t-lg">
      <div>
        <h3 className="font-semibold">{section.title}</h3>
        <SectionStatusBadge status={sectionStatus.status} isLocked={sectionStatus.is_locked} />
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRequestChanges}>
            <MessageSquare className="h-4 w-4 mr-1" />
            Request Changes
          </Button>
          <Button size="sm" variant="outline" onClick={onApprove}>
            <Check className="h-4 w-4 mr-1" />
            Approve Section
          </Button>
          <Button size="sm" variant="ghost" onClick={onLock}>
            <Lock className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

#### 4.3 Section Comments Panel

```typescript
// SectionCommentsPanel component
export function SectionCommentsPanel({ formId, sectionId }: Props) {
  const { data: comments } = useQuery({
    queryKey: ['sectionComments', formId, sectionId],
    queryFn: () => formsApi.getSectionComments(formId, sectionId),
  });

  return (
    <div className="border-l-4 border-amber-500 pl-4 mt-4">
      <h4 className="font-medium text-sm text-amber-700">Section Comments</h4>
      {comments?.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
      <AddCommentForm formId={formId} sectionId={sectionId} />
    </div>
  );
}
```

---

## Implementation Order

### Immediate (Phase 1) - Fix Autosave Bug
1. Update `FormEditorPage.tsx` with section-based batching
2. Update `FormDataUpdate` schema to include `section_id`
3. Update `update_form_data` endpoint to accept `section_id`
4. Test thoroughly

### Short-term (Phase 2) - Database Foundation
1. Add `section_id` column to `field_changes` table
2. Create `form_section_status` table
3. Create `section_comments` table
4. Update models and schemas

### Medium-term (Phase 3) - Section Features
1. Implement section change requests
2. Implement section locking
3. Implement partial section approval
4. Implement section-based version diffs

### Long-term (Phase 4) - UI Polish
1. Section status indicators throughout UI
2. Admin section management panel
3. Section comments UI
4. Version diff viewer with section grouping

---

## API Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/forms/{id}/data` | POST | Update form data (with section_id) |
| `/forms/{id}/sections` | GET | Get all section statuses |
| `/forms/{id}/sections/{section_id}` | GET | Get section status |
| `/forms/{id}/sections/{section_id}/request-changes` | POST | Request changes to section |
| `/forms/{id}/sections/{section_id}/approve` | POST | Approve section |
| `/forms/{id}/sections/{section_id}/lock` | POST | Lock section |
| `/forms/{id}/sections/{section_id}/unlock` | POST | Unlock section |
| `/forms/{id}/sections/{section_id}/comments` | GET | Get section comments |
| `/forms/{id}/sections/{section_id}/comments` | POST | Add section comment |
| `/forms/{id}/versions/{id}/diff` | GET | Get version diff (with by_section option) |

---

## Migration Path

1. **Backward Compatible**: All changes are additive; existing data continues to work
2. **Gradual Rollout**: Section features can be enabled per-form or per-template
3. **Data Backfill**: Existing `field_changes` can have `section_id` populated from `field_id` prefix

---

## Testing Checklist

- [ ] Rapid field entry saves all fields correctly
- [ ] Section timer independence (editing section A doesn't cancel section B save)
- [ ] Page navigation saves pending changes
- [ ] Browser close/refresh saves pending changes
- [ ] Section locking prevents edits
- [ ] Section approval updates status correctly
- [ ] Section change requests notify form owner
- [ ] Version diff shows changes grouped by section
- [ ] Comments appear on correct sections
- [ ] Partial approval workflow works end-to-end

---

## Quick Implementation Reference

### Phase 1 Files (Autosave Fix)

| File | Changes |
|------|---------|
| `frontend/src/pages/forms/FormEditorPage.tsx` | Replace single debounce timer with section-based batching |
| `forms-service/app/schemas/form.py` | Add `section_id: Optional[str]` to `FormDataUpdate` |
| `forms-service/app/routers/forms.py` | Pass `section_id` to `FieldChange` creation |

### Key Design Decisions

1. **Section mapping**: Use `field.section_id` from template schema (authoritative)
2. **Navigation behavior**: Auto-save immediately on navigation (no confirmation dialogs)
3. **Backward compatible**: `section_id` is optional, existing code continues to work
