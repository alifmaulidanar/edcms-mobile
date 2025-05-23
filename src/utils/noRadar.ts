import { generateId } from './utils';
import { updateTicket } from '../api/tickets';
import { cancelTripNoRadar, createTripNoRadar, endTripNoRadar, getTripIdByTicketId } from '../api/trip';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import supabase from '../utils/supabase';

/**
 * Started ticket and trip without Radar
 */
export const startTicketNew = async (user_id: string, username: string, ticket_id: string, description: string, geofence_id: string, geofence_tag: string, started_location: [number, number], started_at: string) => {
  try {
    if (!user_id) {
      handleError('Invalid user ID');
      throw new Error('Invalid user ID');
    }
    if (!username) {
      handleError('Invalid username');
      throw new Error('Invalid username');
    }
    if (!ticket_id) {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }
    if (!description) {
      handleError('Invalid description');
      throw new Error('Invalid description');
    }
    if (!geofence_id) {
      handleError('Invalid geofence ID');
      throw new Error('Invalid geofence ID');
    }
    if (!geofence_tag) {
      handleError('Invalid geofence tag');
      throw new Error('Invalid geofence tag');
    }

    handleLog('Starting trip without Radar...');

    // Generate externalId for trip
    const tripExternalId = generateId("PJ");

    // Start trip tracking (with default trip options and tracking options)
    handleLog('Starting trip...');

    // Create a new Trip in Supabase
    await createTripNoRadar(
      tripExternalId,
      user_id,
      geofence_id,
      geofence_tag,
      'bike',
      'on_progress',
      started_location,
      started_at,
    );

    // Update ticket status to "on_progress" in Supabase
    await updateTicket(ticket_id, tripExternalId, 'on_progress');
    handleLog('Trip started successfully');
  } catch (err) {
    handleError(`Error starting trip: ${err}`);
  }
};

/**
 * Stop ticket and trip without Radar
 */
export const stopTicketNew = async (ticket_id: string, ended_location?: [number, number], ended_at?: string) => {
  try {
    if (!ticket_id) {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }

    // Get tripId from Supabase by ticketId
    const trip_id = await getTripIdByTicketId(ticket_id);
    let started_at: string | undefined = undefined;
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('started_at')
        .eq('external_id', trip_id)
        .single();
      if (!error && data?.started_at) {
        started_at = data.started_at;
      }
    } catch (e) {
      handleError('Gagal mengambil started_at trip');
    }
    let duration = 0;
    if (started_at && ended_at) {
      duration = Math.floor((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000);
      if (duration < 0) duration = 0;
    }

    // Update ticket status to "completed" and duration di Supabase
    await endTripNoRadar(trip_id, 'completed', duration, ended_location, ended_at);

    // Update ticket status to "completed" in Supabase
    await updateTicket(ticket_id, trip_id, 'completed');
    handleLog('Trip completed successfully');
  } catch (err) {
    handleLog(`Error completing trip: ${err}`);
  }
};

/**
 * Cancel ticket and trip without Radar
 */
export const cancelTripNew = async (ticket_id: string) => {
  try {
    if (!ticket_id) {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }

    // Get tripId from Supabase by ticketId
    const trip_id = await getTripIdByTicketId(ticket_id);

    // Update ticket status to "canceled" and duration in Supabase
    await cancelTripNoRadar(trip_id, 'canceled');

    // Update ticket status to "canceled" in Supabase
    await updateTicket(ticket_id, trip_id, 'canceled');
    handleLog('Trip canceled successfully');
    handleLog('Background tracking stopped after trip cancellation.');
  } catch (err) {
    handleLog(`Error canceling trip: ${err}`);
  }
};