import Radar from 'react-native-radar';

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
    console.log('TrackOnce Result:');
    console.log('Location:', result.location);
    console.log('Events:', result.events);
    console.log('User Metadata:', result.user);
  } catch (err) {
    console.error('Error in TrackOnce:', err);
  }
};

/**
 * Started background tracking with a combination of custom tracking and trip tracking
 */
const startBackgroundTracking = async () => {
  // Request location permissions
  await requestLocationPermissions();

  // Start custom tracking for background updates
  Radar.startTrackingCustom({
    desiredStoppedUpdateInterval: 30,
    fastestStoppedUpdateInterval: 15,
    desiredMovingUpdateInterval: 30,
    fastestMovingUpdateInterval: 10,
    desiredSyncInterval: 20,
    desiredAccuracy: 'high',
    sync: 'all',
    useStoppedGeofence: true,
    showBlueBar: true,
    foregroundServiceEnabled: true,
    // 
    stopDuration: 0,
    stopDistance: 0,
    replay: 'none',
    stoppedGeofenceRadius: 0,
    useMovingGeofence: false,
    movingGeofenceRadius: 0,
    syncGeofences: false,
    beacons: false
  });
  console.log('Custom tracking started for background updates.');

  // Defualt trip options and tracking options
  const defaultTripOptions: any = {
    tripOptions: {
      externalId: 'trip-123',
      destinationGeofenceTag: 'destination',
      destinationGeofenceExternalId: 'destination-123',
      mode: 'bike',
    },
  };
  const defaultTrackingOptions: any = {
    desiredStoppedUpdateInterval: 30,
    fastestStoppedUpdateInterval: 30,
    desiredMovingUpdateInterval: 30,
    fastestMovingUpdateInterval: 30,
    desiredSyncInterval: 20,
    desiredAccuracy: "high",
    stopDuration: 0,
    stopDistance: 0,
    startTrackingAfter: null,
    stopTrackingAfter: null,
    replay: "all",
    sync: "all",
    useStoppedGeofence: false,
    stoppedGeofenceRadius: 0,
    useMovingGeofence: false,
    movingGeofenceRadius: 0,
    syncGeofences: false,
    syncGeofencesLimit: 0,
    foregroundServiceEnabled: true,
    beacons: false,
  };

  try {
    // Start trip tracking
    const result = await Radar.startTrip({
      tripOptions: defaultTripOptions,
      trackingOptions: defaultTrackingOptions
    });
    console.log('Trip started successfully:', result);
  } catch (err) {
    console.error('Error starting trip:', err);
  }

  // Prepare listener for location updates
  listenForLocationUpdates();

  // Start periodic trip updates
  startPeriodicTripUpdates('trip-123');
};

/**
 * Stop trip and background tracking
 */
const stopBackgroundTracking = async () => {
  try {
    const result = await Radar.completeTrip();
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
const cancelTrip = async () => {
  try {
    const result = await Radar.cancelTrip();
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
const startPeriodicTripUpdates = (tripId: string) => {
  console.log(`Starting periodic trip updates for tripId: ${tripId}`);

  // Update trip every 30 seconds
  const updateInterval = 30000;

  const intervalId = setInterval(async () => {
    try {
      const result = await Radar.updateTrip({
        status: "unknown",
        options: {
          externalId: tripId, // ID trip
          metadata: {
            // driver: 'John Doe',
            // vehicleType: 'motorcycle',
            // eta: '5 mins',
            latitude: "37.773972",
            longitude: "-122.431297",
          },
          destinationGeofenceTag: 'delivery-point',
          destinationGeofenceExternalId: 'dest-123',
        },
      });
      console.log('Trip updated:', result);
    } catch (err) {
      console.error('Error updating trip:', err);
    }
  }, updateInterval);

  // Store intervalId in state
  return intervalId;
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
