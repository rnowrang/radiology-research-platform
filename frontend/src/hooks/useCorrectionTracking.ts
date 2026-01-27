import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { protocolAssistantApi, FormCorrectionRequest } from '@/lib/protocolAssistantApi';

interface AIFilledFieldInfo {
  field_id: string;
  field_label?: string;
  field_type?: string;
  original_value: unknown;
  confidence: number;
  source: string;
}

interface UseCorrectionTrackingOptions {
  formId: number;
  projectId?: string;
  onCorrectionRecorded?: (fieldId: string) => void;
}

export function useCorrectionTracking({
  formId,
  projectId,
  onCorrectionRecorded,
}: UseCorrectionTrackingOptions) {
  // Store AI-filled field info
  const aiFilledFields = useRef<Map<string, AIFilledFieldInfo>>(new Map());

  // Mutation for recording corrections
  const recordCorrectionMutation = useMutation({
    mutationFn: (correction: FormCorrectionRequest) =>
      protocolAssistantApi.recordFormCorrection(formId, correction),
    onSuccess: (_data, variables) => {
      onCorrectionRecorded?.(variables.field_id);
    },
  });

  /**
   * Register a field as AI-filled. Call this when rendering a field
   * that was populated by the AI.
   */
  const registerAIFilledField = useCallback((info: AIFilledFieldInfo) => {
    aiFilledFields.current.set(info.field_id, info);
  }, []);

  /**
   * Unregister a field (e.g., when component unmounts or field is removed)
   */
  const unregisterAIFilledField = useCallback((fieldId: string) => {
    aiFilledFields.current.delete(fieldId);
  }, []);

  /**
   * Check if a field was AI-filled
   */
  const isAIFilledField = useCallback((fieldId: string): boolean => {
    return aiFilledFields.current.has(fieldId);
  }, []);

  /**
   * Get AI-filled field info
   */
  const getAIFilledFieldInfo = useCallback((fieldId: string): AIFilledFieldInfo | undefined => {
    return aiFilledFields.current.get(fieldId);
  }, []);

  /**
   * Track when a user changes an AI-filled field value.
   * Call this on blur or when the user saves the field.
   */
  const trackCorrection = useCallback((
    fieldId: string,
    newValue: unknown,
  ) => {
    const fieldInfo = aiFilledFields.current.get(fieldId);
    if (!fieldInfo) {
      // Not an AI-filled field, nothing to track
      return;
    }

    // Check if the value actually changed
    const originalValue = fieldInfo.original_value;
    if (JSON.stringify(originalValue) === JSON.stringify(newValue)) {
      // No change, nothing to track
      return;
    }

    // Record the correction
    recordCorrectionMutation.mutate({
      field_id: fieldId,
      field_label: fieldInfo.field_label,
      field_type: fieldInfo.field_type,
      original_value: originalValue,
      corrected_value: newValue,
      project_id: projectId,
    });

    // Update the stored value so we don't report the same correction twice
    aiFilledFields.current.set(fieldId, {
      ...fieldInfo,
      original_value: newValue,
    });
  }, [projectId, recordCorrectionMutation]);

  /**
   * Batch register multiple AI-filled fields at once
   */
  const registerAIFilledFields = useCallback((fields: AIFilledFieldInfo[]) => {
    fields.forEach(field => {
      aiFilledFields.current.set(field.field_id, field);
    });
  }, []);

  /**
   * Clear all registered fields (e.g., when navigating away)
   */
  const clearRegisteredFields = useCallback(() => {
    aiFilledFields.current.clear();
  }, []);

  return {
    registerAIFilledField,
    registerAIFilledFields,
    unregisterAIFilledField,
    isAIFilledField,
    getAIFilledFieldInfo,
    trackCorrection,
    clearRegisteredFields,
    isRecordingCorrection: recordCorrectionMutation.isPending,
  };
}
