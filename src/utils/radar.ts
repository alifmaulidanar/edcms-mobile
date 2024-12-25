import Radar from 'react-native-radar';

// Initialize Radar SDK
const initializeRadar = (publishableKey: string) => {
  Radar.initialize(publishableKey);
  console.log('Radar successfully initialized.');
};

// Request permissions for foreground and background location
const requestLocationPermissions = async () => {
  const status = await Radar.getPermissionsStatus();
  console.log('Location permissions status:', status);
  if (status === 'NOT_DETERMINED') {
    await Radar.requestPermissions(false); // Request foreground permissions first
    await Radar.requestPermissions(true);  // Request background permissions second
  }
};

// Track location once (Foreground tracking)
const trackLocationOnce = async () => {
  Radar.trackOnce().then((result) => {
    console.log('Location:', result.location);
    console.log('Events:', result.events);
    console.log('User Metadata:', result.user);
  }).catch((err) => {
    console.error('Error tracking location:', err);
  });
};

// Start background location tracking with Radar presets
const startBackgroundTracking = async (preset: 'EFFICIENT' | 'RESPONSIVE' | 'CONTINUOUS') => {
  // Request location permissions
  await requestLocationPermissions();

  // Set default trip options
  const defaultTripOptions: any = {
    externalId: '0193e9e3-7243-7610-8566-119a522a6b79',
    destinationGeofenceTag: 'jalan-raya',
    destinationGeofenceExternalId: '0193e9e3-1ae3-7efc-b981-e4c3311c7f85',
    mode: 'bike',
    approachingThreshold: 1,
  }

  // Set default tracking options
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
  }

  // Start trip
  Radar.startTrip({
    tripOptions: defaultTripOptions,
    trackingOptions: defaultTrackingOptions
  }).then((result) => {
    console.log('Trip started:', result);
  });
  console.log('Trip started...');

  // Track location once in foreground
  trackLocationOnce();
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
  console.log('Location tracked once in foreground:', now);

  // Start trip/background tracking with preset (without trip and tracking options)
  // -> this is bad if you wanna configure many things like destination, externalId, mode, etc.
  // if we use this preset, we don't need to startTrip and updateTrip manually
  // console.log('Starting background tracking with preset:', preset);
  // switch (preset) {
  //   case 'EFFICIENT':
  //     Radar.startTrackingEfficient();
  //     break;
  //   case 'RESPONSIVE':
  //     Radar.startTrackingResponsive();
  //     break;
  //   case 'CONTINUOUS':
  //     Radar.startTrackingContinuous();
  //     break;
  //   default:
  //     console.error('Invalid preset for background tracking.');
  // }

  // // Start custom background tracking
  // Radar.mockTracking({
  //   origin: { // pondok kopi arabika viii blok ac 6 no. 5
  //     latitude: -6.2324146301045875,
  //     longitude: 106.94557809708698,
  //   },
  //   destination: { // farmers pondok kopi
  //     latitude: -6.226135796446481,
  //     longitude: 106.94324735176554,
  //   },
  //   mode: 'bike', // motor
  //   steps: 1, // 1 location update
  //   interval: 30, // per 30 seconds
  // })
  // console.log('Mock tracking started...');

  // Kesimpulan mock tracking
  // 1. berhasil mendapatkan data trips dan tracking dengan baik
  // 2. perlu evaluasi dan cari kombinasi steps dan interval yg optimal
  // 3. mungkin mode 'bike' mengakibatkan perhitungan waktu (ETA) yang tidak akurat dan cenderung lebih lambar sehingga user tiba di tujuan lebih telat dari ETA
  // 4. untuk origin dan destination, sudah benar dan tidak ada masalah
  // 5. perlu cek apakah tracking dan startTrip asli akan lebih kurang sama hasilnya dengan mock tracking atau berbeda
  // 6. hasil dituju beserta implementasi yg diinginkan: startTrip, startTrackingContinuous, update trip secara otomatis (tidak ingin ada updateTrip manual), completeTrip, dan cancelTrip (butuh tombol terpisah di aplikasi)
  // 7. testing di device asli, defined konfigurasi, geofence tujuan asli, dan tracking asli

  // Update trip (seharusnya tidak perlu manual, tapi otomatis)
  Radar.updateTrip({
    status: 'started',
    options: {
      externalId: '0193e9e3-7243-7610-8566-119a522a6b79',
      mode: 'bike',
      destinationGeofenceTag: 'jalan-raya',
      destinationGeofenceExternalId: '0193e9e3-1ae3-7efc-b981-e4c3311c7f85',
      approachingThreshold: 1,
    },
  }).then((result) => {
    console.log('Trip updated:', result);
  });
  console.log('Trip updated...');

  // Set foreground service options
  // Radar.setForegroundServiceOptions({
  //   options: {
  //     text: "Pekerjaan dimulai.",
  //     title: "Lokasi diperbarui.",
  //     updatesOnly: false,
  //     importance: 2,
  //     activity: 'com.alifmaulidanar.pastitracking'
  //   }
  // });

  // Check if background tracking is active
  const isTracking = Radar.isTracking();
  console.log('Background tracking status:', isTracking);

  // Listen for location updates
  listenForLocationUpdates();
};

// Stop background location tracking
const stopBackgroundTracking = () => {
  // Complete trip
  Radar.completeTrip().then((result) => {
    console.log('Trip completed:', result);
  });
  console.log('Trip completed...');

  // Stop background tracking
  console.log('Stopping background tracking...');
  Radar.stopTracking();
};

// Cancel trip
const cancelTrip = () => {
  Radar.cancelTrip().then((result) => {
    console.log('Trip canceled:', result);
  });
  console.log('Trip canceled...');

  // Stop background tracking
  console.log('Stopping background tracking...');
  Radar.stopTracking();
};

// Event listeners for location updates
const listenForLocationUpdates = () => {
  // Listen for location updates
  Radar.on('location', (result: { location: any; }) => {
    console.log('Location updated:', result.location);
  });

  // Listen for events
  Radar.on('error', (err: any) => {
    console.error('Location error:', err);
  });
};

export {
  cancelTrip,
  initializeRadar,
  trackLocationOnce,
  stopBackgroundTracking,
  startBackgroundTracking,
  listenForLocationUpdates,
  requestLocationPermissions,
};
