import { generateId } from './utils';
import Radar from 'react-native-radar';
import 'react-native-get-random-values';
import { updateTicket } from '../api/tickets';
import { createTrip, getTrip, getTripIdByTicketId, updateTrip } from '../api/trip';

/**
 * Initialize Radar SDK
 */
const initializeRadar = (publishableKey: string) => {
  Radar.initialize(publishableKey);
};

/**
 * Request permissions for foreground and background location
 */
const requestLocationPermissions = async () => {
  const status = await Radar.getPermissionsStatus();
  if (status === 'NOT_DETERMINED') {
    console.log('Requesting foreground location permissions...');
    await Radar.requestPermissions(false);
    console.log('Requesting background location permissions...');
    await Radar.requestPermissions(true);
  }
};

/**
 * Track location once (Foreground tracking)
 */
const trackLocationOnce = async () => {
  try {
    await Radar.trackOnce();
  } catch (err) {
    console.error('Error in TrackOnce:', err);
  }
};

/**
 * Started background tracking with a combination of custom tracking and trip tracking
 */
const startBackgroundTracking = async (user_id: string, username: string, ticket_id: string, description: string, geofence_id: string, geofence_tag: string) => {
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

  try {
    // Start trip tracking (with default trip options and tracking options)
    console.log('Starting trip...');
    const result = await Radar.startTrip({
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
    console.log('Trip started successfully');
  } catch (err) {
    console.error('Error starting trip:', err);
  }

  // Prepare listener for location updates
  listenForLocationUpdates();
};

/**
 * Stop trip and background tracking
 */
const stopBackgroundTracking = async (ticket_id: string) => {
  try {
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
    console.log('Trip completed successfully');
  } catch (err) {
    console.error('Error completing trip:', err);
  }
  Radar.stopTracking();
  console.log('Background tracking stopped.');
};

/**
 * Cancel trip and stop background tracking
 */
const cancelTrip = async (ticket_id: string) => {
  try {
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
    console.log('Trip canceled successfully');
  } catch (err) {
    console.error('Error canceling trip:', err);
  }
  Radar.stopTracking();
  console.log('Background tracking stopped after trip cancellation.');
};

/**
 * Prepare listener for location updates
 */
const listenForLocationUpdates = () => {
  Radar.on('location', () => {
    console.log('Location updated');
  });
  Radar.on('events', () => {
    console.log('Events detected');
  });
  Radar.on('error', (err: any) => {
    console.error('Location tracking error:', err);
  });
};

export {
  initializeRadar,
  requestLocationPermissions,
  trackLocationOnce,
  startBackgroundTracking,
  stopBackgroundTracking,
  cancelTrip,
  listenForLocationUpdates,
};
