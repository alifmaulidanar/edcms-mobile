import moment from "moment-timezone";
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import NetInfo from '@react-native-community/netinfo';
import { Geofence, QueueItem, Ticket } from '../types';
import { getCurrentPositionAsync } from 'expo-location';
import { saveToLibraryAsync } from 'expo-media-library';
import { RadioButton, Checkbox } from 'react-native-paper';
import BackgroundJob from 'react-native-background-actions';
import { requestPermissionsAsync } from 'expo-media-library';
import { startUploadService } from "../utils/backgroundUploader";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchCameraAsync, MediaTypeOptions } from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getTicketsWithGeofences, updateTicketExtras } from '../api/tickets';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { addTimestampToPhoto } from "../components/ImageTimestampAndLocation";
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl, Image, ActivityIndicator, TextInput } from "react-native";

const requiredPhotoCount = parseInt(process.env.EXPO_PUBLIC_REQUIRED_PHOTO_COUNT || '8');
// const ticketExtrasFlag = process.env.EXPO_PUBLIC_FEATURE_FLAG_ENABLE_TICKET_EXTRAS;

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
  Settings: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const MainScreen: React.FC<Props> = ({ navigation }) => {
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [timestamp, setTimestamp] = useState(moment().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm:ss"));
  const [tracking, setTracking] = useState(false);
  const [time, setTime] = useState(0);  // To store the time in seconds
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [additionalInfoModalVisible, setAdditionalInfoModalVisible] = useState(false);
  const [ticketExtrasModalVisible, setTicketExtrasModalVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [currentTicketID, setCurrentTicketID] = useState<string | null>(null);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [isPhotoProcessed, setIsPhotoProcessed] = useState(false);
  const [isSubmittingTicketExtras, setIsSubmittingTicketExtras] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  // const [ticketExtrasFlag, setTicketExtrasFlag] = useState<string>("true"); // Default to show ticket extras

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // AsyncStorage.removeItem("uploadQueue");
    // setIsPhotoProcessed(false);
    const init = async () => {
      // if (BackgroundJob.isRunning()) {
      //   await stopUploadService();
      // }
      // if (!BackgroundJob.isRunning()) {
      //   await startUploadService();
      // }
      try {
        const queue = await AsyncStorage.getItem('uploadQueue');
        const isRunning = BackgroundJob.isRunning();
        handleLog(`Background service status: ${isRunning}`);
        if (!isRunning && queue && JSON.parse(queue).length > 0) {
          try {
            await startUploadService();
            handleLog('Starting background service...');
          } catch (error) {
            handleError(`Gagal memulai BackgroundJob: ${error}`);
          }
        }
      } catch (error: any) {
        handleError(`Init error: ${error}`);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedTicket?.geofence_id) {
      const geofenceData = geofence.find((t) => t.external_id === selectedTicket.geofence_id);
      if (geofenceData && geofenceData.coordinates) {
        const [longitude, latitude] = geofenceData.coordinates;
        fetchAddressFromCoordinates(latitude, longitude);
      }
    }
  }, [selectedTicket, geofence]);

  // NEW optimized function that fetches tickets WITH their geofence data in one query
  const fetchTicketsWithGeofences = useCallback(async () => {
    try {
      if (!userData?.user_id) {
        handleError("User data is missing");
        return;
      }

      const assignedTicketsWithGeofences = await getTicketsWithGeofences(userData.user_id, 'assigned');
      if (assignedTicketsWithGeofences.length > 0) {
        const ticketsData = assignedTicketsWithGeofences.map(item => {
          const { geofence_data, ...ticketOnly } = item;
          return ticketOnly;
        });
        const geofencesData = assignedTicketsWithGeofences
          .filter(item => item.geofence_data) // Only include tickets that have geofence data
          .map(item => item.geofence_data);
        setTickets(ticketsData);
        setGeofence(geofencesData);
        handleLog(`✅ Optimized fetch: ${ticketsData.length} tickets with ${geofencesData.length} geofences`);
      } else {
        handleLog("No assigned tickets found");
      }
    } catch (error: any) {
      handleError(`Error in optimized fetch: ${error.message}`);
    }
  }, [userData]);

  // Fetch tickets using the optimized method
  useEffect(() => {
    fetchTicketsWithGeofences();
  }, [fetchTicketsWithGeofences]);

  // Handle pull-to-refresh with optimized approach
  const onRefresh = async () => {
    setIsRefreshing(true);
    setSelectedTicket(null);
    setCurrentTicketID(null);
    await fetchTicketsWithGeofences();
    setIsRefreshing(false);
  };

  // Handle Start Tracking (Start Trip)
  const handleStart = async () => {
    if (!selectedTicket) {
      Alert.alert("Tidak ada tiket yg dipilih", "Silakan pilih tiket sebelum memulai pekerjaan.");
      return;
    }
    if (!geofence || geofence.length === 0) {
      handleError("Data geofence belum siap. Proses dibatalkan.");
      return;
    }

    try {
      const startTime = Date.now();
      await AsyncStorage.setItem("startTime", startTime.toString());
      await AsyncStorage.setItem("selectedTicket", JSON.stringify(selectedTicket));
      await startBackgroundTracking(  // Start Radar trip tracking
        userData?.user_id || '',
        userData?.username || '',
        selectedTicket.ticket_id,
        selectedTicket.description,
        selectedTicket.geofence_id,
        geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.tag || ''
      );
      handleLog('Trip started');
      setTracking(true);
    } catch (error: any) {
      handleError(`Error starting trip: ${error}`);
      Alert.alert("Failed to start tracking", error.message);
    }
  };

  const handleCompleteTrip = async () => {
    setIsCompleting(true);
    const ticket_id = currentTicketID || selectedTicket?.ticket_id;
    if (!ticket_id || typeof ticket_id !== 'string') {
      handleError('Ticket ID is not valid');
      Alert.alert("Tiket Tidak Ditemukan", "Tidak ada tiket yang dipilih.");
      return;
    }
    if (photos.length < requiredPhotoCount) {
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        handleError('Izin lokasi tidak diberikan');
        return;
      }
      const location = await getCurrentPositionAsync({});
      setTimestamp(moment().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm:ss")); // timestamp
      setCurrentLocation(location); // current location
      setPhotoModalVisible(true);
      return;
    }
  };

  // Handle Stop Tracking (Finish Trip) with better error handling and state management
  const handleStop = async () => {
    try {
      if (!selectedTicket?.ticket_id) {
        handleError('No ticket ID available for stopping tracking');
        Alert.alert("Perhatian", "Data tiket masing dimuat. Mohon tunggu beberapa saat dengan tetap membuka aplikasi.");
        setIsCompleting(false);
        setIsUploading(false);
        return;
      }
      await stopBackgroundTracking(selectedTicket.ticket_id);
      setIsUploading(true);
      const queue = JSON.parse(await AsyncStorage.getItem('uploadQueue') || '[]');
      if (!queue.length) {
        handleError('No photos in upload queue');
        Alert.alert(
          "Perhatian",
          "Tidak ada foto untuk diunggah. Silakan ambil foto terlebih dahulu.",
          [{ text: "OK", onPress: () => setIsUploading(false) }]
        );
        return;
      }

      try {
        let serviceStarted = false;
        for (let i = 0; i < 3; i++) {
          serviceStarted = await startUploadService();
          if (serviceStarted) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!serviceStarted || !BackgroundJob.isRunning()) {
          handleError('Background service failed to start after multiple attempts');
          Alert.alert(
            "Perhatian",
            "Gagal memulai layanan upload. Tiket tidak akan dihapus, silakan coba lagi nanti.",
            [{
              text: "OK",
              onPress: () => {
                setIsUploading(false);
                setIsCompleting(false);
              }
            }]
          );
          return;
        }

        // Clear storage and reset states
        await AsyncStorage.removeItem("startTime");
        setPhotoModalVisible(false);
        setTracking(false);
        setPhotos([]);
        setTime(0);
        setCurrentLocation(null);
        setUploadProgress(0);
        setIsUploading(false);
        setIsCompleting(false);
        setTicketExtrasModalVisible(true);
      } catch (error) {
        handleError(`Failed to start upload service: ${error}`);
        Alert.alert(
          "Terjadi Kesalahan",
          "Gagal memulai layanan upload. Silakan coba lagi.",
          [
            {
              text: "OK",
              onPress: () => {
                setIsUploading(false);
                setIsCompleting(false);
              }
            }
          ]
        );
      }
    } catch (error) {
      handleError(`Error stopping trip: ${error}`);
      setIsUploading(false);
      setIsCompleting(false);
      Alert.alert("Kesalahan", "Terjadi kesalahan saat menyelesaikan pekerjaan. Silakan coba lagi.");
    }
  };

  // Handle Cancel Tracking (Cancel Trip)
  const handleCancel = async () => {
    try {
      if (selectedTicket?.ticket_id) {
        await cancelTrip(selectedTicket.ticket_id); // Cancel Radar trip tracking
        await AsyncStorage.removeItem("startTime"); // Clear AsyncStorage
        await AsyncStorage.removeItem("selectedTicket");
        setTracking(false); // Reset state
        setSelectedTicket(null);
        setTime(0);
        handleLog('Trip canceled');
        onRefresh();
      }
    } catch (error: any) {
      handleError(`Error canceling trip: ${error}`);
    }
  };

  const handleStartWithConfirmation = () => {
    if (!selectedTicket) {
      handleError('No ticket selected');
      Alert.alert("Tidak ada tiket yg dipilih", "Silakan pilih tiket sebelum memulai pekerjaan.");
      return;
    }
    setIsConfirmationVisible(true);
  };

  const handleCompletetWithConfirmation = () => {
    Alert.alert(
      "Konfirmasi Selesai",
      "Apakah Anda yakin ingin menyelesaikan pekerjaan?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Ya",
          onPress: () => handleCompleteTrip(),
        },
      ]
    );
  };

  const handleCanceltWithConfirmation = () => {
    Alert.alert(
      "Konfirmasi Pembatalan",
      "Apakah Anda yakin ingin membatalkan pekerjaan?",
      [
        {
          text: "Batal",
          style: "cancel",
        },
        {
          text: "Ya",
          onPress: () => handleCancel(),
        },
      ]
    );
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (tracking) {
      interval = setInterval(async () => {
        try {
          const storedStartTime = await AsyncStorage.getItem("startTime");
          if (storedStartTime) {
            const startTime = parseInt(storedStartTime, 10);
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            setTime(elapsed);
          }
        } catch (error: any) {
          handleError(`Error updating time: ${error}`);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval); // Clear interval when component unmounts
    };
  }, [tracking]);

  useEffect(() => {
    const loadTrackingData = async () => {
      try {
        const storedStartTime = await AsyncStorage.getItem("startTime");
        const storedTicket = await AsyncStorage.getItem("selectedTicket");
        if (storedStartTime && storedTicket) {
          const startTime = parseInt(storedStartTime, 10);
          const elapsed = Math.floor((Date.now() - startTime) / 1000); // Time elapsed in seconds
          setTime(elapsed);
          setSelectedTicket(JSON.parse(storedTicket));
          setTracking(true);
        } else if (storedTicket) {
          setSelectedTicket(JSON.parse(storedTicket));
          handleLog("Tiket dipilih dari halaman Tiket");
        }
      } catch (error: any) {
        handleError(`Error loading tracking data: ${error}`);
      }
    };
    loadTrackingData();
    const unsubscribeFocus = navigation.addListener('focus', () => {
      loadTrackingData();
    });
    return () => {
      unsubscribeFocus();
    };
  }, []);

  // Format time as HH:MM:SS
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const addToQueue = async (photos: string[], ticketId: string, userId: string) => {
    setIsPhotoProcessed(false);
    const newItem: QueueItem = {
      ticket_id: ticketId,
      user_id: userId,
      photos,
      timestamp,
      location: currentLocation,
    };
    const queue = JSON.parse(await AsyncStorage.getItem('uploadQueue') || '[]');
    const newQueue = [...queue, newItem];
    await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
  };

  // Fungsi baru untuk menyimpan foto ke galeri
  const savePhotoToGallery = async (photoUri: string): Promise<boolean> => {
    try {
      if (!photoUri || typeof photoUri !== 'string') {
        handleError('Invalid photo URI untuk penyimpanan ke galeri');
        return false;
      }
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Izin Diperlukan',
          'Aplikasi memerlukan izin untuk menyimpan foto ke galeri sebagai cadangan.',
          [{ text: 'OK' }]
        );
        return false;
      }
      await saveToLibraryAsync(photoUri);
      handleLog(`✅ Foto berhasil disimpan ke galeri: ${photoUri.substring(photoUri.length - 20)}`);
      return true;
    } catch (error) {
      handleError(`❌ Gagal menyimpan foto ke galeri: ${error}`);
      return false;
    }
  };

  // Handle picking photo
  const handleTakePhoto = async () => {
    setIsPhotoProcessed(true);
    try {
      const result = await launchCameraAsync({
        mediaTypes: MediaTypeOptions.Images,
        quality: 0.5,
      });
      if (!result.canceled && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        const index = photos.length;
        const processedUri = await addTimestampToPhoto(photoUri, `${selectedTicket?.ticket_id}-${timestamp}-${index}.jpg`, timestamp, currentLocation);
        if (processedUri) {
          await savePhotoToGallery(processedUri);
          if (photos.length >= requiredPhotoCount) {
            Alert.alert("Batas Tercapai", `Anda hanya dapat mengambil ${requiredPhotoCount} foto.`);
            return;
          }
          if (photos.length < requiredPhotoCount) {
            const newPhotos = [...photos, processedUri];
            setPhotos(newPhotos);
            setIsPhotoProcessed(false);
            if (newPhotos.length === requiredPhotoCount) {
              if (selectedTicket?.ticket_id && userData?.user_id) {
                await addToQueue(newPhotos, selectedTicket.ticket_id, userData.user_id);
              }
            }
          } else {
            Alert.alert("Batas Tercapai", `Anda hanya dapat mengambil ${requiredPhotoCount} foto.`);
          }
        } else {
          handleError("Failed to process photo");
          Alert.alert("Gagal memproses foto", "Silakan coba lagi.");
        }
      }
    } catch (error) {
      handleError(`Error taking photo: ${error}`);
      Alert.alert("Waktu habis", "Pengambilan foto memakan waktu terlalu lama. Silakan coba lagi.");
    } finally {
      setIsPhotoProcessed(false);
    }
  };

  // Handle photo preview
  const handlePreviewPhoto = (uri: string) => { setPreviewPhoto(uri) };

  // Handle delete photo
  const handleDeletePhoto = (index: number) => {
    Alert.alert(
      "Hapus Foto",
      "Anda ingin menghapus foto ini?",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            const updatedPhotos = photos.filter((_, i) => i !== index);
            setPhotos(updatedPhotos);
          },
        },
      ]
    );
  };

  const photoTitles = [
    'Foto BAST',
    'Foto Roll Sales Draft',
    'Foto SIM Card + SN EDC + SAM Card',
    'Foto Surat Pernyataan Training',
    'Foto Sales Draf',
    'Foto Plang',
    'Foto EDC',
    'Foto PIC Merchant'
  ];

  const [formData, setFormData] = useState({
    // EDC DETAILS
    sn_edc: "",
    tid_mti: "",
    tid_member_bank: "",
    mid_mti: "",
    mid_member_bank: "",
    sim_card: "",
    sam_card: "",
    edc_description: "",
    edc_notes: "",

    // ACTIVITIES & TASKS
    edc_cleaning: false,
    edc_problem: false,
    started_on: "",
    vendor_code: "MDM",
    task: "",
    thermal_supply: 0,

    // EDC DEVICE INFO
    com_line: "",
    profile_sticker: false,
    base_adaptor: false,
    settlement: false,
    signal_bar: "",
    signal_type: "",

    // MERCHANT DETAILS
    merchant_name: "",
    merchant_address: "",
    merchant_location: "",
    merchant_city: "",
    pic_name: "",
    pic_phone: "0",
    member_bank_category: "",
    edc_priority: "",
    edc_count: 1,
    thermal_stock: 0,
    manual_book: false,
    merchant_comment: "",

    // TRAINING DETAILS
    training_trx_qr: false,
    training_trx_prepaid: false,
    training_trx_credit: false,
    training_trx_debit: false,

    // OTHER DETAILS
    usual_edc: "",
    other_edc: "",
    merchant_request: "",
    promo_material: "",
  });

  // Function untuk mengupdate data form
  const handleInputChangeTicketExtras = (field: any, value: any) => {
    let processedValue = value;

    // Handle numeric fields
    const numericFields = ['thermal_supply', 'thermal_stock', 'edc_count'];
    if (numericFields.includes(field)) {
      processedValue = value === "" ? 0 : Number(value);
    }

    // Handle boolean fields
    const booleanFields = ['edc_cleaning', 'edc_problem', 'profile_sticker',
      'base_adaptor', 'settlement', 'manual_book', 'training_trx_qr',
      'training_trx_prepaid', 'training_trx_credit', 'training_trx_debit'];

    if (booleanFields.includes(field)) {
      processedValue = Boolean(value);
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));
  };

  const handleSubmitTicketExtras = async () => {
    setIsSubmittingTicketExtras(true);
    try {
      const processedData = {
        ...formData,
        merchant_location: formData.merchant_location ? formData.merchant_location.split(", ").map(Number) : [],
        started_on: selectedTicket?.updated_at ? new Date(selectedTicket.updated_at).toISOString() : new Date().toISOString()
      }

      await updateTicketExtras(selectedTicket?.ticket_id || "", processedData);

      setTimeout(() => {
        setIsSubmittingTicketExtras(false);
        setTicketExtrasModalVisible(false);
        alert("Data berhasil disimpan!");
      }, 2000);
      await AsyncStorage.removeItem("selectedTicket");
      setSelectedTicket(null);
      setFormData({
        // EDC DETAILS
        sn_edc: "",
        tid_mti: "",
        tid_member_bank: "",
        mid_mti: "",
        mid_member_bank: "",
        sim_card: "",
        sam_card: "",
        edc_description: "",
        edc_notes: "",

        // ACTIVITIES & TASKS
        edc_cleaning: false,
        edc_problem: false,
        started_on: "",
        vendor_code: "MDM",
        task: "",
        thermal_supply: 0,

        // EDC DEVICE INFO
        com_line: "",
        profile_sticker: false,
        base_adaptor: false,
        settlement: false,
        signal_bar: "",
        signal_type: "",

        // MERCHANT DETAILS
        merchant_name: "",
        merchant_address: "",
        merchant_location: "",
        merchant_city: "",
        pic_name: "",
        pic_phone: "0",
        member_bank_category: "",
        edc_priority: "",
        edc_count: 1,
        thermal_stock: 0,
        manual_book: false,
        merchant_comment: "",

        // TRAINING DETAILS
        training_trx_qr: false,
        training_trx_prepaid: false,
        training_trx_credit: false,
        training_trx_debit: false,

        // OTHER DETAILS
        usual_edc: "",
        other_edc: "",
        merchant_request: "",
        promo_material: "",
      });
      onRefresh();
    } catch (error) {
      handleError(`Error submitting ticket extras: ${error}`);
      setIsSubmittingTicketExtras(false);
      alert("Terjadi kesalahan!");
    }
  };

  const fetchAddressFromCoordinates = async (latitude: any, longitude: any) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36' } }
      );
      const data = await response.json();
      if (data && data.address) {
        const alamat = data.display_name || "Alamat tidak ditemukan";
        const kota = data.address.city || data.address.town || data.address.village || "Kota tidak ditemukan";
        setFormData((prevState) => ({
          ...prevState,
          merchant_address: alamat,
          merchant_city: kota,
          merchant_location: `${longitude}, ${latitude}`,
          merchant_name: geofence.find((g) => g.external_id === selectedTicket?.geofence_id)?.description || "-",
          task: selectedTicket?.description || "-",
        }));
      }
    } catch (error: any) {
      handleError(`Error fetching address: ${error}`);
    }
  };

  // Cleanup function untuk modal
  const handleClosePhotoModal = () => {
    if (isUploading) {
      Alert.alert("Perhatian", "Upload sedang berlangsung. Tunggu hingga selesai.");
      return;
    }
    setPhotoModalVisible(false);
    setIsUploading(false);
    setIsCompleting(false);
    setUploadProgress(0);
    setUploadMessage("");
  };

  const geofenceLookup = useMemo(() => {
    const lookup: { [key: string]: Geofence } = {};
    geofence.forEach((g) => {
      lookup[g.external_id] = g;
    });
    return lookup;
  }, [geofence]);

  return (
    <ScrollView
      className='bg-[#f5f5f5] p-6 mt-4'
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        !tracking ? (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        ) : undefined
      }
    >
      <View className="flex-row items-center justify-between w-full">
        <View className="flex items-start gap-y-1">
          <Text className="text-xl font-bold text-center">
            Halo, {userData?.username || "User"}
          </Text>
        </View>
      </View>

      {/* Internet Status Badge */}
      <View className="mt-4">
        <Text className={`text-sm font-bold text-center py-2 px-4 rounded-full ${isConnected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
          {isConnected ? 'Koneksi Internet Stabil' : 'Tidak Ada Koneksi Internet'}
        </Text>
      </View>

      {/* Tickets Dropdown */}
      <View className="mt-4">
        <Text className="mb-2 text-lg font-bold">Pilih Tiket yang Tersedia</Text>
        <View style={{ maxHeight: 100, overflow: 'hidden' }}>
          <ScrollView>
            <Picker
              mode="dialog"
              selectedValue={selectedTicket?.id || null}
              onValueChange={(value: any) => {
                const ticket = tickets.find((t) => t.id === value);
                setSelectedTicket(ticket || null);
                setCurrentTicketID(ticket?.ticket_id || null);
              }}
              style={{ height: 50, backgroundColor: 'white', borderRadius: 8 }}
            >
              <Picker.Item label="Pilih tiket..." value={null} />
              {tickets
                .filter((ticket) => ticket.status === 'assigned')
                .map((ticket) => {
                  const geofence_obj = geofenceLookup[ticket.geofence_id];
                  const geofenceDescription = geofence_obj?.description || ticket.description;
                  // Truncate description to max 20 characters plus ellipsis
                  const truncatedDescription = geofenceDescription.length > 20
                    ? geofenceDescription.substring(0, 25) + '...'
                    : geofenceDescription;
                  return (
                    <Picker.Item
                      style={{ fontSize: 12 }}
                      key={ticket.id}
                      label={`${truncatedDescription} - ${ticket.additional_info?.tipe_tiket || ""} - TID: ${ticket.additional_info?.tid || ''}`}
                      value={ticket.id}
                    />
                  );
                })}
            </Picker>
          </ScrollView>
        </View>
      </View>

      {/* Photo Modal */}
      <Modal
        visible={photoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClosePhotoModal}
      // onRequestClose={() => {
      //   if (!isUploading && photoModalVisible) {
      //     setPhotoModalVisible(false);
      //   }
      // }}
      >
        <View className="items-center justify-center flex-1 bg-gray-900 bg-opacity-75">
          <View className="w-11/12 max-w-lg p-6 bg-white rounded-lg">
            <Text className={`text-sm font-bold text-center py-2 px-4 rounded-full ${isConnected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
              {isConnected ? 'Koneksi Internet Stabil' : 'Tidak Ada Koneksi Internet'}
            </Text>
            <Text className="mb-2 text-lg font-bold">Ambil {requiredPhotoCount} Bukti Foto.</Text>
            <Text className="mb-4 text-gray-500">Ambil {requiredPhotoCount} foto berikut untuk menyelesaikan tiket.</Text>

            {/* Photo Grid */}
            <ScrollView style={{ maxHeight: 550 }} showsVerticalScrollIndicator={true}>
              <View className="flex flex-row flex-wrap justify-between gap-2 mb-4">
                {Array.from({ length: requiredPhotoCount }).map((_, index) => (
                  <View
                    key={index}
                    className="relative overflow-hidden bg-gray-100 border border-gray-300 rounded-md"
                    style={{ width: "48%", aspectRatio: 1 }}
                  >
                    <View className="p-1 bg-gray-700 rounded-t-sm">
                      <Text className="px-1 text-sm text-white">{index + 1}. {photoTitles[index]}</Text>
                    </View>
                    {photos[index] ? (
                      <TouchableOpacity
                        onPress={() => handlePreviewPhoto(photos[index])}
                      >
                        <Image
                          source={{ uri: photos[index] }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          onPress={() => handleDeletePhoto(index)}
                          className="absolute p-1 bg-red-500 rounded-full top-2 right-2"
                        >
                          <Ionicons name="trash" size={20} color="white" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ) : (
                      <Text className="py-4 text-center text-gray-600">Belum ada foto</Text>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Action Button */}
            {photos.length === requiredPhotoCount ? (
              <TouchableOpacity
                onPress={async () => {
                  if (!selectedTicket || !userData) return;
                  setIsUploading(true);
                  handleStop();
                }}
                className={`items-center px-8 py-4 my-4 rounded-full ${!isConnected ? "bg-gray-300" : "bg-blue-500"}`}
                activeOpacity={0.7}
                disabled={!isConnected}
              >
                {isUploading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-xl font-bold text-white">Unggah foto</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  if (!isPhotoProcessed) {
                    handleTakePhoto();
                  }
                }}
                className={`items-center px-8 py-4 my-4 rounded-full ${isPhotoProcessed || !isConnected ? "bg-gray-300" : "bg-[#059669]"}`}
                activeOpacity={0.7}
                disabled={isPhotoProcessed || !isConnected}
              >
                {isPhotoProcessed ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-xl font-bold text-white">Ambil foto sekarang</Text>
                )}
              </TouchableOpacity>
            )}

            {/* Progress Bar and Message */}
            {isUploading && (
              <View className="mt-2 mb-6 ">
                <Text className="text-center text-gray-600">{uploadMessage}</Text>
                <View className="relative w-full h-4 mt-2 bg-gray-200 rounded-full">
                  <View
                    className="absolute top-0 left-0 h-4 bg-blue-500 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </View>
              </View>
            )}

            {/* Close Modal Button */}
            <TouchableOpacity
              disabled={isUploading}
              onPress={() => { setPhotoModalVisible(false); setIsUploading(false); setIsCompleting(false); }}
              className={`items-center px-4 py-2 rounded-full ${isUploading ? "bg-gray-300" : "bg-gray-400"}`}
              activeOpacity={0.7}
            >
              <Text className="text-lg font-bold text-white">
                {isUploading ? "Sedang memproses..." : "Tutup"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal
        visible={!!previewPhoto}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View className="items-center justify-center flex-1 px-4 bg-black bg-opacity-75">
          {previewPhoto && (
            <View className="w-full max-w-md overflow-hidden bg-white shadow-xl rounded-xl">
              <Image
                source={{ uri: previewPhoto }}
                style={{ width: "100%", height: 400 }}
                resizeMode="cover"
              />
              <View className="flex-row items-center justify-between px-6 py-4 border-t border-gray-200">
                <TouchableOpacity
                  onPress={() => {
                    const index = photos.findIndex((photo) => photo === previewPhoto);
                    handleDeletePhoto(index);
                    setPreviewPhoto(null);
                  }}
                  className="flex-row items-center px-4 py-2 text-red-500 bg-red-100 rounded-lg"
                >
                  <Ionicons name="trash" size={20} color="#e3342f" />
                  <Text className="ml-2 font-semibold text-red-500">Hapus</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPreviewPhoto(null)}
                  className="flex-row items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg"
                >
                  <Ionicons name="close" size={20} color="#6b7280" />
                  <Text className="ml-2 font-semibold text-gray-600">Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Ticket Extras Detail Modal */}
      <Modal
        visible={ticketExtrasModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTicketExtrasModalVisible(false)}
      >
        <View className="items-center justify-center flex-1 bg-gray-900 bg-opacity-75">
          <View className="w-[350px] max-w-lg p-6 bg-white rounded-lg">
            <Text className="mb-4 text-xl font-bold text-center">Berita Acara</Text>

            <ScrollView style={{ maxHeight: 600 }} showsVerticalScrollIndicator={true} fadingEdgeLength={200} alwaysBounceVertical={true} bounces={true} persistentScrollbar={true}>
              {/* 1. EDC Detail */}
              <View>
                <Text className="mb-4 font-bold underline">1. Detail EDC</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SN EDC</Text>
                    <TextInput
                      value={formData.sn_edc || selectedTicket?.additional_info?.sn_edc}
                      onChangeText={(text) => handleInputChangeTicketExtras("sn_edc", text)}
                      // placeholder="SN EDC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    // className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID MTI</Text>
                    <TextInput
                      // value={formData.mid_mti}
                      value={selectedTicket?.additional_info?.mid}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID MTI</Text>
                    <TextInput
                      // value={formData.tid_mti}
                      value={selectedTicket?.additional_info?.tid}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SIM Card</Text>
                    <TextInput
                      // value={formData.sim_card}
                      value={selectedTicket?.additional_info?.sn_sim_card}
                      onChangeText={(text) => handleInputChangeTicketExtras("sim_card", text)}
                      // placeholder="SIM Card"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SAM Card</Text>
                    <TextInput
                      // value={formData.sam_card}
                      value={selectedTicket?.additional_info?.sn_sam_card}
                      onChangeText={(text) => handleInputChangeTicketExtras("sam_card", text)}
                      // placeholder="SAM Card"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Keterangan</Text>
                    <TextInput
                      value={formData.edc_description}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_description", text)}
                      // placeholder="Keterangan"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Catatan/Notes</Text>
                    <TextInput
                      value={formData.edc_notes || selectedTicket?.additional_info?.noted}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_notes", text)}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* 2. Aktivitas Pekerjaan */}
              <View>
                <Text className="mb-4 font-bold underline">2. Aktivitas Pekerjaan</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Cleaning</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.edc_cleaning ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_cleaning", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.edc_cleaning ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_cleaning", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Problem</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.edc_problem ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_problem", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.edc_problem ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("edc_problem", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Dimulai Pada</Text>
                    <TextInput
                      value={selectedTicket ? moment(selectedTicket.updated_at).format("DD/MM/YYYY, HH:mm") : ""}
                      onChangeText={(text) => handleInputChangeTicketExtras("started_on", text)}
                      // placeholder="Dimulai Pada"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kode Vendor</Text>
                    <TextInput
                      value={formData.vendor_code}
                      onChangeText={(text) => handleInputChangeTicketExtras("vendor_code", text)}
                      // placeholder="Kode Vendor"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Pekerjaan</Text>
                    <TextInput
                      value={selectedTicket?.description}
                      onChangeText={(text) => handleInputChangeTicketExtras("task", text)}
                      // placeholder="Pekerjaan"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Thermal Supply</Text>
                    <TextInput
                      value={formData.thermal_supply.toString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("thermal_supply", text)}
                      // placeholder="Thermal Supply"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* 3. Informasi Device EDC */}
              <View>
                <Text className="mb-4 font-bold underline">3. Informasi Device EDC</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID MTI</Text>
                    <TextInput
                      // value={formData.mid_mti}
                      value={selectedTicket?.additional_info?.mid}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID Member Bank</Text>
                    <TextInput
                      value={formData.mid_member_bank}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_member_bank", text)}
                      // placeholder="MID Member Bank"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID MTI</Text>
                    <TextInput
                      // value={formData.tid_mti}
                      value={selectedTicket?.additional_info?.tid}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                      editable={false}
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID Member Bank</Text>
                    <TextInput
                      value={formData.tid_member_bank}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_member_bank", text)}
                      // placeholder="TID Member Bank"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Com Line</Text>
                    <TextInput
                      value={formData.com_line}
                      onChangeText={(text) => handleInputChangeTicketExtras("com_line", text)}
                      // placeholder="Com Line"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Profile Sticker</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.profile_sticker ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("profile_sticker", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.profile_sticker ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("profile_sticker", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Base Adaptor</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.base_adaptor ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("base_adaptor", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.base_adaptor ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("base_adaptor", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Settlement</Text>
                    <View className="flex-row justify-start">
                      <View className="flex-row items-center">
                        <RadioButton
                          value="true"
                          status={formData.settlement ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("settlement", true)}
                        />
                        <Text className="text-sm text-gray-600">Ya</Text>
                      </View>
                      <View className="flex-row items-center">
                        <RadioButton
                          value="false"
                          status={!formData.settlement ? "checked" : "unchecked"}
                          onPress={() => handleInputChangeTicketExtras("settlement", false)}
                        />
                        <Text className="text-sm text-gray-600">Tidak</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Signal Bar</Text>
                    <TextInput
                      // value={formData.signal_bar}
                      value={formData.signal_bar || selectedTicket?.additional_info?.signal_bar}
                      onChangeText={(text) => handleInputChangeTicketExtras("signal_bar", text)}
                      // placeholder="TID MTI"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Signal Type</Text>
                    <TextInput
                      // value={formData.signal_type}
                      value={formData.signal_type || selectedTicket?.additional_info?.signal_type}
                      onChangeText={(text) => handleInputChangeTicketExtras("signal_type", text)}
                      // placeholder="Signal Type"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    />
                  </View>
                </View>
              </View>

              {/* 4. Informasi Merchant */}
              <View>
                <Text className="mb-4 font-bold underline">4. Informasi Merchant</Text>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Nama Merchant/Agent</Text>
                  <TextInput
                    value={geofence.find((t) => t.external_id === selectedTicket?.geofence_id)?.description}
                    onChangeText={(text) => handleInputChangeTicketExtras("merchant_name", text)}
                    // placeholder="Nama Merchant/Agent"
                    className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                    editable={false}
                  />
                </View>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Alamat</Text>
                  <TextInput
                    value={formData.merchant_address}
                    onChangeText={(text) => handleInputChangeTicketExtras("merchant_address", text)}
                    // placeholder="Alamat"
                    multiline
                    numberOfLines={10}
                    textAlignVertical="top"
                    className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md text-wrap"
                    editable={false}

                  />
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kota</Text>
                    <TextInput
                      value={formData.merchant_city}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_city", text)}
                      // placeholder="Kota"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Lokasi</Text>
                    <TextInput
                      value={geofence.find((t) => t.external_id === selectedTicket?.geofence_id)?.coordinates?.join(", ")}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_location", text)}
                      // placeholder="Lokasi"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                      editable={false}
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Nama PIC</Text>
                    <TextInput
                      // value={formData.pic_name}
                      value={formData.pic_name || selectedTicket?.additional_info?.contact_person_merchant}
                      onChangeText={(text) => handleInputChangeTicketExtras("pic_name", text)}
                      // placeholder="Nama PIC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">No. Telepon PIC</Text>
                    <TextInput
                      // value={formData.pic_phone}
                      value={formData.pic_phone || selectedTicket?.additional_info?.phone_merchant}
                      onChangeText={(text) => handleInputChangeTicketExtras("pic_phone", text)}
                      // placeholder="No. Telepon PIC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Kategori Member Bank</Text>
                    <TextInput
                      value={formData.member_bank_category}
                      onChangeText={(text) => handleInputChangeTicketExtras("member_bank_category", text)}
                      // placeholder="Kategori Member Bank"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Prioritas EDC</Text>
                    <TextInput
                      // value={formData.edc_priority}
                      value={formData.edc_priority || selectedTicket?.additional_info?.priority_edc}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_priority", text)}
                      // placeholder="Prioritas EDC"
                      // className="p-2 mt-2 border border-gray-300 rounded-md"
                      className="p-2 mt-2 bg-gray-200 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Jumlah Unit EDC</Text>
                    <TextInput
                      value={formData.edc_count.toLocaleString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_count", text)}
                      // placeholder="EDC (unit)"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Thermal Stock</Text>
                    <TextInput
                      value={formData.thermal_stock.toLocaleString()}
                      onChangeText={(text) => handleInputChangeTicketExtras("thermal_stock", text)}
                      // placeholder="Thermal Stock"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View className="mb-4">
                  <Text className="text-sm text-gray-600">Manual Book</Text>
                  <View className="flex-row mt-2 space-x-4">
                    <View className="flex-row items-center">
                      <RadioButton
                        value="true"
                        status={formData.manual_book ? "checked" : "unchecked"}
                        onPress={() => handleInputChangeTicketExtras("manual_book", true)}
                      />
                      <Text className="text-sm text-gray-600">Ya</Text>
                    </View>
                    <View className="flex-row items-center">
                      <RadioButton
                        value="false"
                        status={!formData.manual_book ? "checked" : "unchecked"}
                        onPress={() => handleInputChangeTicketExtras("manual_book", false)}
                      />
                      <Text className="text-sm text-gray-600">Tidak</Text>
                    </View>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Komentar Merchant</Text>
                    <TextInput
                      // value={formData.merchant_comment}
                      value={formData.merchant_comment || selectedTicket?.additional_info?.merchant_comment}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_comment", text)}
                      // placeholder="Komentar Merchant"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* 5. Informasi Lainnya */}
              <View>
                <Text className="mb-4 font-bold underline">5. Informasi Lainnya</Text>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC yang sering digunakan</Text>
                    <TextInput
                      // value={formData.usual_edc}
                      value={formData.usual_edc || selectedTicket?.additional_info?.edc_yang_sering_digunakan}
                      onChangeText={(text) => handleInputChangeTicketExtras("usual_edc", text)}
                      // placeholder="EDC yang sering digunakan"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">EDC Lainnya</Text>
                    <TextInput
                      // value={formData.other_edc}
                      value={formData.other_edc || selectedTicket?.additional_info?.edc_bank_lainnya}
                      onChangeText={(text) => handleInputChangeTicketExtras("other_edc", text)}
                      // placeholder="EDC Lainnya"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Permintaan Merchant (Request)</Text>
                    <TextInput
                      // value={formData.merchant_request}
                      value={formData.merchant_request || selectedTicket?.additional_info?.merchant_request}
                      onChangeText={(text) => handleInputChangeTicketExtras("merchant_request", text)}
                      // placeholder="Permintaan Merchant (Request)"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Promo Material</Text>
                    <TextInput
                      // value={formData.promo_material}
                      value={formData.promo_material || selectedTicket?.additional_info?.promo_matrial_}
                      onChangeText={(text) => handleInputChangeTicketExtras("promo_material", text)}
                      // placeholder="Promo Material"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      className="h-20 p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
              </View>

              {/* 6. Training Material */}
              <View>
                <Text className="mb-4 font-bold underline">6. Training Material</Text>
                <View className="flex-row items-center">
                  <Checkbox
                    status={formData.training_trx_qr ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("training_trx_qr", !formData.training_trx_qr)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Tes TRX QR</Text>
                </View>
                <View className="flex-row items-center">
                  <Checkbox
                    status={formData.training_trx_prepaid ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("training_trx_prepaid", !formData.training_trx_prepaid)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Tes TRX Prepaid</Text>
                </View>
                <View className="flex-row items-center">
                  <Checkbox
                    status={formData.training_trx_credit ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("training_trx_credit", !formData.training_trx_credit)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Tes TRX Credit</Text>
                </View>
                <View className="flex-row items-center">
                  <Checkbox
                    status={formData.training_trx_debit ? 'checked' : 'unchecked'}
                    onPress={() => handleInputChangeTicketExtras("training_trx_debit", !formData.training_trx_debit)}
                  />
                  <Text className="ml-2 text-sm text-gray-600">Tes TRX Debit</Text>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleSubmitTicketExtras}
                className={`items-center px-8 py-4 mt-6 mb-4 rounded-full ${isSubmittingTicketExtras ? "bg-gray-300" : "bg-blue-500"}`}
                activeOpacity={0.7}
                disabled={isSubmittingTicketExtras}
              >
                {isSubmittingTicketExtras ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-xl font-bold text-white">Simpan</Text>
                )}
              </TouchableOpacity>
            </ScrollView>

            {/* Close Modal Button */}
            {/* <TouchableOpacity
              onPress={() => setTicketExtrasModalVisible(false)}
              className={`items-center px-4 py-2 rounded-full ${isSubmittingTicketExtras ? "bg-gray-300" : "bg-gray-400"}`}
              activeOpacity={0.7}
              disabled
            >
              <Text className="text-lg font-bold text-white">
                {isSubmittingTicketExtras ? "Sedang memproses..." : "Tutup"}
              </Text>
            </TouchableOpacity> */}
          </View>
        </View>
      </Modal >

      {/* Activity Card */}
      <View className="items-center justify-start flex-1 p-8 mt-4 bg-white rounded-3xl" >
        <View className="relative items-center justify-start flex-1 w-full">
          <Text className="mb-2 text-2xl font-bold text-center">Aktivitas</Text>
          <Text className="mb-4 text-lg text-center">
            {tracking ? "Berjalan..." : "Idle"}
          </Text>
          <View>
            {!tracking && !selectedTicket && (
              <Text className="text-center text-gray-500">
                Silakan pilih tiket sebelum memulai aktivitas.
              </Text>
            )}

            {!tracking && selectedTicket && (
              <View className="z-10 gap-y-2">
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">ID Tiket:</Text> {selectedTicket.ticket_id}
                </Text>
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Deskripsi:</Text> {selectedTicket.description}
                </Text>
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Lokasi Tujuan:</Text> {geofenceLookup[selectedTicket.geofence_id]?.description}
                </Text>
                {selectedTicket?.additional_info && (
                  <>
                    <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-2">
                      <Text className="text-center text-gray-600">
                        <Text className="font-bold">TID:</Text> {selectedTicket.additional_info?.tid || '-'}
                      </Text>
                      <Text className="text-center text-gray-600">
                        <Text className="font-bold">MID:</Text> {selectedTicket.additional_info?.mid || '-'}
                      </Text>
                    </View>
                    <Text className="text-center text-gray-600">
                      <Text className="font-bold">Tipe Tiket:</Text> {selectedTicket.additional_info?.tipe_tiket || '-'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setAdditionalInfoModalVisible(true)}
                      className="items-center w-full px-1 py-2 bg-blue-500 rounded-full"
                      activeOpacity={0.7}
                      style={{ zIndex: 2 }}
                    >
                      <Text className="text-sm font-bold text-white">Lihat Info Tambahan</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Modal for Additional Info */}
                <Modal
                  visible={additionalInfoModalVisible}
                  animationType="slide"
                  transparent
                  onRequestClose={() => setAdditionalInfoModalVisible(false)}
                >
                  <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
                    <View className="w-11/12 max-w-md p-4 bg-white rounded-lg">
                      <Text className="mb-4 text-xl font-bold text-center">Detail Tambahan</Text>
                      <ScrollView style={{ maxHeight: 400 }}>
                        <View className="flex-row flex-wrap">
                          {Object.entries(selectedTicket?.additional_info || {}).map(([key, value]) => (
                            <View key={key} className="w-1/2 px-2 mb-4">
                              <Text className="text-sm font-semibold text-gray-700">{key}</Text>
                              <Text className="mt-1 text-sm text-gray-900">
                                {typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                      <TouchableOpacity
                        onPress={() => setAdditionalInfoModalVisible(false)}
                        className="py-2 mt-4 bg-gray-300 rounded-full"
                      >
                        <Text className="font-bold text-center text-gray-800">Tutup</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              </View>
            )}
          </View>
          {tracking && (
            <Text className="mb-4 text-xl text-center">{formatTime(time)}</Text>
          )}

          {/* Idle */}
          {!tracking ? (
            <LottieView
              source={require('../../assets/animations/idle1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: [
                  { translateX: -150 },
                  { translateY: -150 },
                ],
                width: 300,
                height: 300,
                zIndex: 1,
              }}
            />
          ) : (
            <Text className="absolute text-2xl font-bold text-gray-500">
              {/* {tracking ? "Sedang Bekerja..." : "Idle"} */}
            </Text>
          )}

          {/* Working */}
          {tracking ? (
            <LottieView
              source={require('../../assets/animations/working1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '65%',
                left: '50%',
                transform: [
                  { translateX: -150 },
                  { translateY: -150 },
                ],
                width: 300,
                height: 300,
                zIndex: 1,
              }}
            />
          ) : (
            <Text className="absolute text-2xl font-bold text-gray-500">
              {/* {tracking ? "Sedang Bekerja..." : "Idle"} */}
            </Text>
          )}
        </View>

        {/* Start/Stop Button */}
        <TouchableOpacity
          onPress={tracking ? handleCompletetWithConfirmation : handleStartWithConfirmation}
          className={`items-center w-full py-4 px-8 rounded-full ${isCompleting || !isConnected ? "bg-gray-300" : tracking ? "bg-red-500" : "bg-[#059669]"}`}
          activeOpacity={0.7}
          disabled={isCompleting || !isConnected}
        >
          {isCompleting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-xl font-bold text-white">
              {tracking ? "Selesai" : "Mulai Bekerja"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        {tracking && (
          <TouchableOpacity
            onPress={handleCanceltWithConfirmation}
            className="items-center w-full px-8 py-4 mt-4 bg-gray-500 rounded-full"
            activeOpacity={0.7}
            disabled={!isConnected}
          >
            <Text className="text-xl font-bold text-white">Batalkan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Confirmation Modal to Start a Ticket */}
      {isConfirmationVisible && (
        <Modal
          visible={isConfirmationVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setIsConfirmationVisible(false)}
        >
          <View className="items-center justify-center flex-1 px-4 bg-black/50">
            <View className="w-full max-w-md p-6 bg-white rounded-lg">
              <Text className="mb-4 text-xl font-semibold text-gray-800">
                Konfirmasi Mulai
              </Text>
              <Text className="text-sm text-gray-600">
                Apakah Anda yakin ingin memulai pekerjaan?
              </Text>
              <View className="my-4 gap-y-2">
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">ID Tiket:</Text> {selectedTicket?.ticket_id}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">ID Tempat:</Text> {selectedTicket?.geofence_id}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">Deskripsi:</Text> {selectedTicket?.description}
                </Text>
                <Text className="text-sm text-gray-600">
                  <Text className="font-bold">Tempat tujuan:</Text> {geofenceLookup[selectedTicket?.geofence_id ?? ""]?.description || "Tidak tersedia"}
                </Text>
              </View>
              <View className="flex-row justify-between mt-4">
                {/* Tombol Batal */}
                <TouchableOpacity
                  onPress={() => setIsConfirmationVisible(false)}
                  className="px-6 py-3 bg-gray-300 rounded-lg"
                >
                  <Text className="text-sm font-semibold text-gray-700">Batal</Text>
                </TouchableOpacity>
                {/* Tombol Ya */}
                <TouchableOpacity
                  onPress={() => {
                    setIsConfirmationVisible(false);
                    handleStart();
                  }}
                  className="px-6 py-3 bg-blue-500 rounded-lg"
                >
                  <Text className="text-sm font-semibold text-white">Ya</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView >
  );
};

export default MainScreen;
