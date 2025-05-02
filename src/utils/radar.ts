import { generateId } from './utils';
import Radar from 'react-native-radar';
import { updateTicket } from '../api/tickets';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { createTrip, getTrip, getTripIdByTicketId, updateTrip } from '../api/trip';

/**
 * Initialize Radar SDK
 */
const initializeRadar = (publishableKey: string) => {
  try {
    if (!publishableKey) {
      handleError('Invalid publishable key');
      throw new Error('Invalid publishable key');
    }
    Radar.initialize(publishableKey);
  } catch (err) {
    handleError(`Error initializing Radar: ${err}`);
  }
};

/**
 * Request permissions for foreground and background location
 */
const requestLocationPermissions = async () => {
  try {
    const status = await Radar.getPermissionsStatus();
    if (status === 'NOT_DETERMINED') {
      handleLog('Requesting foreground location permissions...');
      await Radar.requestPermissions(false);
      handleLog('Requesting background location permissions...');
      await Radar.requestPermissions(true);
    }
  } catch (err) {
    handleError(`Error requesting location permissions: ${err}`);
  }
};

/**
 * Track location once (Foreground tracking)
 */
const trackLocationOnce = async () => {
  try {
    await Radar.trackOnce();
  } catch (err) {
    handleError(`Error in TrackOnce: ${err}`);
  }
};

/**
 * Started background tracking with a combination of custom tracking and trip tracking
 */
const startBackgroundTracking = async (user_id: string, username: string, ticket_id: string, description: string, geofence_id: string, geofence_tag: string) => {
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

    handleLog('Starting background tracking...');
    // Request location permissions
    await requestLocationPermissions();

    // Generate externalId for trip
    const tripExternalId = generateId("PJ");

    // Default trip options and tracking options
    const defaultTripOptions: any = {
      externalId: tripExternalId,
      destinationGeofenceTag: geofence_tag,
      destinationGeofenceExternalId: geofence_id,
      mode: 'bike',
      approachingThreshold: 1,
      startTracking: true,
      metadata: {
        tripId: tripExternalId,
        ticketId: ticket_id,
        ticketDescription: description,
        geofenceId: geofence_id,
        geofenceTag: geofence_tag,
        userId: user_id,
        username: username
      }
    };

    const defaultTrackingOptions: any = {
      desiredStoppedUpdateInterval: 30,
      fastestStoppedUpdateInterval: 30,
      desiredMovingUpdateInterval: 30,
      fastestMovingUpdateInterval: 30,
      desiredSyncInterval: 20,
      desiredAccuracy: "high",
      stopDuration: 140,
      stopDistance: 70,
      startTrackingAfter: null,
      stopTrackingAfter: null,
      replay: "none",
      sync: "all",
      useStoppedGeofence: false,
      stoppedGeofenceRadius: 0,
      useMovingGeofence: false,
      movingGeofenceRadius: 0,
      syncGeofences: true,
      syncGeofencesLimit: 0,
      foregroundServiceEnabled: true,
      beacons: false,
    };

    // Start trip tracking (with default trip options and tracking options)
    handleLog('Starting trip...');
    await Radar.startTrip({
      tripOptions: defaultTripOptions,
      trackingOptions: defaultTrackingOptions
    });
    trackLocationOnce();

    // Get trip's information from Radar
    const tripData = await getTrip(tripExternalId);

    // Create a new Trip in Supabase
    await createTrip(
      tripData.radar_id,
      tripData.external_id,
      tripData.user_id,
      tripData.geofence_id,
      tripData.geofence_tag,
      tripData.mode,
      tripData.status,
      tripData.duration,
      tripData.live,
      tripData.approaching_threshold
    );

    // Update ticket status to "on_progress" in Supabase
    await updateTicket(ticket_id, tripExternalId, 'on_progress');
    handleLog('Trip started successfully');
  } catch (err) {
    handleError(`Error starting trip: ${err}`);
  }

  // Prepare listener for location updates
  listenForLocationUpdates();
};

/**
 * Stop trip and background tracking
 */
const stopBackgroundTracking = async (ticket_id: string) => {
  try {
    if (!ticket_id) {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }

    trackLocationOnce();

    // Get tripId from Supabase by ticketId
    const trip_id = await getTripIdByTicketId(ticket_id);

    // Get trip's information from Radar
    const tripData = await getTrip(trip_id);

    // Stop trip tracking and complete trip by Radar SDK
    await Radar.completeTrip();

    // Update ticket status to "completed" and duration in Supabase
    await updateTrip(trip_id, 'completed', tripData.duration);

    // Update ticket status to "completed" in Supabase
    await updateTicket(ticket_id, trip_id, 'completed');
    handleLog('Trip completed successfully');

    // Stop background tracking
    Radar.stopTracking();
    removeLocationListeners();
    handleLog('Background tracking stopped.');
  } catch (err) {
    handleError(`Error completing trip: ${err}`);
  }
};

/**
 * Cancel trip and stop background tracking
 */
const cancelTrip = async (ticket_id: string) => {
  try {
    if (!ticket_id) {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }

    trackLocationOnce();

    // Get tripId from Supabase by ticketId
    const trip_id = await getTripIdByTicketId(ticket_id);

    // Get trip's information from Radar
    const tripData = await getTrip(trip_id);

    // Cancel trip by Radar SDK
    await Radar.cancelTrip();

    // Update ticket status to "canceled" and duration in Supabase
    await updateTrip(trip_id, 'canceled', tripData.duration);

    // Update ticket status to "canceled" in Supabase
    await updateTicket(ticket_id, trip_id, 'canceled');
    handleLog('Trip canceled successfully');

    // Stop background tracking
    Radar.stopTracking();
    removeLocationListeners();
    handleLog('Background tracking stopped after trip cancellation.');
  } catch (err) {
    handleError(`Error canceling trip: ${err}`);
  }
};

/**
 * Prepare listener for location updates
 */
const listenForLocationUpdates = () => {
  try {
    removeLocationListeners(); // Remove previous listeners to prevent duplicates
    Radar.on('location', () => {
      handleLog('Location updated');
    });
    Radar.on('events', () => {
      handleLog('Events detected');
    });
    Radar.on('error', (err: any) => {
      handleError(`Location tracking error: ${err}`);
    });
  } catch (err) {
    handleError(`Error setting up location update listeners: ${err}`);
  }
};

/**
 * Remove all location listeners
 * Call this when stopping tracking to prevent memory leaks
 */
const removeLocationListeners = () => {
  Radar.off('location');
  Radar.off('events');
  Radar.off('error');
  handleLog('Location listeners removed');
};

export {
  initializeRadar,
  startBackgroundTracking,
  stopBackgroundTracking,
  cancelTrip,
};
