/**
 * Event Store - Real-time event management using SSE
 *
 * Manages:
 * - SSE connection to project events
 * - Event history and notifications
 * - Callbacks for event types
 */

import { create } from 'zustand';
import { subscribeToProjectEvents } from '@/lib/intelligenceApi';

export interface ProjectEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface EventNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  projectId?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

interface EventCallback {
  id: string;
  eventTypes: string[];
  callback: (event: ProjectEvent) => void;
}

interface EventState {
  // Connection
  isConnected: boolean;
  connectionError: string | null;
  currentProjectId: string | null;
  eventSource: EventSource | null;

  // Events
  recentEvents: ProjectEvent[];
  maxEventHistory: number;

  // Notifications
  notifications: EventNotification[];
  unreadCount: number;

  // Callbacks
  callbacks: EventCallback[];

  // Actions
  connect: (projectId: string) => void;
  disconnect: () => void;
  addCallback: (eventTypes: string[], callback: (event: ProjectEvent) => void) => string;
  removeCallback: (callbackId: string) => void;
  addNotification: (notification: Omit<EventNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  // Initial state
  isConnected: false,
  connectionError: null,
  currentProjectId: null,
  eventSource: null,
  recentEvents: [],
  maxEventHistory: 100,
  notifications: [],
  unreadCount: 0,
  callbacks: [],

  // Connect to project events
  connect: (projectId: string) => {
    const state = get();

    // Already connected to this project
    if (state.currentProjectId === projectId && state.isConnected) {
      return;
    }

    // Disconnect from previous project
    if (state.eventSource) {
      state.eventSource.close();
    }

    set({
      currentProjectId: projectId,
      isConnected: false,
      connectionError: null,
    });

    try {
      const eventSource = subscribeToProjectEvents(
        projectId,
        (event) => {
          const projectEvent: ProjectEvent = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: event.type,
            timestamp: new Date().toISOString(),
            data: event.data as Record<string, unknown>,
          };

          // Add to history
          set((state) => ({
            recentEvents: [
              projectEvent,
              ...state.recentEvents.slice(0, state.maxEventHistory - 1),
            ],
          }));

          // Trigger callbacks
          const callbacks = get().callbacks;
          for (const cb of callbacks) {
            if (cb.eventTypes.includes('*') || cb.eventTypes.includes(event.type)) {
              try {
                cb.callback(projectEvent);
              } catch (error) {
                console.error('Event callback error:', error);
              }
            }
          }

          // Auto-generate notifications for certain event types
          const notificationEvent = getNotificationForEvent(projectEvent);
          if (notificationEvent) {
            get().addNotification(notificationEvent);
          }
        },
        (error) => {
          console.error('SSE connection error:', error);
          set({
            isConnected: false,
            connectionError: 'Connection lost. Reconnecting...',
          });

          // Attempt reconnection after delay
          setTimeout(() => {
            const currentState = get();
            if (currentState.currentProjectId === projectId) {
              currentState.connect(projectId);
            }
          }, 5000);
        }
      );

      eventSource.onopen = () => {
        set({
          isConnected: true,
          connectionError: null,
          eventSource,
        });
      };

      set({ eventSource });
    } catch (error) {
      set({
        isConnected: false,
        connectionError: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  },

  // Disconnect from events
  disconnect: () => {
    const { eventSource } = get();
    if (eventSource) {
      eventSource.close();
    }
    set({
      isConnected: false,
      eventSource: null,
      currentProjectId: null,
    });
  },

  // Add callback for events
  addCallback: (eventTypes: string[], callback: (event: ProjectEvent) => void) => {
    const callbackId = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      callbacks: [...state.callbacks, { id: callbackId, eventTypes, callback }],
    }));
    return callbackId;
  },

  // Remove callback
  removeCallback: (callbackId: string) => {
    set((state) => ({
      callbacks: state.callbacks.filter((cb) => cb.id !== callbackId),
    }));
  },

  // Add notification
  addNotification: (notification) => {
    const newNotification: EventNotification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }));
  },

  // Mark notification as read
  markNotificationRead: (notificationId: string) => {
    set((state) => {
      const notification = state.notifications.find((n) => n.id === notificationId);
      if (notification && !notification.read) {
        return {
          notifications: state.notifications.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        };
      }
      return state;
    });
  },

  // Mark all notifications as read
  markAllNotificationsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  // Clear all notifications
  clearNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
    });
  },
}));

// Helper to generate notifications for certain event types
function getNotificationForEvent(
  event: ProjectEvent
): Omit<EventNotification, 'id' | 'timestamp' | 'read'> | null {
  switch (event.type) {
    case 'conflict.detected':
      return {
        type: 'warning',
        title: 'Conflict Detected',
        message: `A consistency issue was found: ${(event.data as any).description || 'Review needed'}`,
        projectId: (event.data as any).project_id,
        action: {
          label: 'Review',
          href: `/projects/${(event.data as any).project_id}/intelligence?mode=review`,
        },
      };

    case 'conflict.resolved':
      return {
        type: 'success',
        title: 'Conflict Resolved',
        message: 'A consistency issue has been resolved.',
        projectId: (event.data as any).project_id,
      };

    case 'fact.created':
    case 'fact.updated':
      // Don't notify for every fact update
      return null;

    case 'coherence.score_changed':
      const score = (event.data as any).new_score;
      if (score < 70) {
        return {
          type: 'warning',
          title: 'Coherence Score Dropped',
          message: `Your coherence score has dropped to ${score}%. Review recommended.`,
          projectId: (event.data as any).project_id,
          action: {
            label: 'Review',
            href: `/projects/${(event.data as any).project_id}/intelligence?mode=review`,
          },
        };
      }
      return null;

    default:
      return null;
  }
}

export default useEventStore;
