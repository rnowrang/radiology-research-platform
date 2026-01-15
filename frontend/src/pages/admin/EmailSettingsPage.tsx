import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Mail,
  Server,
  Shield,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { emailApi } from '@/lib/api';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  from: string;
  fromName: string;
  appUrl: string;
  isConfigured: boolean;
}

export function EmailSettingsPage() {
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const queryClient = useQueryClient();

  // Fetch email configuration
  const { data: configData, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['emailConfig'],
    queryFn: async () => {
      const response = await emailApi.getConfig();
      return response.data.data as EmailConfig;
    },
  });

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await emailApi.testEmail(email);
      return response.data;
    },
    onSuccess: (data) => {
      setTestResult({
        success: data.success,
        message: data.message,
      });
    },
    onError: (error: any) => {
      setTestResult({
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to send test email',
      });
    },
  });

  // Verify connection mutation
  const verifyMutation = useMutation({
    mutationFn: async () => {
      const response = await emailApi.verifyConnection();
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailConfig'] });
    },
  });

  const handleSendTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail.trim()) return;
    setTestResult(null);
    sendTestMutation.mutate(testEmail);
  };

  const config = configData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Email Settings</h1>
          <p className="text-muted-foreground">
            View email configuration and send test emails
          </p>
        </div>
      </div>

      {/* Configuration Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                SMTP Configuration
              </CardTitle>
              <CardDescription>
                Current email server configuration
              </CardDescription>
            </div>
            {config && (
              <Badge variant={config.isConfigured ? 'default' : 'secondary'}>
                {config.isConfigured ? 'Configured' : 'Not Configured'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingConfig ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : config ? (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Server Settings */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Server Settings</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">SMTP Host</span>
                    <span className="font-mono text-sm">{config.host}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Port</span>
                    <span className="font-mono text-sm">{config.port}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Secure (TLS)</span>
                    <Badge variant={config.secure ? 'default' : 'secondary'}>
                      {config.secure ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Authentication */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">Authentication</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Username</span>
                    <span className="font-mono text-sm">{config.user}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">Password</span>
                    {config.hasPassword ? (
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-600">Set</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-amber-600">Not Set</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sender Settings */}
              <div className="space-y-4 md:col-span-2">
                <h3 className="font-medium text-sm text-muted-foreground">Sender Settings</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">From Address</span>
                    <span className="font-mono text-sm">{config.from}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                    <span className="text-sm text-muted-foreground">From Name</span>
                    <span className="text-sm">{config.fromName}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md md:col-span-2">
                    <span className="text-sm text-muted-foreground">App URL (for links)</span>
                    <span className="font-mono text-sm">{config.appUrl}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load configuration
            </div>
          )}

          {/* Verify Connection Button */}
          {config?.isConfigured && (
            <div className="mt-6 pt-6 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Connection Status</h3>
                  <p className="text-sm text-muted-foreground">
                    Verify that the SMTP server is reachable
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : verifyMutation.isSuccess ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                      Connected
                    </>
                  ) : verifyMutation.isError ? (
                    <>
                      <XCircle className="mr-2 h-4 w-4 text-red-600" />
                      Failed
                    </>
                  ) : (
                    'Verify Connection'
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Test Email
          </CardTitle>
          <CardDescription>
            Send a test email to verify the configuration is working correctly
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!config?.isConfigured && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Email Not Configured</AlertTitle>
              <AlertDescription>
                SMTP settings are not fully configured. Please set the environment variables
                (SMTP_HOST, SMTP_USER, SMTP_PASS) to enable email functionality.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSendTest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Recipient Email Address</Label>
              <div className="flex gap-2">
                <Input
                  id="testEmail"
                  type="email"
                  placeholder="Enter email address..."
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!testEmail.trim() || sendTestMutation.isPending}
                >
                  {sendTestMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Test
                    </>
                  )}
                </Button>
              </div>
            </div>

            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertTitle>{testResult.success ? 'Success' : 'Failed'}</AlertTitle>
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Email Templates Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Templates
          </CardTitle>
          <CardDescription>
            The platform uses the following email templates for notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: 'Form Submitted',
                description: 'Sent to reviewers when a form is submitted for review',
              },
              {
                name: 'Review Decision',
                description: 'Sent when a form is approved, rejected, or changes requested',
              },
              {
                name: 'Task Assigned',
                description: 'Sent when a task is assigned to a user',
              },
              {
                name: 'Comment Notification',
                description: 'Sent when a comment is added to a form',
              },
              {
                name: 'Mention Notification',
                description: 'Sent when a user is mentioned in a comment',
              },
              {
                name: 'Password Reset',
                description: 'Sent when a user requests a password reset',
              },
              {
                name: 'Welcome Email',
                description: 'Sent to new users when their account is created',
              },
              {
                name: 'Deadline Reminder',
                description: 'Sent to remind users of upcoming deadlines',
              },
            ].map((template) => (
              <div
                key={template.name}
                className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <h4 className="font-medium text-sm">{template.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {template.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
