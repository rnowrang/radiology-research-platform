import { useState, useEffect, useCallback, useRef } from 'react';
import { locksApi, LockInfo, LockAcquireResponse } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface UseEditingLockOptions {
  /**
   * Automatically extend the lock at regular intervals
   * @default true
   */
  autoExtend?: boolean;
  /**
   * Interval in milliseconds for auto-extending the lock
   * @default 120000 (2 minutes)
   */
  extendInterval?: number;
  /**
   * Lock duration in minutes when acquiring/extending
   * @default 5
   */
  lockDurationMinutes?: number;
  /**
   * Callback when lock is acquired
   */
  onLockAcquired?: () => void;
  /**
   * Callback when lock acquisition fails (another user has the lock)
   */
  onLockConflict?: (lockedByUserId: string, expiresAt: string) => void;
  /**
   * Callback when lock is released
   */
  onLockReleased?: () => void;
  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;
}

interface UseEditingLockReturn {
  /**
   * Whether the current user holds the lock
   */
  hasLock: boolean;
  /**
   * Whether the form/section is locked by another user
   */
  isLockedByOther: boolean;
  /**
   * Lock information
   */
  lockInfo: LockInfo | null;
  /**
   * Whether lock operations are in progress
   */
  isLoading: boolean;
  /**
   * Error from last operation
   */
  error: Error | null;
  /**
   * Acquire the lock
   */
  acquireLock: () => Promise<boolean>;
  /**
   * Release the lock
   */
  releaseLock: () => Promise<boolean>;
  /**
   * Extend the lock
   */
  extendLock: () => Promise<boolean>;
  /**
   * Check current lock status
   */
  checkLockStatus: () => Promise<LockInfo | null>;
  /**
   * Force release the lock (admin/owner only)
   */
  forceReleaseLock: () => Promise<boolean>;
}

export function useEditingLock(
  formId: number,
  sectionId?: string,
  options: UseEditingLockOptions = {}
): UseEditingLockReturn {
  const {
    autoExtend = true,
    extendInterval = 120000, // 2 minutes
    lockDurationMinutes = 5,
    onLockAcquired,
    onLockConflict,
    onLockReleased,
    onError,
  } = options;

  const { user } = useAuthStore();
  const [hasLock, setHasLock] = useState(false);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const extendIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Clear extend interval
  const clearExtendInterval = useCallback(() => {
    if (extendIntervalRef.current) {
      clearInterval(extendIntervalRef.current);
      extendIntervalRef.current = null;
    }
  }, []);

  // Check lock status
  const checkLockStatus = useCallback(async (): Promise<LockInfo | null> => {
    if (!formId) return null;

    try {
      const response = sectionId
        ? await locksApi.checkSectionLock(formId, sectionId)
        : await locksApi.checkLock(formId, sectionId);

      const info = response.data;

      if (isMountedRef.current) {
        setLockInfo(info);
        setHasLock(info.is_locked && info.locked_by_id === user?.id);
        setIsLockedByOther(info.is_locked && info.locked_by_id !== user?.id);
      }

      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to check lock status');
      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }
      return null;
    }
  }, [formId, sectionId, user?.id, onError]);

  // Acquire lock
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (!formId || !user?.id) return false;

    setIsLoading(true);
    setError(null);

    try {
      const response = sectionId
        ? await locksApi.acquireSectionLock(formId, sectionId, lockDurationMinutes)
        : await locksApi.acquireLock(formId, sectionId, lockDurationMinutes);

      const result = response.data;

      if (isMountedRef.current) {
        if (result.success) {
          setHasLock(true);
          setIsLockedByOther(false);
          setLockInfo({
            is_locked: true,
            lock_id: result.lock_id,
            locked_by_id: user.id,
            expires_at: result.expires_at,
          });
          onLockAcquired?.();
          return true;
        }
      }

      return true;
    } catch (err: any) {
      // Check for conflict error (409)
      if (err?.response?.status === 409) {
        const detail = err.response.data?.detail;
        if (isMountedRef.current) {
          setHasLock(false);
          setIsLockedByOther(true);
          setLockInfo({
            is_locked: true,
            locked_by_id: detail?.locked_by_id,
            expires_at: detail?.expires_at,
          });
          onLockConflict?.(detail?.locked_by_id, detail?.expires_at);
        }
        return false;
      }

      const error = err instanceof Error ? err : new Error('Failed to acquire lock');
      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [formId, sectionId, user?.id, lockDurationMinutes, onLockAcquired, onLockConflict, onError]);

  // Release lock
  const releaseLock = useCallback(async (): Promise<boolean> => {
    if (!formId || !hasLock) return false;

    setIsLoading(true);
    setError(null);
    clearExtendInterval();

    try {
      await (sectionId
        ? locksApi.releaseSectionLock(formId, sectionId)
        : locksApi.releaseLock(formId, sectionId));

      if (isMountedRef.current) {
        setHasLock(false);
        setIsLockedByOther(false);
        setLockInfo(null);
        onLockReleased?.();
      }

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to release lock');
      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [formId, sectionId, hasLock, clearExtendInterval, onLockReleased, onError]);

  // Extend lock
  const extendLock = useCallback(async (): Promise<boolean> => {
    if (!formId || !hasLock) return false;

    try {
      const response = await locksApi.extendLock(formId, sectionId, lockDurationMinutes);
      const result = response.data;

      if (isMountedRef.current && result.success) {
        setLockInfo((prev) =>
          prev
            ? {
                ...prev,
                expires_at: result.expires_at,
              }
            : null
        );
      }

      return result.success;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to extend lock');
      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }
      return false;
    }
  }, [formId, sectionId, hasLock, lockDurationMinutes, onError]);

  // Force release lock
  const forceReleaseLock = useCallback(async (): Promise<boolean> => {
    if (!formId) return false;

    setIsLoading(true);
    setError(null);

    try {
      await locksApi.forceReleaseLock(formId, sectionId);

      if (isMountedRef.current) {
        setHasLock(false);
        setIsLockedByOther(false);
        setLockInfo(null);
        onLockReleased?.();
      }

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to force release lock');
      if (isMountedRef.current) {
        setError(error);
        onError?.(error);
      }
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [formId, sectionId, onLockReleased, onError]);

  // Setup auto-extend
  useEffect(() => {
    if (hasLock && autoExtend) {
      extendIntervalRef.current = setInterval(() => {
        extendLock();
      }, extendInterval);
    }

    return () => {
      clearExtendInterval();
    };
  }, [hasLock, autoExtend, extendInterval, extendLock, clearExtendInterval]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      clearExtendInterval();

      // Release lock on unmount if we have it
      if (hasLock && formId) {
        // Fire and forget - we're unmounting
        if (sectionId) {
          locksApi.releaseSectionLock(formId, sectionId).catch(() => {});
        } else {
          locksApi.releaseLock(formId, sectionId).catch(() => {});
        }
      }
    };
  }, [formId, sectionId, hasLock, clearExtendInterval]);

  // Check lock status on mount
  useEffect(() => {
    checkLockStatus();
  }, [formId, sectionId]);

  return {
    hasLock,
    isLockedByOther,
    lockInfo,
    isLoading,
    error,
    acquireLock,
    releaseLock,
    extendLock,
    checkLockStatus,
    forceReleaseLock,
  };
}

/**
 * Hook to get all locks for a form
 */
export function useFormLocks(formId: number) {
  const [locks, setLocks] = useState<LockInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchLocks = useCallback(async () => {
    if (!formId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await locksApi.getAllLocks(formId);
      setLocks(response.data.locks);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch locks');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    fetchLocks();
  }, [fetchLocks]);

  return {
    locks,
    isLoading,
    error,
    refetch: fetchLocks,
  };
}

export default useEditingLock;
