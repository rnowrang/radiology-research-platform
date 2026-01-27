import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  QuestionnaireQuestion,
  QuestionnaireSectionInfo,
  QuestionnaireProgressResponse,
} from '@/lib/protocolAssistantApi';

// Answer record for tracking user responses
export interface QuestionnaireAnswerRecord {
  answer: string | number | boolean | string[];
  source: 'user' | 'suggested' | 'document';
  timestamp: string;
}

interface QuestionnaireState {
  // State
  projectId: string | null;
  questions: QuestionnaireQuestion[];
  sections: QuestionnaireSectionInfo[];
  currentIndex: number;
  answers: Record<string, QuestionnaireAnswerRecord>;
  skippedQuestions: string[];
  isLoading: boolean;
  error: string | null;
  estimatedMinutes: number;
  projectType: string | null;

  // Actions
  initQuestionnaire: (
    projectId: string,
    questions: QuestionnaireQuestion[],
    sections: QuestionnaireSectionInfo[],
    estimatedMinutes: number,
    projectType: string | null
  ) => void;
  setAnswer: (questionId: string, answer: QuestionnaireAnswerRecord) => void;
  skipQuestion: (questionId: string) => void;
  unskipQuestion: (questionId: string) => void;
  goNext: () => void;
  goPrevious: () => void;
  goToQuestion: (index: number) => void;
  goToSection: (sectionKey: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateQuestionsFromServer: (questions: QuestionnaireQuestion[]) => void;
  resetQuestionnaire: () => void;
  setProjectId: (projectId: string) => void;

  // Computed (implemented as getters)
  getCurrentQuestion: () => QuestionnaireQuestion | null;
  getProgress: () => QuestionnaireProgressResponse;
  getSkippedCount: () => number;
  getAnsweredCount: () => number;
  canComplete: () => boolean;
  isComplete: () => boolean;
  getCurrentSection: () => QuestionnaireSectionInfo | null;
}

const initialState = {
  projectId: null,
  questions: [] as QuestionnaireQuestion[],
  sections: [] as QuestionnaireSectionInfo[],
  currentIndex: 0,
  answers: {} as Record<string, QuestionnaireAnswerRecord>,
  skippedQuestions: [] as string[],
  isLoading: false,
  error: null,
  estimatedMinutes: 0,
  projectType: null,
};

export const useQuestionnaireStore = create<QuestionnaireState>()(
  persist(
    (set, get) => ({
      ...initialState,

      initQuestionnaire: (projectId, questions, sections, estimatedMinutes, projectType) => {
        const currentState = get();

        // If same project, preserve existing progress
        if (currentState.projectId === projectId) {
          // Get valid question IDs
          const validQuestionIds = new Set(questions.map(q => q.id));

          // Clean up answers that don't match current questions
          const cleanedAnswers: Record<string, QuestionnaireAnswerRecord> = {};
          for (const [id, answer] of Object.entries(currentState.answers)) {
            if (validQuestionIds.has(id)) {
              cleanedAnswers[id] = answer;
            }
          }

          // Clean up skipped questions that don't match
          const cleanedSkipped = currentState.skippedQuestions.filter(id => validQuestionIds.has(id));

          // Update questions while preserving answered/skipped status
          const updatedQuestions = questions.map(q => ({
            ...q,
            answered: cleanedAnswers[q.id] !== undefined,
            skipped: cleanedSkipped.includes(q.id),
          }));

          // Find first unanswered question to set as current index
          const firstUnansweredIdx = updatedQuestions.findIndex(
            q => !q.answered && !q.skipped
          );
          const newCurrentIndex = firstUnansweredIdx >= 0
            ? firstUnansweredIdx
            : Math.min(currentState.currentIndex, questions.length - 1);

          set({
            questions: updatedQuestions,
            sections,
            estimatedMinutes,
            projectType,
            answers: cleanedAnswers,
            skippedQuestions: cleanedSkipped,
            currentIndex: newCurrentIndex,
            error: null,
          });
        } else {
          // New project - reset everything
          set({
            projectId,
            questions,
            sections,
            estimatedMinutes,
            projectType,
            currentIndex: 0,
            answers: {},
            skippedQuestions: [],
            error: null,
          });
        }
      },

      setAnswer: (questionId, answer) => {
        set(state => {
          const newAnswers = { ...state.answers, [questionId]: answer };
          // Remove from skipped if it was skipped
          const newSkipped = state.skippedQuestions.filter(id => id !== questionId);
          // Update question answered status
          const newQuestions = state.questions.map(q =>
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
        set(state => {
          if (state.skippedQuestions.includes(questionId)) {
            return state;
          }
          const newQuestions = state.questions.map(q =>
            q.id === questionId ? { ...q, skipped: true } : q
          );
          return {
            skippedQuestions: [...state.skippedQuestions, questionId],
            questions: newQuestions,
          };
        });
      },

      unskipQuestion: (questionId) => {
        set(state => ({
          skippedQuestions: state.skippedQuestions.filter(id => id !== questionId),
          questions: state.questions.map(q =>
            q.id === questionId ? { ...q, skipped: false } : q
          ),
        }));
      },

      goNext: () => {
        set(state => {
          const nextIndex = Math.min(state.currentIndex + 1, state.questions.length - 1);
          return { currentIndex: nextIndex };
        });
      },

      goPrevious: () => {
        set(state => {
          const prevIndex = Math.max(state.currentIndex - 1, 0);
          return { currentIndex: prevIndex };
        });
      },

      goToQuestion: (index) => {
        set(state => {
          const clampedIndex = Math.max(0, Math.min(index, state.questions.length - 1));
          return { currentIndex: clampedIndex };
        });
      },

      goToSection: (sectionKey) => {
        set(state => {
          const idx = state.questions.findIndex(q => q.section === sectionKey);
          if (idx >= 0) {
            return { currentIndex: idx };
          }
          return state;
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      updateQuestionsFromServer: (questions) => {
        set(state => ({
          questions: questions.map(q => ({
            ...q,
            answered: state.answers[q.id] !== undefined,
            skipped: state.skippedQuestions.includes(q.id),
          })),
        }));
      },

      resetQuestionnaire: () => set(initialState),

      setProjectId: (projectId) => {
        const currentState = get();
        if (currentState.projectId !== projectId) {
          set({
            ...initialState,
            projectId,
          });
        }
      },

      // Computed getters
      getCurrentQuestion: () => {
        const state = get();
        return state.questions[state.currentIndex] || null;
      },

      getCurrentSection: () => {
        const state = get();
        const currentQuestion = state.questions[state.currentIndex];
        if (!currentQuestion) return null;
        return state.sections.find(s => s.key === currentQuestion.section) || null;
      },

      getProgress: () => {
        const state = get();
        const total = state.questions.length;
        const answered = Object.keys(state.answers).length;
        const skipped = state.skippedQuestions.length;

        // Calculate section progress
        const sectionsProgress: Record<string, { total: number; answered: number; skipped: number }> = {};
        state.questions.forEach(q => {
          if (!sectionsProgress[q.section]) {
            sectionsProgress[q.section] = { total: 0, answered: 0, skipped: 0 };
          }
          sectionsProgress[q.section].total++;
          if (state.answers[q.id]) {
            sectionsProgress[q.section].answered++;
          }
          if (state.skippedQuestions.includes(q.id)) {
            sectionsProgress[q.section].skipped++;
          }
        });

        // Calculate remaining time based on unanswered required questions
        const unansweredRequired = state.questions.filter(
          q => q.priority === 'required' && !state.answers[q.id] && !state.skippedQuestions.includes(q.id)
        );
        const estimatedRemainingMinutes = Math.ceil(unansweredRequired.length * 0.5);

        const completionPercentage = total > 0 ? Math.round(((answered + skipped) / total) * 100) : 0;

        return {
          total_questions: total,
          answered_count: answered,
          skipped_count: skipped,
          completion_percentage: completionPercentage,
          sections_progress: sectionsProgress,
          is_complete: total > 0 && (answered + skipped >= total),
          estimated_remaining_minutes: estimatedRemainingMinutes,
        };
      },

      getSkippedCount: () => get().skippedQuestions.length,

      getAnsweredCount: () => Object.keys(get().answers).length,

      canComplete: () => {
        // Can complete when all required questions are answered (not just skipped)
        const state = get();
        const requiredUnanswered = state.questions.filter(
          q => q.priority === 'required' && !state.answers[q.id]
        );
        return requiredUnanswered.length === 0;
      },

      isComplete: () => {
        const state = get();
        const progress = state.getProgress();
        return progress.is_complete;
      },
    }),
    {
      name: 'questionnaire-store',
      partialize: state => ({
        projectId: state.projectId,
        currentIndex: state.currentIndex,
        answers: state.answers,
        skippedQuestions: state.skippedQuestions,
      }),
    }
  )
);
