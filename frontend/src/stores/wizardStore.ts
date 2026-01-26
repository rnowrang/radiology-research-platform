import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Types
export interface SuggestedAnswer {
  id: string;
  text: string;
  source: 'document' | 'ai' | 'common';
  confidence?: number;
}

export interface FormFieldInfo {
  form_type: string;
  section: string;
  field_name: string;
  field_label: string;
}

export interface EnhancedGapQuestion {
  id: string;
  question: string;
  section: string;
  priority: 'high' | 'medium' | 'low';
  rationale?: string;
  suggested_answers: SuggestedAnswer[];
  extracted_value?: string;
  extracted_confidence?: number;
  form_field?: FormFieldInfo;
  average_time_seconds: number;
  answered: boolean;
  skipped: boolean;
}

export interface SectionInfo {
  key: string;  // Original section key (e.g., "study_info", "methodology")
  name: string; // Display name (e.g., "Study Information", "Methodology")
  icon: string;
  question_count: number;
}

export interface AnswerRecord {
  answer: string;
  source: 'suggested' | 'freetext' | 'extracted';
  timestamp: string;
}

export interface WizardProgress {
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  current_index: number;
  sections_progress: Record<string, { total: number; answered: number }>;
  estimated_remaining_minutes: number;
  percent_complete: number;
}

export interface GeneratedDocument {
  doc_type: string;
  content: Record<string, unknown>;
  word_count: number;
  quality_score: number;
  suggestions: string[];
}

interface WizardState {
  // State
  sessionId: string | null;
  questions: EnhancedGapQuestion[];
  sections: SectionInfo[];
  currentIndex: number;
  answers: Record<string, AnswerRecord>;
  skippedQuestions: string[];
  isLoading: boolean;
  error: string | null;
  totalEstimatedMinutes: number;
  generatedDocuments: GeneratedDocument[];

  // Actions
  initWizard: (
    sessionId: string,
    questions: EnhancedGapQuestion[],
    sections: SectionInfo[],
    totalEstimatedMinutes: number
  ) => void;
  setAnswer: (questionId: string, answer: AnswerRecord) => void;
  skipQuestion: (questionId: string) => void;
  unskipQuestion: (questionId: string) => void;
  goNext: () => void;
  goPrevious: () => void;
  goToQuestion: (index: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateQuestionsFromServer: (questions: EnhancedGapQuestion[]) => void;
  resetWizard: () => void;
  setSessionId: (sessionId: string) => void;
  addGeneratedDocument: (doc: GeneratedDocument) => void;
  addGeneratedDocuments: (docs: GeneratedDocument[]) => void;
  clearGeneratedDocuments: () => void;

  // Computed (implemented as getters through selectors)
  getCurrentQuestion: () => EnhancedGapQuestion | null;
  getProgress: () => WizardProgress;
  getSkippedCount: () => number;
  getAnsweredCount: () => number;
  canComplete: () => boolean;
  isComplete: () => boolean;
}

const initialState = {
  sessionId: null,
  questions: [],
  sections: [],
  currentIndex: 0,
  answers: {},
  skippedQuestions: [],
  isLoading: false,
  error: null,
  totalEstimatedMinutes: 0,
  generatedDocuments: [] as GeneratedDocument[],
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      initWizard: (sessionId, questions, sections, totalEstimatedMinutes) => {
        const currentState = get();

        // If same session, preserve existing progress
        if (currentState.sessionId === sessionId) {
          // Get valid question IDs
          const validQuestionIds = new Set(questions.map(q => q.id));

          // Clean up answers that don't match current questions
          const cleanedAnswers: Record<string, AnswerRecord> = {};
          for (const [id, answer] of Object.entries(currentState.answers)) {
            if (validQuestionIds.has(id)) {
              cleanedAnswers[id] = answer;
            }
          }

          // Clean up skipped questions that don't match
          const cleanedSkipped = currentState.skippedQuestions.filter(id => validQuestionIds.has(id));

          // Update questions while preserving answered/skipped status
          const updatedQuestions = questions.map((q) => ({
            ...q,
            answered: cleanedAnswers[q.id] !== undefined,
            skipped: cleanedSkipped.includes(q.id),
          }));

          // Find first unanswered question to set as current index
          const firstUnansweredIdx = updatedQuestions.findIndex(
            q => !q.answered && !q.skipped
          );
          // Use first unanswered, or last question if all answered/skipped
          const newCurrentIndex = firstUnansweredIdx >= 0
            ? firstUnansweredIdx
            : Math.min(currentState.currentIndex, questions.length - 1);

          set({
            questions: updatedQuestions,
            sections,
            totalEstimatedMinutes,
            answers: cleanedAnswers,
            skippedQuestions: cleanedSkipped,
            currentIndex: newCurrentIndex,
            error: null,
          });
        } else {
          // New session - reset everything including generated documents
          set({
            sessionId,
            questions,
            sections,
            totalEstimatedMinutes,
            currentIndex: 0,
            answers: {},
            skippedQuestions: [],
            generatedDocuments: [],
            error: null,
          });
        }
      },

      setAnswer: (questionId, answer) => {
        set((state) => {
          const newAnswers = { ...state.answers, [questionId]: answer };
          // Remove from skipped if it was skipped
          const newSkipped = state.skippedQuestions.filter((id) => id !== questionId);
          // Update question answered status
          const newQuestions = state.questions.map((q) =>
            q.id === questionId ? { ...q, answered: true, skipped: false } : q
          );
          return {
            answers: newAnswers,
            skippedQuestions: newSkipped,
            questions: newQuestions,
          };
        });
      },

      skipQuestion: (questionId) => {
        set((state) => {
          if (state.skippedQuestions.includes(questionId)) {
            return state;
          }
          const newQuestions = state.questions.map((q) =>
            q.id === questionId ? { ...q, skipped: true } : q
          );
          return {
            skippedQuestions: [...state.skippedQuestions, questionId],
            questions: newQuestions,
          };
        });
      },

      unskipQuestion: (questionId) => {
        set((state) => ({
          skippedQuestions: state.skippedQuestions.filter((id) => id !== questionId),
          questions: state.questions.map((q) =>
            q.id === questionId ? { ...q, skipped: false } : q
          ),
        }));
      },

      goNext: () => {
        set((state) => {
          const nextIndex = Math.min(state.currentIndex + 1, state.questions.length - 1);
          return { currentIndex: nextIndex };
        });
      },

      goPrevious: () => {
        set((state) => {
          const prevIndex = Math.max(state.currentIndex - 1, 0);
          return { currentIndex: prevIndex };
        });
      },

      goToQuestion: (index) => {
        set((state) => {
          const clampedIndex = Math.max(0, Math.min(index, state.questions.length - 1));
          return { currentIndex: clampedIndex };
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      updateQuestionsFromServer: (questions) => {
        set((state) => ({
          questions: questions.map((q) => ({
            ...q,
            answered: state.answers[q.id] !== undefined,
            skipped: state.skippedQuestions.includes(q.id),
          })),
        }));
      },

      resetWizard: () => set(initialState),

      setSessionId: (sessionId) => {
        const currentState = get();
        // If session changed, reset all session-specific data
        if (currentState.sessionId !== sessionId) {
          set({
            sessionId,
            questions: [],
            sections: [],
            currentIndex: 0,
            answers: {},
            skippedQuestions: [],
            generatedDocuments: [],
            error: null,
          });
        }
      },

      addGeneratedDocument: (doc) => {
        set((state) => ({
          generatedDocuments: [...state.generatedDocuments, doc],
        }));
      },

      addGeneratedDocuments: (docs) => {
        set((state) => ({
          generatedDocuments: [...state.generatedDocuments, ...docs],
        }));
      },

      clearGeneratedDocuments: () => {
        set({ generatedDocuments: [] });
      },

      // Computed getters
      getCurrentQuestion: () => {
        const state = get();
        return state.questions[state.currentIndex] || null;
      },

      getProgress: () => {
        const state = get();
        const total = state.questions.length;
        const answered = Object.keys(state.answers).length;
        const skipped = state.skippedQuestions.length;

        // Calculate section progress
        const sectionsProgress: Record<string, { total: number; answered: number }> = {};
        state.questions.forEach((q) => {
          if (!sectionsProgress[q.section]) {
            sectionsProgress[q.section] = { total: 0, answered: 0 };
          }
          sectionsProgress[q.section].total++;
          if (state.answers[q.id]) {
            sectionsProgress[q.section].answered++;
          }
        });

        // Calculate remaining time
        const unansweredQuestions = state.questions.filter(
          (q) => !state.answers[q.id] && !state.skippedQuestions.includes(q.id)
        );
        const remainingSeconds = unansweredQuestions.reduce(
          (sum, q) => sum + q.average_time_seconds,
          0
        );
        const remainingMinutes = Math.ceil(remainingSeconds / 60);

        const percentComplete = total > 0 ? ((answered + skipped) / total) * 100 : 0;

        return {
          total_questions: total,
          answered_count: answered,
          skipped_count: skipped,
          current_index: state.currentIndex,
          sections_progress: sectionsProgress,
          estimated_remaining_minutes: remainingMinutes,
          percent_complete: Math.round(percentComplete * 10) / 10,
        };
      },

      getSkippedCount: () => get().skippedQuestions.length,

      getAnsweredCount: () => Object.keys(get().answers).length,

      canComplete: () => {
        // Can complete when all high-priority questions are answered (not just skipped)
        const state = get();
        const highPriorityUnanswered = state.questions.filter(
          (q) => q.priority === 'high' && !state.answers[q.id]
        );
        return highPriorityUnanswered.length === 0;
      },

      isComplete: () => {
        const state = get();
        const progress = state.getProgress();
        return progress.answered_count + progress.skipped_count >= progress.total_questions;
      },
    }),
    {
      name: 'wizard-store',
      partialize: (state) => ({
        sessionId: state.sessionId,
        currentIndex: state.currentIndex,
        answers: state.answers,
        skippedQuestions: state.skippedQuestions,
        generatedDocuments: state.generatedDocuments,
      }),
    }
  )
);
