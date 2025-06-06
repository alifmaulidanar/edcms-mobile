import AsyncStorage from '@react-native-async-storage/async-storage';
import { log as handleLog, error as handleError } from './logHandler';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = 'ticketActionQueueV2';
const MAX_RETRY = 5;

export type TicketActionType = 'start' | 'stop' | 'cancel' | 'extras';

export interface TicketActionQueueItem {
  type: TicketActionType;
  ticketId: string;
  data?: any;
  attempts?: number;
  createdAt: number;
  lastAttemptedAt?: number;
}

// Guard: reject if payload contains photo/file
function containsPhotoData(data: any): boolean {
  if (!data) return false;
  // Check for common photo/file keys
  if (data.photo || data.photos || data.local_uri || data.file || data.fileUri) return true;
  // Deep check for array of photos
  if (Array.isArray(data)) {
    return data.some(containsPhotoData);
  }
  if (typeof data === 'object') {
    return Object.values(data).some(containsPhotoData);
  }
  return false;
}

export async function enqueueTicketAction(item: TicketActionQueueItem) {
  if (containsPhotoData(item.data)) {
    handleError(`[TICKET_ACTION_QUEUE] Attempt to enqueue photo/file data is not allowed! TicketId: ${item.ticketId}`);
    return;
  }
  handleLog(`[TICKET_ACTION_QUEUE] Enqueue action: ${item.type} for ticket ${item.ticketId}`);
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    queue.push({ ...item, attempts: item.attempts || 0, createdAt: item.createdAt || Date.now() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    handleLog(`[TICKET_ACTION_QUEUE] Successfully enqueued action: ${item.type} for ticket ${item.ticketId}. Queue size: ${queue.length}`);
  } catch (e: any) {
    handleError(`[TICKET_ACTION_QUEUE] Failed to enqueue action ${item.type} for ticket ${item.ticketId}: ${e.message || JSON.stringify(e)}`);
  }
}

export async function processTicketActionQueue(processor: (item: TicketActionQueueItem) => Promise<void>): Promise<boolean> {
  handleLog('[TICKET_ACTION_QUEUE] Processing queue...');
  let queueChanged = false;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    let queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return false;
    let i = 0;
    while (i < queue.length) {
      const item = queue[i];
      item.lastAttemptedAt = Date.now();
      try {
        await processor(item);
        queue.splice(i, 1);
        queueChanged = true;
      } catch (e: any) {
        item.attempts = (item.attempts || 0) + 1;
        handleError(`[TICKET_ACTION_QUEUE] Action FAILED: ${item.type} for ticket ${item.ticketId}, Attempt: ${item.attempts}. Error: ${e.message || JSON.stringify(e)}`);
        if (item.attempts >= MAX_RETRY) {
          handleError(`[TICKET_ACTION_QUEUE] Action ${item.type} for ticket ${item.ticketId} failed after max retry. Dropping from queue.`);
          queue.splice(i, 1);
          queueChanged = true;
        } else {
          queue[i] = { ...item, lastAttemptedAt: Date.now() };
          i++;
        }
      }
    }
    if (queueChanged) {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }
    return queueChanged;
  } catch (e: any) {
    handleError(`[TICKET_ACTION_QUEUE] Critical error during queue processing: ${e.message || JSON.stringify(e)}`);
    return false;
  }
}

export async function hasPendingTicketActions(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    return queue.length > 0;
  } catch (e: any) {
    handleError(`[TICKET_ACTION_QUEUE] Failed to check for pending actions: ${e.message || JSON.stringify(e)}`);
    return false;
  }
}

export async function getQueueContents(): Promise<TicketActionQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e: any) {
    handleError(`[TICKET_ACTION_QUEUE] Failed to get queue contents: ${e.message || JSON.stringify(e)}`);
    return [];
  }
}

export async function clearTicketQueue() {
  handleLog('[TICKET_ACTION_QUEUE] Clearing queue...');
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
    handleLog('[TICKET_ACTION_QUEUE] Queue cleared.');
  } catch (e: any) {
    handleError(`[TICKET_ACTION_QUEUE] Failed to clear queue: ${e.message || JSON.stringify(e)}`);
  }
}

export function setupTicketQueueNetInfo(processor: (item: TicketActionQueueItem) => Promise<void>, callback?: (processedSuccessfully: boolean) => void) {
  const unsubscribe = NetInfo.addEventListener(async state => {
    if (state.isConnected) {
      handleLog('[TICKET_ACTION_QUEUE] Device online, processing queue...');
      const processed = await processTicketActionQueue(processor);
      if (callback) callback(processed);
    }
  });
  return unsubscribe;
} 