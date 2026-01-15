// User types
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'reviewer' | 'researcher';
  isActive: boolean;
  createdAt: string;
}

// Project types
export interface Project {
  id: string;
  title: string;
  description?: string;
  projectType?: string;
  department?: string;
  principalInvestigatorId: string;
  principalInvestigator?: User;
  status: 'draft' | 'active' | 'completed' | 'archived';
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCollaborator {
  id: string;
  projectId: string;
  userId: string;
  user?: User;
  role: 'co_investigator' | 'research_assistant' | 'coordinator';
  addedAt: string;
}

// Template types
export interface Template {
  id: number;
  name: string;
  description?: string;
  version: string;
  schema: FormSchema;
  isActive: boolean;
  isPublished: boolean;
  createdAt: string;
}

// Form schema types
export interface FormSchema {
  title: string;
  description?: string;
  sections: FormSection[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  condition?: FieldCondition;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: FieldOption[];
  validation?: FieldValidation;
  condition?: FieldCondition;
  columns?: number;
  indent?: number;
  rows?: number;
  tableColumns?: TableColumn[];
  repeatableConfig?: RepeatableConfig;
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'multiselect'
  | 'table'
  | 'repeatable'
  | 'heading'
  | 'paragraph';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
}

export interface FieldCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty';
  value?: any;
}

export interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select';
  options?: FieldOption[];
  width?: string;
}

export interface RepeatableConfig {
  minItems?: number;
  maxItems?: number;
  addButtonLabel?: string;
  itemLabel?: string;
  fields: FormField[];
}

// Form instance types
export interface FormInstance {
  id: number;
  templateId: number;
  template?: Template;
  projectId?: string;
  project?: Project;
  ownerId: string;
  owner?: User;
  title: string;
  status: FormStatus;
  currentVersionNumber: number;
  completionPercentage: number;
  submittedAt?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type FormStatus =
  | 'draft'
  | 'in_review'
  | 'needs_changes'
  | 'approved'
  | 'locked';

export interface FormData {
  id: number;
  formInstanceId: number;
  data: Record<string, any>;
  conditionalState: Record<string, boolean>;
  updatedAt: string;
}

export interface FormVersion {
  id: number;
  formInstanceId: number;
  versionNumber: number;
  versionLabel?: string;
  dataSnapshot: Record<string, any>;
  statusAtCreation: FormStatus;
  changeSummary?: string;
  generatedDocxPath?: string;
  generatedPdfPath?: string;
  createdById: string;
  createdBy?: User;
  createdAt: string;
}

// Review types
export interface ReviewQueueItem {
  id: number;
  title: string;
  template_name: string;
  template_version: string;
  owner_id: string;
  owner_name?: string;
  status: FormStatus;
  submitted_at?: string;
  current_version_number: number;
  unresolved_comments: number;
}

export interface ReviewAction {
  id: number;
  form_instance_id: number;
  version_id?: number;
  performed_by_id: string;
  action_type: 'submit_for_review' | 'request_changes' | 'approve' | 'reject' | 'return_to_draft';
  notes?: string;
  created_at: string;
}

export interface FormReview {
  id: number;
  formInstanceId: number;
  reviewStageId: number;
  reviewerId: string;
  reviewer?: User;
  status: ReviewStatus;
  deadline?: string;
  overallComments?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export type ReviewStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'revision_required';

export interface CommentThread {
  id: number;
  formInstanceId: number;
  fieldId?: string;
  sectionId?: string;
  isResolved: boolean;
  resolvedAt?: string;
  resolvedById?: string;
  comments: Comment[];
  createdAt: string;
}

export interface Comment {
  id: number;
  threadId: number;
  parentCommentId?: number;
  authorId: string;
  author?: User;
  content: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// Task types
export interface Task {
  id: number;
  projectId?: string;
  formInstanceId?: number;
  assignedToId?: string;
  assignedTo?: User;
  createdById: string;
  createdBy?: User;
  title: string;
  description?: string;
  taskType?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Notification types
export interface Notification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

// Lock types
export interface EditingLock {
  id: number;
  formInstanceId: number;
  sectionId?: string;
  lockedById: string;
  lockedByName?: string;
  expiresAt: string;
  createdAt: string;
}

export interface LockInfo {
  is_locked: boolean;
  lock_id?: number;
  locked_by_id?: string;
  locked_by_name?: string;
  expires_at?: string;
  created_at?: string;
}

// Mention types
export interface MentionableUser {
  id: string;
  name: string;
  email: string;
  username: string;
}

export interface CommentMention {
  id: number;
  commentId: number;
  mentionedUserId: string;
  mentionedUser?: User;
  notified: boolean;
  createdAt: string;
}

// Amendment types
export type AmendmentType =
  | 'protocol_change'
  | 'personnel_change'
  | 'funding_change'
  | 'site_change'
  | 'procedure_change'
  | 'consent_update'
  | 'other';

export type AmendmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn';

export interface Amendment {
  id: number;
  form_instance_id: number;
  amendment_type: AmendmentType;
  status: AmendmentStatus;
  description?: string;
  submitted_at?: string;
  submitted_by_id?: string;
  reviewed_at?: string;
  reviewed_by_id?: string;
  review_notes?: string;
  created_at: string;
  created_by_id: string;
  field_changes_count?: number;
}

export interface AmendmentFieldChange {
  id: number;
  amendment_id: number;
  field_id: string;
  field_label?: string;
  old_value?: any;
  new_value?: any;
  justification?: string;
}

export interface AmendmentWithChanges extends Amendment {
  field_changes: AmendmentFieldChange[];
}

// API response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
