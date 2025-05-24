import { updateTicketExtras } from '../api/tickets';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log as handleLog, error as handleError } from './logHandler';
import { startTicketNew, stopTicketNew, cancelTripNew } from './noRadar';
import { getSelectedTicketFromStorage, setSelectedTicketToStorage } from '../screens/MainScreen';

const QUEUE_KEY = 'ticketActionQueue';
const TICKET_EXTRAS_QUEUE_KEY = 'ticketExtrasQueue';
const MAX_RETRY = 5; // Increased max retry attempts
const BASE_RETRY_DELAY = 3000; // ms, base delay for exponential backoff
const MAX_RETRY_DELAY = 60000; // ms, maximum delay for exponential backoff

let isProcessingQueue = false;
let isProcessingExtrasQueue = false;

export type TicketActionType = 'start' | 'stop' | 'cancel';

export interface TicketActionQueueItem {
  type: TicketActionType;
  ticketId: string;
  data?: any;
  attempts?: number;
  createdAt: number; // Timestamp for when the action was originally created
  lastAttemptedAt?: number; // Timestamp for the last processing attempt
}

export interface TicketExtrasQueueItem {
  ticketId: string;
  extrasData: any;
  attempts?: number;
  createdAt: number; // Timestamp for when the action was originally created
  lastAttemptedAt?: number; // Timestamp for the last processing attempt
}

// Add action to queue
export async function enqueueTicketAction(item: TicketActionQueueItem) {
  handleLog(`[QUEUE] Attempting to enqueue action: ${item.type} for ticket ${item.ticketId}`);
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    queue.push({ ...item, attempts: item.attempts || 0, createdAt: item.createdAt || Date.now() });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    handleLog(`[QUEUE] Successfully enqueued action: ${item.type} for ticket ${item.ticketId}. Queue size: ${queue.length}`);
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[QUEUE] Failed to enqueue action ${item.type} for ticket ${item.ticketId}: ${errorMessage}`);
  }
}

// Add ticket extras to queue
export async function enqueueTicketExtras(item: TicketExtrasQueueItem) {
  handleLog(`[EXTRAS QUEUE] Attempting to enqueue extras for ticket ${item.ticketId}`);
  try {
    const raw = await AsyncStorage.getItem(TICKET_EXTRAS_QUEUE_KEY);
    const queue: TicketExtrasQueueItem[] = raw ? JSON.parse(raw) : [];
    queue.push({ ...item, attempts: item.attempts || 0, createdAt: item.createdAt || Date.now() });
    await AsyncStorage.setItem(TICKET_EXTRAS_QUEUE_KEY, JSON.stringify(queue));
    handleLog(`[EXTRAS QUEUE] Successfully enqueued extras for ticket ${item.ticketId}. Queue size: ${queue.length}`);
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[EXTRAS QUEUE] Failed to enqueue extras for ticket ${item.ticketId}: ${errorMessage}`);
  }
}

// Process queue (call this on NetInfo online or app start)
export async function processTicketActionQueue(): Promise<boolean> {
  handleLog('[QUEUE] Attempting to process ticket action queue.');
  if (isProcessingQueue) {
    handleLog('[QUEUE] Queue processing already in progress. Skipping.');
    return false;
  }

  isProcessingQueue = true;
  handleLog('[QUEUE] Started processing ticket action queue.');

  let queueChangedOverall = false;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    let queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    handleLog(`[QUEUE] Current queue size: ${queue.length}`);

    if (queue.length === 0) {
      handleLog('[QUEUE] Queue is empty. Nothing to process.');
      return false; // No actions processed
    }

    let i = 0;
    while (i < queue.length) {
      const item = queue[i];
      item.lastAttemptedAt = Date.now();
      handleLog(`[QUEUE] Processing action: ${item.type} for ticket ${item.ticketId}, Attempt: ${(item.attempts || 0) + 1}`);
      try {
        await processSingleAction(item);
        handleLog(`[QUEUE] Action SUCCEEDED: ${item.type} for ticket ${item.ticketId}`);
        queue.splice(i, 1); // remove if success
        queueChangedOverall = true;
        // No increment for i, as the next item is now at current index i
      } catch (e: any) {
        item.attempts = (item.attempts || 0) + 1;
        const errorMessage = e.message ? e.message : JSON.stringify(e);
        handleError(`[QUEUE] Action FAILED: ${item.type} for ticket ${item.ticketId}, Attempt: ${item.attempts}. Error: ${errorMessage}`);
        if (item.attempts >= MAX_RETRY) {
          handleError(`[QUEUE] Action ${item.type} for ticket ${item.ticketId} failed after max retry (${MAX_RETRY}). Dropping from queue.`);
          queue.splice(i, 1); // drop after max retry
          queueChangedOverall = true;
          // No increment for i here either, as item is removed.
        } else {
          const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, (item.attempts || 1) - 1), MAX_RETRY_DELAY);
          handleLog(`[QUEUE] Action ${item.type} for ticket ${item.ticketId} will be retried. Next attempt delay: ${delay}ms. Total attempts: ${item.attempts}`);
          // Update item in queue with new attempt count and last attempted time
          queue[i] = { ...item, lastAttemptedAt: Date.now() };
          i++; // Move to next item, this one will be retried later in a subsequent processTicketActionQueue call
        }
      }
    }

    if (queueChangedOverall) {
      handleLog(`[QUEUE] Queue changed. Updating AsyncStorage. New queue size: ${queue.length}`);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }

    return queueChangedOverall; // Return true if any action was processed or removed

  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[QUEUE] Critical error during queue processing loop: ${errorMessage}`);
    return false; // Indicate no successful processing or change due to error
  } finally {
    isProcessingQueue = false;
    handleLog('[QUEUE] Finished processing ticket action queue.');
  }
}

// Process extras queue (call this on NetInfo online or app start)
export async function processTicketExtrasQueue(): Promise<boolean> {
  handleLog('[EXTRAS QUEUE] Attempting to process ticket extras queue.');
  if (isProcessingExtrasQueue) {
    handleLog('[EXTRAS QUEUE] Queue processing already in progress. Skipping.');
    return false;
  }

  isProcessingExtrasQueue = true;
  handleLog('[EXTRAS QUEUE] Started processing ticket extras queue.');

  let queueChangedOverall = false;
  try {
    const raw = await AsyncStorage.getItem(TICKET_EXTRAS_QUEUE_KEY);
    let queue: TicketExtrasQueueItem[] = raw ? JSON.parse(raw) : [];
    handleLog(`[EXTRAS QUEUE] Current queue size: ${queue.length}`);

    if (queue.length === 0) {
      handleLog('[EXTRAS QUEUE] Queue is empty. Nothing to process.');
      return false; // No extras processed
    }

    let i = 0;
    while (i < queue.length) {
      const item = queue[i];
      item.lastAttemptedAt = Date.now();
      handleLog(`[EXTRAS QUEUE] Processing extras for ticket ${item.ticketId}, Attempt: ${(item.attempts || 0) + 1}`);
      try {
        await processTicketExtras(item);
        handleLog(`[EXTRAS QUEUE] Extras SUCCEEDED for ticket ${item.ticketId}`);
        queue.splice(i, 1); // remove if success
        queueChangedOverall = true;
        // No increment for i, as the next item is now at current index i
      } catch (e: any) {
        item.attempts = (item.attempts || 0) + 1;
        const errorMessage = e.message ? e.message : JSON.stringify(e);
        handleError(`[EXTRAS QUEUE] Extras FAILED for ticket ${item.ticketId}, Attempt: ${item.attempts}. Error: ${errorMessage}`);
        if (item.attempts >= MAX_RETRY) {
          handleError(`[EXTRAS QUEUE] Extras for ticket ${item.ticketId} failed after max retry (${MAX_RETRY}). Dropping from queue.`);
          queue.splice(i, 1); // drop after max retry
          queueChangedOverall = true;
          // No increment for i here either, as item is removed.
        } else {
          const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, (item.attempts || 1) - 1), MAX_RETRY_DELAY);
          handleLog(`[EXTRAS QUEUE] Extras for ticket ${item.ticketId} will be retried. Next attempt delay: ${delay}ms. Total attempts: ${item.attempts}`);
          // Update item in queue with new attempt count and last attempted time
          queue[i] = { ...item, lastAttemptedAt: Date.now() };
          i++; // Move to next item, this one will be retried later in a subsequent call
        }
      }
    }

    if (queueChangedOverall) {
      handleLog(`[EXTRAS QUEUE] Queue changed. Updating AsyncStorage. New queue size: ${queue.length}`);
      await AsyncStorage.setItem(TICKET_EXTRAS_QUEUE_KEY, JSON.stringify(queue));
    }
    return queueChangedOverall; // Return true if any extras were processed or removed
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[EXTRAS QUEUE] Critical error during queue processing loop: ${errorMessage}`);
    return false; // Indicate no successful processing or change due to error
  } finally {
    isProcessingExtrasQueue = false;
    handleLog('[EXTRAS QUEUE] Finished processing ticket extras queue.');
  }
}

// Process a single action
async function processSingleAction(item: TicketActionQueueItem) {
  handleLog(`[QUEUE] Executing API call for action: ${item.type}, Ticket ID: ${item.ticketId}`);
  switch (item.type) {
    case 'start':
      if (!item.data) throw new Error('Missing data for start action');
      await startTicketNew(
        item.data.user_id,
        item.data.username,
        item.ticketId,
        item.data.description,
        item.data.geofence_id,
        item.data.geofence_tag,
        item.data.started_location,
        item.data.started_at
      );

      // 2. Update local storage
      const currentTicket = await getSelectedTicketFromStorage();
      if (currentTicket && currentTicket.ticket_id === item.ticketId) {
        const updatedTicket = {
          ...currentTicket,
          status: 'on_progress',
          updated_at: new Date().toISOString() // Tambahkan timestamp update
        };

        // 3. Simpan ke AsyncStorage dan state
        await setSelectedTicketToStorage(updatedTicket);
        handleLog(`Updated ticket in storage: ${JSON.stringify(updatedTicket)}`);
      }
      break;
    case 'stop':
      if (!item.data) throw new Error('Missing data for stop action');
      await stopTicketNew(item.ticketId, item.data.ended_location, item.data.ended_at);
      break;
    case 'cancel':
      await cancelTripNew(item.ticketId);
      break;
    default:
      handleError(`[QUEUE] Unknown action type: ${item.type} for ticket ${item.ticketId}`);
      throw new Error('Unknown action type');
  }
  handleLog(`[QUEUE] Successfully executed API call for action: ${item.type}, Ticket ID: ${item.ticketId} `);
}

// Process a single ticket extras item
async function processTicketExtras(item: TicketExtrasQueueItem) {
  handleLog(`[EXTRAS QUEUE] Executing API call for ticket extras, Ticket ID: ${item.ticketId} `);
  await updateTicketExtras(item.ticketId, item.extrasData);
  handleLog(`[EXTRAS QUEUE] Successfully executed API call for ticket extras, Ticket ID: ${item.ticketId} `);
}

// Listen for network changes and process queue when online
export function setupTicketQueueNetInfo(callback?: (processedSuccessfully: boolean, queueStillHasPending: boolean) => void) {
  handleLog('[QUEUE] Setting up NetInfo listener for ticket queue.');
  const unsubscribe = NetInfo.addEventListener(async state => {
    handleLog(`[QUEUE] Network state changed.IsConnected: ${state.isConnected} `);
    if (state.isConnected) {
      handleLog('[QUEUE] Network is connected. Triggering queue processing.');
      // 1. Cek status tracking sebelum proses queue
      // const storedTicket = await getSelectedTicketFromStorage();
      // const isTracking = !!(await AsyncStorage.getItem("startTime")) && !!storedTicket;

      // 2. Proses queue
      const processedActions = await processTicketActionQueue();
      const processedExtras = await processTicketExtrasQueue();

      // 3. Update callback dengan status tracking
      if (callback) {
        const stillPendingActions = await hasPendingTicketActions();
        const stillPendingExtras = await hasPendingTicketExtras();
        callback(processedActions || processedExtras, stillPendingActions || stillPendingExtras);
      }
    }
  });
  return unsubscribe; // Return the unsubscribe function
}

// For UI: check if there are pending actions
export async function hasPendingTicketActions(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: TicketActionQueueItem[] = raw ? JSON.parse(raw) : [];
    return queue.length > 0;
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[QUEUE] Failed to check for pending actions: ${errorMessage} `);
    return false; // Assume no pending actions if error occurs
  }
}

// For UI: check if there are pending extras submissions
export async function hasPendingTicketExtras(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(TICKET_EXTRAS_QUEUE_KEY);
    const queue: TicketExtrasQueueItem[] = raw ? JSON.parse(raw) : [];
    return queue.length > 0;
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[EXTRAS QUEUE] Failed to check for pending ticket extras: ${errorMessage} `);
    return false; // Assume no pending ticket extras if error occurs
  }
}

// Check for any pending queue items (actions or extras)
export async function hasPendingQueueItems(): Promise<boolean> {
  const hasActions = await hasPendingTicketActions();
  const hasExtras = await hasPendingTicketExtras();
  return hasActions || hasExtras;
}

export async function getQueueContents(): Promise<TicketActionQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[QUEUE] Failed to get queue contents: ${errorMessage} `);
    return [];
  }
}

export async function getExtrasQueueContents(): Promise<TicketExtrasQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(TICKET_EXTRAS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[EXTRAS QUEUE] Failed to get extras queue contents: ${errorMessage} `);
    return [];
  }
}

export async function clearTicketQueue() {
  handleLog('[QUEUE] Attempting to clear ticket action queue.');
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
    handleLog('[QUEUE] Successfully cleared ticket action queue.');
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[QUEUE] Failed to clear ticket action queue: ${errorMessage} `);
  }
}

export async function clearTicketExtrasQueue() {
  handleLog('[EXTRAS QUEUE] Attempting to clear ticket extras queue.');
  try {
    await AsyncStorage.removeItem(TICKET_EXTRAS_QUEUE_KEY);
    handleLog('[EXTRAS QUEUE] Successfully cleared ticket extras queue.');
  } catch (e: any) {
    const errorMessage = e.message ? e.message : JSON.stringify(e);
    handleError(`[EXTRAS QUEUE] Failed to clear ticket extras queue: ${errorMessage} `);
  }
}
