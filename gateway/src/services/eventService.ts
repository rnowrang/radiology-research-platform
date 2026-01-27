/**
 * Event Service - Redis-based event bus for real-time updates.
 *
 * Provides:
 * - Event publishing to Redis streams
 * - SSE (Server-Sent Events) for frontend real-time updates
 * - Event subscription and handling
 */

import Redis from 'ioredis';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Event types matching the protocol-assistant event bus
export enum EventType {
  // Knowledge events
  FACT_CREATED = 'fact.created',
  FACT_UPDATED = 'fact.updated',
  FACT_DELETED = 'fact.deleted',
  KNOWLEDGE_BASE_UPDATED = 'knowledge_base.updated',

  // Form events
  FORM_FIELD_CHANGED = 'form.field_changed',
  FORM_SUBMITTED = 'form.submitted',
  FORM_APPROVED = 'form.approved',

  // Document events
  DOCUMENT_UPLOADED = 'document.uploaded',
  DOCUMENT_EXTRACTED = 'document.extracted',
  DOCUMENT_GENERATED = 'document.generated',

  // Coherence events
  CONFLICT_DETECTED = 'coherence.conflict_detected',
  CONFLICT_RESOLVED = 'coherence.conflict_resolved',
  COHERENCE_CHECK_COMPLETE = 'coherence.check_complete',

  // Learning events
  CORRECTION_RECORDED = 'learning.correction_recorded',
  PATTERN_LEARNED = 'learning.pattern_learned',

  // Project events
  PROJECT_CREATED = 'project.created',
  PROJECT_UPDATED = 'project.updated',
  PROJECT_STATUS_CHANGED = 'project.status_changed',
}

export enum EventPriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export interface Event {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  projectId?: string;
  userId?: string;
  institutionId?: string;
  priority: EventPriority;
  payload: Record<string, unknown>;
  correlationId?: string;
}

// Stream names
const STREAMS: Record<string, string> = {
  knowledge: 'events:knowledge',
  forms: 'events:forms',
  documents: 'events:documents',
  coherence: 'events:coherence',
  learning: 'events:learning',
  projects: 'events:projects',
  sessions: 'events:sessions',
};

class EventService {
  private redis: Redis | null = null;
  private subscriber: Redis | null = null;
  private sseClients: Map<string, Set<Response>> = new Map();
  private connected: boolean = false;

  /**
   * Connect to Redis.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
      });

      // Separate connection for pub/sub
      this.subscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
      });

      // Test connection
      await this.redis.ping();

      this.connected = true;
      console.log('[EventService] Connected to Redis');

      // Set up pub/sub listener
      this.setupSubscriber();
    } catch (error) {
      console.warn('[EventService] Redis not available:', error);
      this.redis = null;
      this.subscriber = null;
    }
  }

  /**
   * Close Redis connections.
   */
  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this.connected = false;
    console.log('[EventService] Disconnected from Redis');
  }

  /**
   * Check if Redis is available.
   */
  isConnected(): boolean {
    return this.connected && this.redis !== null;
  }

  /**
   * Set up the pub/sub subscriber.
   */
  private setupSubscriber(): void {
    if (!this.subscriber) return;

    // Subscribe to realtime channels
    const channels = Object.values(STREAMS).map((s) => `realtime:${s}`);
    this.subscriber.subscribe(...channels, (err) => {
      if (err) {
        console.error('[EventService] Failed to subscribe:', err);
      } else {
        console.log('[EventService] Subscribed to realtime channels');
      }
    });

    // Handle incoming messages
    this.subscriber.on('message', (channel, message) => {
      try {
        const event = JSON.parse(message) as Event;
        this.broadcastToSSE(event);
      } catch (error) {
        console.error('[EventService] Failed to parse message:', error);
      }
    });
  }

  /**
   * Get the stream name for an event type.
   */
  private getStreamForEvent(eventType: EventType): string {
    const prefix = eventType.split('.')[0];
    const mapping: Record<string, string> = {
      fact: 'knowledge',
      knowledge_base: 'knowledge',
      form: 'forms',
      document: 'documents',
      coherence: 'coherence',
      learning: 'learning',
      project: 'projects',
      session: 'sessions',
    };
    return STREAMS[mapping[prefix] || 'projects'] || STREAMS.projects;
  }

  /**
   * Publish an event to Redis streams.
   */
  async publish(event: Omit<Event, 'eventId' | 'timestamp'>): Promise<string | null> {
    if (!this.redis) return null;

    const fullEvent: Event = {
      ...event,
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    const stream = this.getStreamForEvent(event.eventType);

    try {
      // Add to stream
      const messageId = await this.redis.xadd(
        stream,
        '*',
        'event_id', fullEvent.eventId,
        'event_type', fullEvent.eventType,
        'timestamp', fullEvent.timestamp,
        'project_id', fullEvent.projectId || '',
        'user_id', fullEvent.userId || '',
        'institution_id', fullEvent.institutionId || '',
        'priority', fullEvent.priority,
        'payload', JSON.stringify(fullEvent.payload),
        'correlation_id', fullEvent.correlationId || ''
      );

      // Also publish to pub/sub for real-time
      await this.redis.publish(
        `realtime:${stream}`,
        JSON.stringify(fullEvent)
      );

      return messageId;
    } catch (error) {
      console.error('[EventService] Failed to publish event:', error);
      return null;
    }
  }

  /**
   * Publish a form field changed event.
   */
  async publishFormFieldChanged(
    projectId: string,
    formId: string,
    fieldId: string,
    oldValue: unknown,
    newValue: unknown,
    userId: string,
    correlationId?: string
  ): Promise<string | null> {
    return this.publish({
      eventType: EventType.FORM_FIELD_CHANGED,
      projectId,
      userId,
      priority: EventPriority.NORMAL,
      payload: {
        formId,
        fieldId,
        oldValue,
        newValue,
      },
      correlationId,
    });
  }

  /**
   * Publish a conflict detected event.
   */
  async publishConflictDetected(
    projectId: string,
    factKey: string,
    value1: unknown,
    value2: unknown,
    source1: string,
    source2: string,
    correlationId?: string
  ): Promise<string | null> {
    return this.publish({
      eventType: EventType.CONFLICT_DETECTED,
      projectId,
      priority: EventPriority.HIGH,
      payload: {
        factKey,
        value1,
        value2,
        source1,
        source2,
      },
      correlationId,
    });
  }

  /**
   * Publish a correction recorded event.
   */
  async publishCorrectionRecorded(
    projectId: string,
    fieldId: string,
    originalValue: unknown,
    correctedValue: unknown,
    userId: string,
    institutionId?: string,
    correlationId?: string
  ): Promise<string | null> {
    return this.publish({
      eventType: EventType.CORRECTION_RECORDED,
      projectId,
      userId,
      institutionId,
      priority: EventPriority.LOW,
      payload: {
        fieldId,
        originalValue,
        correctedValue,
      },
      correlationId,
    });
  }

  // ==========================================================================
  // SSE (Server-Sent Events) for Frontend
  // ==========================================================================

  /**
   * Register an SSE client for real-time updates.
   */
  registerSSEClient(projectId: string, res: Response): void {
    if (!this.sseClients.has(projectId)) {
      this.sseClients.set(projectId, new Set());
    }
    this.sseClients.get(projectId)!.add(res);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);

    // Clean up on close
    res.on('close', () => {
      this.sseClients.get(projectId)?.delete(res);
      if (this.sseClients.get(projectId)?.size === 0) {
        this.sseClients.delete(projectId);
      }
    });
  }

  /**
   * Broadcast an event to all SSE clients for a project.
   */
  private broadcastToSSE(event: Event): void {
    if (!event.projectId) return;

    const clients = this.sseClients.get(event.projectId);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(event);
    clients.forEach((res) => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch {
        // Client disconnected
        clients.delete(res);
      }
    });
  }

  /**
   * Get stream info for monitoring.
   */
  async getStreamInfo(streamName: string): Promise<Record<string, unknown> | null> {
    if (!this.redis) return null;

    const stream = STREAMS[streamName] || streamName;

    try {
      const info = await this.redis.xinfo('STREAM', stream);
      return {
        length: info[1],
        firstEntry: info[3],
        lastEntry: info[5],
      };
    } catch {
      return { length: 0, error: 'Stream not found' };
    }
  }
}

// Singleton instance
let eventService: EventService | null = null;

/**
 * Get the event service singleton.
 */
export function getEventService(): EventService {
  if (!eventService) {
    eventService = new EventService();
  }
  return eventService;
}

/**
 * Initialize and return the event service.
 */
export async function initEventService(): Promise<EventService> {
  const service = getEventService();
  await service.connect();
  return service;
}

export default EventService;
