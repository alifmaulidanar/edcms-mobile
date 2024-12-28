import 'react-native-get-random-values';
import { v7 as uuid } from 'uuid';
import Radar from 'react-native-radar';
import { updateTicket } from '../api/tickets';
import { createTrip, getTrip, getTripIdByTicketId, updateTrip } from '../api/trip';

/**
 * Initialize Radar SDK
 */
const initializeRadar = (publishableKey: string) => {
  Radar.initialize(publishableKey);
  console.log('Radar SDK initialized successfully.');
};

/**
 * Request permissions for foreground and background location
 */
const requestLocationPermissions = async () => {
  const status = await Radar.getPermissionsStatus();
  console.log('Location permissions status:', status);

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
    const result = await Radar.trackOnce();
    // console.log('TrackOnce Result:');
    // console.log('Location:', result.location);
    // console.log('Events:', result.events);
    // console.log('User Metadata:', result.user);
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
  const tripExternalId = uuid();
  console.log('Trip externalId:', tripExternalId);

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
  // console.log('Default trip options:', defaultTripOptions);
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
  // console.log('Default tracking options:', defaultTrackingOptions);

  try {
    // Start trip tracking (with default trip options and tracking options)
    console.log('Starting trip...');
    const result = await Radar.startTrip({
      tripOptions: defaultTripOptions,
      trackingOptions: defaultTrackingOptions
    });
    console.log('startTrip()');

    trackLocationOnce();
    console.log('trackLocationOnce()');

    // Start trip tracking (with default trip options and preset "CONTINUOUS" tracking options)
    // const result = await Radar.startTrip({ tripOptions: defaultTripOptions });
    // Start continuous tracking for background updates with CONTINUOUS preset
    // Radar.startTrackingContinuous();
    // console.log('Continuous tracking started for background updates.');

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

    console.log('Trip started successfully:', result);
  } catch (err) {
    console.error('Error starting trip:', err);
  }

  // Prepare listener for location updates
  listenForLocationUpdates();

  // Start periodic trip updates
  // startPeriodicTripUpdates('trip-123');
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
    const result = await Radar.completeTrip();

    // Update ticket status to "completed" and duration in Supabase
    await updateTrip(trip_id, 'completed', tripData.duration);

    // Update ticket status to "completed" in Supabase
    await updateTicket(ticket_id, trip_id, 'completed');

    console.log('Trip completed successfully:', result);
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
    const result = await Radar.cancelTrip();

    // Update ticket status to "canceled" and duration in Supabase
    await updateTrip(trip_id, 'canceled', tripData.duration);

    // Update ticket status to "canceled" in Supabase
    await updateTicket(ticket_id, trip_id, 'canceled');

    console.log('Trip canceled successfully:', result);
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
  Radar.on('location', (result: any) => {
    console.log('Location updated:', result.location);
  });

  Radar.on('events', (result: any) => {
    console.log('Events detected:', result.events);
  });

  Radar.on('error', (err: any) => {
    console.error('Location tracking error:', err);
  });
};

/**
 * Start periodic trip updates
 */
// const startPeriodicTripUpdates = (tripId: string) => {
//   console.log(`Starting periodic trip updates for tripId: ${tripId}`);

//   // Update trip every 30 seconds
//   const updateInterval = 30000;

//   const intervalId = setInterval(async () => {
//     try {
//       const result = await Radar.updateTrip({
//         status: "unknown",
//         options: {
//           externalId: tripId, // ID trip
//           metadata: {
//             latitude: "37.773972",
//             longitude: "-122.431297",
//           },
//           destinationGeofenceTag: 'delivery-point',
//           destinationGeofenceExternalId: 'dest-123',
//         },
//       });
//       console.log('Trip updated:', result);
//     } catch (err) {
//       console.error('Error updating trip:', err);
//     }
//   }, updateInterval);

//   // Store intervalId in state
//   return intervalId;
// };

export {
  initializeRadar,
  requestLocationPermissions,
  trackLocationOnce,
  startBackgroundTracking,
  stopBackgroundTracking,
  cancelTrip,
  listenForLocationUpdates,
};
