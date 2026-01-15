import * as React from 'react';
import { Lock, LockOpen, Clock, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LockInfo } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LockIndicatorProps {
  /**
   * Lock information
   */
  lockInfo: LockInfo | null;
  /**
   * Whether the current user has the lock
   */
  hasLock?: boolean;
  /**
   * Whether to show a compact version (icon only)
   */
  compact?: boolean;
  /**
   * User name of the lock holder (if known)
   */
  lockedByName?: string;
  /**
   * Callback when force release is clicked
   */
  onForceRelease?: () => void;
  /**
   * Whether the current user can force release (admin/owner)
   */
  canForceRelease?: boolean;
  /**
   * Whether force release is loading
   */
  isForceReleasing?: boolean;
  /**
   * Additional class names
   */
  className?: string;
}

/**
 * Displays the lock status of a form or section
 */
export function LockIndicator({
  lockInfo,
  hasLock = false,
  compact = false,
  lockedByName,
  onForceRelease,
  canForceRelease = false,
  isForceReleasing = false,
  className,
}: LockIndicatorProps) {
  const { user } = useAuthStore();

  // No lock info or not locked
  if (!lockInfo || !lockInfo.is_locked) {
    if (compact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn('text-muted-foreground', className)}>
                <LockOpen className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Not locked - available for editing</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  }

  const isOwnLock = hasLock || lockInfo.locked_by_id === user?.id;
  const expiresAt = lockInfo.expires_at ? new Date(lockInfo.expires_at) : null;
  const timeRemaining = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000 / 60)) : null;

  // Format display name
  const displayName = lockedByName || (isOwnLock ? 'You' : 'Another user');

  // Compact version (icon only with tooltip)
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1',
                isOwnLock ? 'text-green-600' : 'text-amber-600',
                className
              )}
            >
              <Lock className="h-4 w-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">
                {isOwnLock ? 'You have the lock' : `Locked by ${displayName}`}
              </p>
              {timeRemaining !== null && (
                <p className="text-xs text-muted-foreground">
                  Expires in {timeRemaining} minute{timeRemaining !== 1 ? 's' : ''}
                </p>
              )}
              {!isOwnLock && canForceRelease && onForceRelease && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onForceRelease}
                  disabled={isForceReleasing}
                  className="mt-2 w-full"
                >
                  {isForceReleasing ? 'Releasing...' : 'Force Release'}
                </Button>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full version
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2',
        isOwnLock
          ? 'border-green-200 bg-green-50 text-green-800'
          : 'border-amber-200 bg-amber-50 text-amber-800',
        className
      )}
    >
      <Lock className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {isOwnLock ? 'You are editing' : `${displayName} is editing`}
          </span>
          {!isOwnLock && (
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Read-only
            </Badge>
          )}
        </div>
        {timeRemaining !== null && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Clock className="h-3 w-3" />
            <span>
              {isOwnLock
                ? `Lock expires in ${timeRemaining} min`
                : `Available in ${timeRemaining} min`}
            </span>
          </div>
        )}
      </div>
      {!isOwnLock && canForceRelease && onForceRelease && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onForceRelease}
          disabled={isForceReleasing}
          className="flex-shrink-0"
        >
          {isForceReleasing ? 'Releasing...' : 'Force Release'}
        </Button>
      )}
    </div>
  );
}

/**
 * Displays a banner when someone else is editing the form
 */
export function LockBanner({
  lockInfo,
  lockedByName,
  onForceRelease,
  canForceRelease = false,
  isForceReleasing = false,
  className,
}: Omit<LockIndicatorProps, 'compact' | 'hasLock'>) {
  const { user } = useAuthStore();

  // Only show if locked by someone else
  if (!lockInfo?.is_locked || lockInfo.locked_by_id === user?.id) {
    return null;
  }

  const displayName = lockedByName || 'Another user';
  const expiresAt = lockInfo.expires_at ? new Date(lockInfo.expires_at) : null;
  const timeRemaining = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000 / 60)) : null;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <User className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <p className="font-medium text-amber-800">
            {displayName} is currently editing this form
          </p>
          <p className="text-sm text-amber-600">
            {timeRemaining !== null
              ? `The lock will expire in ${timeRemaining} minute${timeRemaining !== 1 ? 's' : ''}`
              : 'Please wait or contact them to release the lock'}
          </p>
        </div>
      </div>
      {canForceRelease && onForceRelease && (
        <Button
          variant="outline"
          size="sm"
          onClick={onForceRelease}
          disabled={isForceReleasing}
          className="border-amber-300 text-amber-700 hover:bg-amber-100"
        >
          <Lock className="h-4 w-4 mr-2" />
          {isForceReleasing ? 'Releasing...' : 'Force Release Lock'}
        </Button>
      )}
    </div>
  );
}

/**
 * Small lock icon for inline display (e.g., next to section headers)
 */
export function LockIcon({
  lockInfo,
  lockedByName,
  className,
}: Pick<LockIndicatorProps, 'lockInfo' | 'lockedByName' | 'className'>) {
  const { user } = useAuthStore();

  if (!lockInfo?.is_locked) {
    return null;
  }

  const isOwnLock = lockInfo.locked_by_id === user?.id;
  const displayName = lockedByName || (isOwnLock ? 'You' : 'Another user');

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Lock
            className={cn(
              'h-4 w-4',
              isOwnLock ? 'text-green-600' : 'text-amber-600',
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{isOwnLock ? 'You have the editing lock' : `Locked by ${displayName}`}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default LockIndicator;
