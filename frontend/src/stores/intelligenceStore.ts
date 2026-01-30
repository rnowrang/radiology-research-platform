/**
 * Unified Intelligence Store
 *
 * Manages state for the Research Intelligence Assistant which combines:
 * - Chat Mode (free conversation)
 * - Guided Mode (structured Q&A wizard)
 * - Document Mode (section-by-section editing)
 * - Review Mode (coherence checking)
 *
 * This is the single source of truth for all AI assistance interactions.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export type IntelligenceMode = 'chat' | 'guided' | 'document' | 'review';

export type Priority = 'high' | 'medium' | 'low' | 'required' | 'recommended' | 'optional';

export type AnswerSource =
  | 'user'
  | 'suggested'
  | 'extracted'
  | 'document'
  | 'learned'
  | 'freetext';

export type AnswerType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'boolean';

export interface Question {
  id: string;
  question: string;
  section: string;
  priority: Priority;
  answerType: AnswerType;
  options?: string[];
  rationale?: string;
  whyNeeded?: string;
  usedInForms?: string[];
  protocolField?: string;
  suggestedAnswer?: string;
  suggestedAnswerConfidence?: number;
  suggestedAnswerSource?: string;
}

export interface AnswerRecord {
  value: string | number | boolean | string[];
  source: AnswerSource;
  answeredAt: string;
  confidence?: number;
}

export interface SectionInfo {
  id: string;
  name: string;
  description?: string;
  questionCount: number;
  answeredCount: number;
  skippedCount: number;
}

export interface GeneratedDocument {
  id: string;
  type: string;
  name: string;
  content?: string;
  generatedAt: string;
  downloadUrl?: string;
}

export interface CoherenceIssue {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  factKey: string;
  description: string;
  values: Record<string, unknown>;
  sources: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Store State
// ============================================================================

interface IntelligenceState {
  // Context
  projectId: string | null;
  sessionId: string | null;

  // Mode
  currentMode: IntelligenceMode;
  previousMode: IntelligenceMode | null;

  // Questions (for Guided mode)
  questions: Question[];
  sections: SectionInfo[];
  currentQuestionIndex: number;
  answers: Record<string, AnswerRecord>;
  skippedQuestions: string[];
  estimatedMinutes: number;

  // Chat (for Chat mode)
  chatMessages: ChatMessage[];
  chatInputDraft: string;

  // Documents (for Document mode)
  currentDocumentId: string | null;
  currentSectionId: string | null;

  // Coherence (for Review mode)
  coherenceScore: number;
  coherenceIssues: CoherenceIssue[];
  lastCoherenceCheck: string | null;

  // Generated content
  generatedDocuments: GeneratedDocument[];

  // UI State
  isLoading: boolean;
  error: string | null;
  sidebarOpen: boolean;

  // Actions
  setProjectContext: (projectId: string, sessionId?: string) => void;
  clearContext: () => void;

  // Mode actions
  setMode: (mode: IntelligenceMode) => void;
  switchMode: (mode: IntelligenceMode) => void;

  // Question actions
  initQuestions: (
    questions: Question[],
    sections: SectionInfo[],
    estimatedMinutes?: number
  ) => void;
  setAnswer: (questionId: string, value: AnswerRecord['value'], source: AnswerSource) => void;
  skipQuestion: (questionId: string) => void;
  unskipQuestion: (questionId: string) => void;
  goToQuestion: (index: number) => void;
  goToSection: (sectionId: string) => void;
  goNext: () => void;
  goPrevious: () => void;

  // Chat actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setChatInputDraft: (draft: string) => void;
  clearChatHistory: () => void;

  // Document actions
  setCurrentDocument: (documentId: string | null, sectionId?: string | null) => void;

  // Coherence actions
  setCoherenceStatus: (
    score: number,
    issues: CoherenceIssue[],
    checkedAt: string
  ) => void;
  resolveIssue: (issueId: string) => void;

  // Generated documents
  addGeneratedDocument: (doc: GeneratedDocument) => void;
  clearGeneratedDocuments: () => void;

  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;

  // Computed getters
  getCurrentQuestion: () => Question | null;
  getCurrentSection: () => SectionInfo | null;
  getProgress: () => {
    total: number;
    answered: number;
    skipped: number;
    remaining: number;
    completionPercentage: number;
    estimatedRemainingMinutes: number;
    sectionProgress: Record<string, { answered: number; total: number }>;
  };
  canComplete: () => boolean;
  isComplete: () => boolean;
  hasBlockingIssues: () => boolean;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useIntelligenceStore = create<IntelligenceState>()(
  persist(
    (set, get) => ({
      // Initial state
      projectId: null,
      sessionId: null,
      currentMode: 'guided',
      previousMode: null,
      questions: [],
      sections: [],
      currentQuestionIndex: 0,
      answers: {},
      skippedQuestions: [],
      estimatedMinutes: 0,
      chatMessages: [],
      chatInputDraft: '',
      currentDocumentId: null,
      currentSectionId: null,
      coherenceScore: 100,
      coherenceIssues: [],
      lastCoherenceCheck: null,
      generatedDocuments: [],
      isLoading: false,
      error: null,
      sidebarOpen: true,

      // Context actions
      setProjectContext: (projectId, sessionId) => {
        const state = get();
        // Reset if project changed
        if (state.projectId !== projectId) {
          set({
            projectId,
            sessionId: sessionId || null,
            questions: [],
            sections: [],
            currentQuestionIndex: 0,
            answers: {},
            skippedQuestions: [],
            chatMessages: [],
            coherenceIssues: [],
            generatedDocuments: [],
            error: null,
          });
        } else if (sessionId && state.sessionId !== sessionId) {
          set({ sessionId });
        }
      },

      clearContext: () => set({
        projectId: null,
        sessionId: null,
        questions: [],
        sections: [],
        currentQuestionIndex: 0,
        answers: {},
        skippedQuestions: [],
        chatMessages: [],
        coherenceIssues: [],
        generatedDocuments: [],
      }),

      // Mode actions
      setMode: (mode) => set({ currentMode: mode }),

      switchMode: (mode) => {
        const state = get();
        set({
          previousMode: state.currentMode,
          currentMode: mode,
        });
      },

      // Question actions
      initQuestions: (questions, sections, estimatedMinutes = 15) => {
        const state = get();

        // Preserve existing answers for same project
        const existingAnswers = state.answers;
        const existingSkipped = state.skippedQuestions;

        // Filter to only valid question IDs
        const questionIds = new Set(questions.map((q) => q.id));
        const validAnswers: Record<string, AnswerRecord> = {};
        const validSkipped: string[] = [];

        for (const [id, answer] of Object.entries(existingAnswers)) {
          if (questionIds.has(id)) {
            validAnswers[id] = answer;
          }
        }

        for (const id of existingSkipped) {
          if (questionIds.has(id)) {
            validSkipped.push(id);
          }
        }

        // Find first unanswered question
        let startIndex = 0;
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          if (!validAnswers[q.id] && !validSkipped.includes(q.id)) {
            startIndex = i;
            break;
          }
        }

        // Update sections with counts
        const updatedSections = sections.map((section) => {
          const sectionQuestions = questions.filter((q) => q.section === section.id);
          const answeredCount = sectionQuestions.filter((q) => validAnswers[q.id]).length;
          const skippedCount = sectionQuestions.filter((q) =>
            validSkipped.includes(q.id)
          ).length;

          return {
            ...section,
            questionCount: sectionQuestions.length,
            answeredCount,
            skippedCount,
          };
        });

        set({
          questions,
          sections: updatedSections,
          currentQuestionIndex: startIndex,
          answers: validAnswers,
          skippedQuestions: validSkipped,
          estimatedMinutes,
        });
      },

      setAnswer: (questionId, value, source) => {
        const state = get();
        const newAnswers = {
          ...state.answers,
          [questionId]: {
            value,
            source,
            answeredAt: new Date().toISOString(),
          },
        };

        // Remove from skipped if was skipped
        const newSkipped = state.skippedQuestions.filter((id) => id !== questionId);

        // Update section counts
        const question = state.questions.find((q) => q.id === questionId);
        const updatedSections = state.sections.map((section) => {
          if (section.id === question?.section) {
            const wasAlreadyAnswered = !!state.answers[questionId];
            return {
              ...section,
              answeredCount: wasAlreadyAnswered
                ? section.answeredCount
                : section.answeredCount + 1,
              skippedCount: state.skippedQuestions.includes(questionId)
                ? section.skippedCount - 1
                : section.skippedCount,
            };
          }
          return section;
        });

        set({
          answers: newAnswers,
          skippedQuestions: newSkipped,
          sections: updatedSections,
        });
      },

      skipQuestion: (questionId) => {
        const state = get();
        if (state.skippedQuestions.includes(questionId)) return;

        const question = state.questions.find((q) => q.id === questionId);
        const updatedSections = state.sections.map((section) => {
          if (section.id === question?.section) {
            return {
              ...section,
              skippedCount: section.skippedCount + 1,
            };
          }
          return section;
        });

        set({
          skippedQuestions: [...state.skippedQuestions, questionId],
          sections: updatedSections,
        });
      },

      unskipQuestion: (questionId) => {
        const state = get();
        const question = state.questions.find((q) => q.id === questionId);
        const updatedSections = state.sections.map((section) => {
          if (section.id === question?.section) {
            return {
              ...section,
              skippedCount: Math.max(0, section.skippedCount - 1),
            };
          }
          return section;
        });

        set({
          skippedQuestions: state.skippedQuestions.filter((id) => id !== questionId),
          sections: updatedSections,
        });
      },

      goToQuestion: (index) => {
        const state = get();
        if (index >= 0 && index < state.questions.length) {
          set({ currentQuestionIndex: index });
        }
      },

      goToSection: (sectionId) => {
        const state = get();
        const firstInSection = state.questions.findIndex(
          (q) => q.section === sectionId
        );
        if (firstInSection >= 0) {
          set({ currentQuestionIndex: firstInSection });
        }
      },

      goNext: () => {
        const state = get();
        // Find next unanswered/unskipped question
        for (let i = state.currentQuestionIndex + 1; i < state.questions.length; i++) {
          const q = state.questions[i];
          if (!state.answers[q.id] && !state.skippedQuestions.includes(q.id)) {
            set({ currentQuestionIndex: i });
            return;
          }
        }
        // If no unanswered found, just go to next
        if (state.currentQuestionIndex < state.questions.length - 1) {
          set({ currentQuestionIndex: state.currentQuestionIndex + 1 });
        }
      },

      goPrevious: () => {
        const state = get();
        if (state.currentQuestionIndex > 0) {
          set({ currentQuestionIndex: state.currentQuestionIndex - 1 });
        }
      },

      // Chat actions
      addChatMessage: (message) => {
        const state = get();
        const newMessage: ChatMessage = {
          ...message,
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          timestamp: new Date().toISOString(),
        };
        set({ chatMessages: [...state.chatMessages, newMessage] });
      },

      setChatInputDraft: (draft) => set({ chatInputDraft: draft }),

      clearChatHistory: () => set({ chatMessages: [], chatInputDraft: '' }),

      // Document actions
      setCurrentDocument: (documentId, sectionId = null) =>
        set({ currentDocumentId: documentId, currentSectionId: sectionId }),

      // Coherence actions
      setCoherenceStatus: (score, issues, checkedAt) =>
        set({
          coherenceScore: score,
          coherenceIssues: issues,
          lastCoherenceCheck: checkedAt,
        }),

      resolveIssue: (issueId) => {
        const state = get();
        set({
          coherenceIssues: state.coherenceIssues.filter((i) => i.id !== issueId),
        });
      },

      // Generated documents
      addGeneratedDocument: (doc) => {
        const state = get();
        // Replace if same type exists
        const filtered = state.generatedDocuments.filter((d) => d.type !== doc.type);
        set({ generatedDocuments: [...filtered, doc] });
      },

      clearGeneratedDocuments: () => set({ generatedDocuments: [] }),

      // UI actions
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Computed getters
      getCurrentQuestion: () => {
        const state = get();
        if (state.currentQuestionIndex >= 0 && state.currentQuestionIndex < state.questions.length) {
          return state.questions[state.currentQuestionIndex];
        }
        return null;
      },

      getCurrentSection: () => {
        const state = get();
        const question = state.questions[state.currentQuestionIndex];
        if (!question) return null;
        return state.sections.find((s) => s.id === question.section) || null;
      },

      getProgress: () => {
        const state = get();
        const total = state.questions.length;
        const answered = Object.keys(state.answers).length;
        const skipped = state.skippedQuestions.length;
        const remaining = total - answered - skipped;
        const completionPercentage = total > 0 ? Math.round((answered / total) * 100) : 0;

        // Calculate section progress
        const sectionProgress: Record<string, { answered: number; total: number }> = {};
        for (const section of state.sections) {
          sectionProgress[section.id] = {
            answered: section.answeredCount,
            total: section.questionCount,
          };
        }

        // Estimate remaining time (2 min per question on average)
        const avgMinutesPerQuestion = state.estimatedMinutes / Math.max(total, 1);
        const estimatedRemainingMinutes = Math.ceil(remaining * avgMinutesPerQuestion);

        return {
          total,
          answered,
          skipped,
          remaining,
          completionPercentage,
          estimatedRemainingMinutes,
          sectionProgress,
        };
      },

      canComplete: () => {
        const state = get();
        // Can complete if all high-priority/required questions are answered
        const highPriorityQuestions = state.questions.filter(
          (q) => q.priority === 'high' || q.priority === 'required'
        );
        return highPriorityQuestions.every(
          (q) => state.answers[q.id] || state.skippedQuestions.includes(q.id)
        );
      },

      isComplete: () => {
        const state = get();
        return state.questions.every(
          (q) => state.answers[q.id] || state.skippedQuestions.includes(q.id)
        );
      },

      hasBlockingIssues: () => {
        const state = get();
        return state.coherenceIssues.some((i) => i.severity === 'error');
      },
    }),
    {
      name: 'intelligence-store',
      partialize: (state) => ({
        projectId: state.projectId,
        sessionId: state.sessionId,
        currentMode: state.currentMode,
        currentQuestionIndex: state.currentQuestionIndex,
        answers: state.answers,
        skippedQuestions: state.skippedQuestions,
        chatMessages: state.chatMessages.slice(-50), // Keep last 50 messages
        generatedDocuments: state.generatedDocuments,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

export default useIntelligenceStore;
