import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  ClipboardList,
  AtSign,
  Clock,
  FileCheck,
  ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';
import {
  notificationPreferencesApi,
  NotificationPreference,
  NotificationType,
} from '@/lib/api';

// Icon mapping for notification types
const notificationIcons: Record<NotificationType, React.ReactNode> = {
  approval_request: <FileCheck className="h-5 w-5" />,
  status_change: <CheckCircle className="h-5 w-5" />,
  comment: <MessageSquare className="h-5 w-5" />,
  task_assigned: <ClipboardList className="h-5 w-5" />,
  mention: <AtSign className="h-5 w-5" />,
  reminder: <Clock className="h-5 w-5" />,
};

// Color classes for notification types
const notificationColors: Record<NotificationType, string> = {
  approval_request: 'text-blue-500',
  status_change: 'text-green-500',
  comment: 'text-purple-500',
  task_assigned: 'text-orange-500',
  mention: 'text-pink-500',
  reminder: 'text-amber-500',
};

interface PreferenceRowProps {
  preference: NotificationPreference;
  onToggle: (
    type: NotificationType,
    field: 'inAppEnabled' | 'emailEnabled',
    value: boolean
  ) => void;
  isUpdating: boolean;
}

function PreferenceRow({ preference, onToggle, isUpdating }: PreferenceRowProps) {
  const type = preference.notificationType;
  const Icon = notificationIcons[type] || <Bell className="h-5 w-5" />;
  const colorClass = notificationColors[type] || 'text-gray-500';

  return (
    <div className="flex items-center justify-between py-4 px-4 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className={`mt-0.5 ${colorClass}`}>{Icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{preference.label}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {preference.description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-8 shrink-0 ml-4">
        <div className="flex items-center gap-2">
          <Switch
            id={`${type}-inapp`}
            checked={preference.inAppEnabled}
            onCheckedChange={(checked) => onToggle(type, 'inAppEnabled', checked)}
            disabled={isUpdating}
            aria-label={`Toggle in-app notifications for ${preference.label}`}
          />
          <Label
            htmlFor={`${type}-inapp`}
            className="text-xs text-muted-foreground w-12"
          >
            In-App
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id={`${type}-email`}
            checked={preference.emailEnabled}
            onCheckedChange={(checked) => onToggle(type, 'emailEnabled', checked)}
            disabled={isUpdating}
            aria-label={`Toggle email notifications for ${preference.label}`}
          />
          <Label
            htmlFor={`${type}-email`}
            className="text-xs text-muted-foreground w-12"
          >
            Email
          </Label>
        </div>
      </div>
    </div>
  );
}

export function NotificationPreferencesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updatingType, setUpdatingType] = useState<string | null>(null);

  // Fetch preferences
  const {
    data: preferencesData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await notificationPreferencesApi.getPreferences();
      return response.data.data;
    },
  });

  // Mutation for updating a single preference
  const updatePreferenceMutation = useMutation({
    mutationFn: async ({
      type,
      inAppEnabled,
      emailEnabled,
    }: {
      type: NotificationType;
      inAppEnabled: boolean;
      emailEnabled: boolean;
    }) => {
      const response = await notificationPreferencesApi.updatePreference(type, {
        inAppEnabled,
        emailEnabled,
      });
      return response.data;
    },
    onMutate: async ({ type, inAppEnabled, emailEnabled }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['notification-preferences'] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(['notification-preferences']);

      // Optimistically update
      queryClient.setQueryData(
        ['notification-preferences'],
        (old: typeof preferencesData) => {
          if (!old) return old;
          return {
            ...old,
            preferences: old.preferences.map((pref: NotificationPreference) =>
              pref.notificationType === type
                ? { ...pref, inAppEnabled, emailEnabled }
                : pref
            ),
          };
        }
      );

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['notification-preferences'], context.previousData);
      }
      toast({
        variant: 'destructive',
        title: 'Failed to update preference',
        description: 'Please try again.',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Preference updated',
        description: 'Your notification preference has been saved.',
      });
    },
    onSettled: () => {
      setUpdatingType(null);
    },
  });

  // Handle toggle
  const handleToggle = (
    type: NotificationType,
    field: 'inAppEnabled' | 'emailEnabled',
    value: boolean
  ) => {
    const currentPref = preferencesData?.preferences.find(
      (p) => p.notificationType === type
    );
    if (!currentPref) return;

    setUpdatingType(type);

    const updatedData = {
      type,
      inAppEnabled: field === 'inAppEnabled' ? value : currentPref.inAppEnabled,
      emailEnabled: field === 'emailEnabled' ? value : currentPref.emailEnabled,
    };

    updatePreferenceMutation.mutate(updatedData);
  };

  // Enable all notifications
  const handleEnableAll = () => {
    if (!preferencesData?.preferences) return;

    const updates = preferencesData.preferences.map((pref) => ({
      notificationType: pref.notificationType,
      inAppEnabled: true,
      emailEnabled: true,
    }));

    notificationPreferencesApi
      .updatePreferences(updates)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
        toast({
          title: 'All notifications enabled',
          description: 'You will receive all notification types.',
        });
      })
      .catch(() => {
        toast({
          variant: 'destructive',
          title: 'Failed to update preferences',
          description: 'Please try again.',
        });
      });
  };

  // Disable all email notifications
  const handleDisableAllEmails = () => {
    if (!preferencesData?.preferences) return;

    const updates = preferencesData.preferences.map((pref) => ({
      notificationType: pref.notificationType,
      inAppEnabled: pref.inAppEnabled,
      emailEnabled: false,
    }));

    notificationPreferencesApi
      .updatePreferences(updates)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
        toast({
          title: 'Email notifications disabled',
          description: 'You will no longer receive email notifications.',
        });
      })
      .catch(() => {
        toast({
          variant: 'destructive',
          title: 'Failed to update preferences',
          description: 'Please try again.',
        });
      });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Preferences</h1>
          <p className="text-muted-foreground">
            Manage how you receive notifications
          </p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Preferences</h1>
          <p className="text-muted-foreground">
            Manage how you receive notifications
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load notification preferences. Please try again later.
            {error instanceof Error && ` (${error.message})`}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const preferences = preferencesData?.preferences || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Link to="/profile">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Preferences</h1>
          <p className="text-muted-foreground">
            Control which notifications you receive and how
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>
            Quickly enable or disable notification groups
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleEnableAll}>
            Enable All
          </Button>
          <Button variant="outline" size="sm" onClick={handleDisableAllEmails}>
            Disable All Emails
          </Button>
        </CardContent>
      </Card>

      {/* Preferences Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Choose how you want to be notified for each type of event
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Header */}
          <div className="flex items-center justify-between py-2 px-4 mb-2 border-b">
            <div className="text-sm font-medium text-muted-foreground">
              Notification Type
            </div>
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 w-20 justify-center">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  In-App
                </span>
              </div>
              <div className="flex items-center gap-2 w-20 justify-center">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Email
                </span>
              </div>
            </div>
          </div>

          {/* Preference rows */}
          <div className="space-y-1">
            {preferences.map((preference) => (
              <PreferenceRow
                key={preference.notificationType}
                preference={preference}
                onToggle={handleToggle}
                isUpdating={
                  updatePreferenceMutation.isPending &&
                  updatingType === preference.notificationType
                }
              />
            ))}
          </div>

          {preferences.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No notification preferences found.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">About Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">In-App notifications</strong> appear in
            the notification bell in the header and on the notifications page.
          </p>
          <Separator />
          <p>
            <strong className="text-foreground">Email notifications</strong> are sent to
            your registered email address. Make sure your email is verified to receive
            these notifications.
          </p>
          <Separator />
          <p>
            Changes to your preferences are saved automatically when you toggle a
            switch.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
