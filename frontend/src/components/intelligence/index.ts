/**
 * Intelligence Components - Unified AI Assistant
 *
 * Exports all components for the Research Intelligence Assistant
 * which combines Chat, Guided Questionnaire, Document Editing, and Review modes.
 */

// Main container
export { IntelligencePanel } from './IntelligencePanel';

// Mode selector
export { ModeSelector, ModeSelectorCompact } from './ModeSelector';

// Individual modes
export { ChatMode } from './ChatMode';
export { GuidedMode } from './GuidedMode';
export { DocumentMode } from './DocumentMode';
export { ReviewMode } from './ReviewMode';

// Sidebar
export { IntelligenceSidebar } from './IntelligenceSidebar';

// Re-export types from store
export type { IntelligenceMode } from '@/stores/intelligenceStore';
