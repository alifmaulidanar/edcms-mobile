import moment from "moment-timezone";
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllGeofences } from '../api/geofences';
import { Picker } from '@react-native-picker/picker';
import { Geofence, QueueItem, Ticket } from '../types';
import { getCurrentPositionAsync } from 'expo-location';
import { RadioButton, Checkbox } from 'react-native-paper';
import BackgroundJob from 'react-native-background-actions';
import React, { useState, useEffect, useCallback } from "react";
import { getTickets, updateTicketExtras } from '../api/tickets';
import { startUploadService } from "../utils/backgroundUploader";
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchCameraAsync, MediaTypeOptions } from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { addTimestampToPhoto } from "../components/ImageTimestampAndLocation";
import { requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library';
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl, Image, ActivityIndicator, TextInput } from "react-native";

const requiredPhotoCount = parseInt(process.env.EXPO_PUBLIC_REQUIRED_PHOTO_COUNT);
const ticketExtrasFlag = process.env.EXPO_PUBLIC_FEATURE_FLAG_ENABLE_TICKET_EXTRAS;

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
  Settings: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const compressImage = async (uri: string) => {
  const manipResult = await manipulateAsync(
    uri,
    [{ resize: { width: 800 } }], // Resize to a width of 800px
    { compress: 0.4, format: SaveFormat.JPEG, base64: true }, // Compress to 40%
  );
  return manipResult.uri;
};

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

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

  useEffect(() => {
    // const fetchData = async () => {
    // AsyncStorage.removeItem("pendingUploads");
    // AsyncStorage.removeItem("uploadQueue");
    // AsyncStorage.removeItem("failedUploads");
    // const userData = await AsyncStorage.getItem("userData");
    // const session = await AsyncStorage.getItem("session");
    // const parsedUserData = userData ? JSON.parse(userData) : null;
    // const pending = AsyncStorage.getItem("pendingUploads");
    // const queue = AsyncStorage.getItem("uploadQueue");
    // const failed = AsyncStorage.getItem("failedUploads");
    // handleLog('session:', session);
    // handleLog('User data:', parsedUserData);
    // handleLog('Pending:', pending);
    // handleLog('Queue:', queue);
    // handleLog('Failed:', failed);
    // };
    // fetchData();
    const interval = setInterval(uploadPendingPhotos, 60000);
    return () => clearInterval(interval);
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
          handleLog('Starting background service...');
          await startUploadService();
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

  // Fetch tickets dari API
  const fetchTickets = useCallback(async () => {
    try {
      if (userData) {
        const response = await getTickets(userData.user_id);
        setTickets(response);
      }
    } catch (error: any) {
      handleError(`Error fetching tickets: ${error.message}`);
    }
  }, [userData]);

  const fetchGeofences = useCallback(async () => {
    try {
      const response = await getAllGeofences();
      setGeofence(response);
    } catch (error: any) {
      handleError(`Error fetching geofences: ${error.message}`);
    }
  }, []);

  // Fetch tickets and geofences
  useEffect(() => {
    fetchTickets();
    fetchGeofences();
  }, [fetchTickets]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setIsRefreshing(true);
    setSelectedTicket(null);
    setCurrentTicketID(null);
    await fetchTickets();
    await fetchGeofences();
    setIsRefreshing(false);
  };

  // Handle Start Tracking (Start Trip)
  const handleStart = async () => {
    if (!selectedTicket) {
      Alert.alert("Tidak ada tiket yg dipilih", "Silakan pilih tiket sebelum memulai pekerjaan.");
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
      const location = await getCurrentPositionAsync({});
      setTimestamp(moment().tz("Asia/Jakarta").format("DD MMM YYYY HH:mm:ss")); // timestamp
      setCurrentLocation(location); // current location
      setPhotoModalVisible(true);
      return;
    }
  };

  // Handle Stop Tracking (Finish Trip)
  const handleStop = async () => {
    try {
      if (selectedTicket?.ticket_id) {
        await stopBackgroundTracking(selectedTicket.ticket_id); // Stop Radar location tracking
        startUploadService(); // Start background photo upload
        await AsyncStorage.removeItem("startTime");
        setTracking(false); // Reset state
        setPhotos([]);
        setTime(0);
        setCurrentLocation(null);
        setUploadProgress(0);
        Alert.alert("Sukses", "Foto berhasil diunggah.");
        setIsUploading(false);
        setIsCompleting(false);
        setPhotoModalVisible(false);
        if (ticketExtrasFlag === "true") {
          setTicketExtrasModalVisible(true);
        }
        if (ticketExtrasFlag === "false") {
          await AsyncStorage.removeItem("selectedTicket");
          setSelectedTicket(null);
          handleLog('Trip stopped');
          onRefresh();
        }
      }
    } catch (error) {
      handleError(`Error stopping trip: ${error}`);
    }
  };

  // debug photo modal
  // const handleDebugPhotoModal = async () => {
  //   setPhotoModalVisible(true);
  // }

  // const handleDebugTicketExtrasModal = async () => {
  //   setTicketExtrasModalVisible(true);
  // }

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
        }
      } catch (error: any) {
        handleError(`Error loading tracking data: ${error}`);
      }
    };
    loadTrackingData();
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

  // Handle picking photo
  const handleTakePhoto = async () => {
    setIsPhotoProcessed(true);
    const result = await launchCameraAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (!result.canceled && result.assets.length > 0) {
      const photoUri = result.assets[0].uri;
      const index = photos.length;
      const processedUri = await addTimestampToPhoto(photoUri, `${selectedTicket?.ticket_id}-${timestamp}-${index}.jpg`, timestamp, currentLocation);
      if (processedUri) {
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

  // Handle saving photos locally
  // const savePhotoLocally = async (photoUris: string[], ticketId: string, userId: string) => {
  //   try {
  //     const storedData = await AsyncStorage.getItem("pendingUploads");
  //     let pendingUploads = storedData ? JSON.parse(storedData) : [];
  //     if (!Array.isArray(pendingUploads)) {
  //       pendingUploads = [];
  //     }

  //     let ticketData = pendingUploads.find((item: any) => item.ticket_id === ticketId);
  //     if (!ticketData) {
  //       ticketData = { ticket_id: ticketId, user_id: userId, photos: [], timestamp: timestamp, location: currentLocation };
  //       pendingUploads.push(ticketData);
  //     }

  //     ticketData.photos = Array.from(new Set([...ticketData.photos, ...photoUris]));
  //     await AsyncStorage.setItem("pendingUploads", JSON.stringify(pendingUploads));
  //     // handleLog(`✅ Semua foto untuk tiket ${ticketId} telah disimpan.`);
  //   } catch (error: any) {
  //     handleError("❌ Error saving photos locally:", error);
  //   }
  // };

  // Background photo upload
  const uploadPendingPhotos = async () => {
    try {
      let storedData = await AsyncStorage.getItem("pendingUploads");
      let pendingUploads = storedData ? JSON.parse(storedData) : [];
      if (!Array.isArray(pendingUploads) || pendingUploads.length === 0) {
        handleLog("Tidak ada foto yang perlu diunggah.");
        return;
      }

      handleLog(`Jumlah tiket dalam antrian: ${pendingUploads.length}`);
      let updatedUploads = [...pendingUploads]; // Salinan array untuk diubah
      for (let i = 0; i < pendingUploads.length; i++) {
        const { ticket_id, user_id, photos } = pendingUploads[i];
        if (!ticket_id || !user_id || !Array.isArray(photos) || photos.length !== requiredPhotoCount) {
          handleError(`Data tiket ${ticket_id} tidak valid, melewati tiket ini...`);
          continue;
        }

        handleLog(`Memproses tiket ${ticket_id} dengan ${photos.length} foto.`);
        const formData = new FormData();
        let isSuccess = true;
        for (let j = 0; j < photos.length; j++) {
          try {
            const compressedUri = await compressImage(photos[j]);
            const fileName = `${ticket_id}-${photos[j].timestamp}-${j + 1}.jpg`;
            let timestampedPhoto = await addTimestampToPhoto(compressedUri, fileName, pendingUploads[i].timestamp, pendingUploads[i].location);
            let retryCount = 0;

            while (!timestampedPhoto && retryCount < 3) {
              handleLog(`Menunggu ulang pendingUploads[i].timestamp untuk ${fileName}... Percobaan ke-${retryCount + 1}`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              timestampedPhoto = await addTimestampToPhoto(compressedUri, fileName, pendingUploads[i].timestamp, pendingUploads[i].location);
              retryCount++;
            }

            if (!timestampedPhoto) {
              handleError(`Gagal menambahkan timestamp ke foto ${fileName}.`);
              isSuccess = false;
              break;
            }

            formData.append("photos", {
              uri: timestampedPhoto,
              type: "image/jpeg",
              name: fileName,
            } as any);

            const { status } = await requestPermissionsAsync();
            if (status === "granted") {
              await saveToLibraryAsync(timestampedPhoto);
            } else {
              handleLog("Izin untuk menyimpan ke galeri ditolak.");
            }
          } catch (error: any) {
            handleError(`Gagal memproses foto ${j + 1} untuk tiket ${ticket_id}: ${error}`);
            isSuccess = false;
            break;
          }
        }

        if (!isSuccess) {
          handleLog(`Tiket ${ticket_id} tidak dapat diproses, akan dicoba lagi nanti.`);
          continue;
        }

        handleLog(`Mengunggah semua foto untuk tiket ${ticket_id}...`);
        try {
          const response = await fetch(
            `${process.env.EXPO_PUBLIC_API_BASE_URL}/ticket/photos/upload/${ticket_id}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "multipart/form-data",
                "user_id": user_id,
              },
              body: formData,
            }
          );

          if (response.ok) {
            handleLog(`[${ticket_id}] Semua foto berhasil diunggah.`);
            updatedUploads = updatedUploads.filter(item => item.ticket_id !== ticket_id);
            await AsyncStorage.setItem("pendingUploads", JSON.stringify(updatedUploads));
            handleLog(`[${ticket_id}] Tiket dihapus dari antrian.`);
          } else {
            handleError(`[${ticket_id}] Gagal mengunggah foto, akan dicoba lagi nanti.`);
          }
        } catch (error: any) {
          handleError(`[${ticket_id}] Error saat mengunggah: ${error}`);
        }
      }
    } catch (error: any) {
      handleError(`Error dalam background upload: ${error}`);
    }
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

      {/* Tickets Dropdown */}
      <View className="mt-4">
        <Text className="mb-2 text-lg font-bold">Pilih Tiket yang Tersedia</Text>
        <Picker
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
              const geofenceDescription = geofence.find((g) => g.external_id === ticket.geofence_id)?.description || ticket.description;
              return (
                <Picker.Item key={ticket.id} label={`${geofenceDescription} - ${ticket.description}`} value={ticket.id} />
              );
            })}
        </Picker>
      </View>

      {/* Photo Modal */}
      <Modal
        visible={photoModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => { if (!isUploading) setPhotoModalVisible(false) }}
      >
        <View className="items-center justify-center flex-1 bg-gray-900 bg-opacity-75">
          <View className="w-11/12 max-w-lg p-6 bg-white rounded-lg">
            <Text className="mb-2 text-lg font-bold">Ambil 8 Bukti Foto.</Text>
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
                  // await savePhotoLocally(photos, selectedTicket.ticket_id, userData.user_id);
                  handleStop();
                }}
                className="items-center px-8 py-4 my-4 bg-blue-500 rounded-full"
                activeOpacity={0.7}
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
                className={`items-center px-8 py-4 my-4 rounded-full ${isPhotoProcessed ? "bg-gray-300" : "bg-[#059669]"}`}
                activeOpacity={0.7}
                disabled={isPhotoProcessed}
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
              onPress={() => setPhotoModalVisible(false)}
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
                      value={formData.sn_edc}
                      onChangeText={(text) => handleInputChangeTicketExtras("sn_edc", text)}
                      // placeholder="SN EDC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">MID MTI</Text>
                    <TextInput
                      value={formData.mid_mti}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">TID MTI</Text>
                    <TextInput
                      value={formData.tid_mti}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-x-4 gap-y-4">
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SIM Card</Text>
                    <TextInput
                      value={formData.sim_card}
                      onChangeText={(text) => handleInputChangeTicketExtras("sim_card", text)}
                      // placeholder="SIM Card"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">SAM Card</Text>
                    <TextInput
                      value={formData.sam_card}
                      onChangeText={(text) => handleInputChangeTicketExtras("sam_card", text)}
                      // placeholder="SAM Card"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
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
                      value={formData.edc_notes}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_notes", text)}
                      // placeholder="Catatan/Notes"
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
                      value={formData.mid_mti}
                      onChangeText={(text) => handleInputChangeTicketExtras("mid_mti", text)}
                      // placeholder="MID MTI"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
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
                      value={formData.tid_mti}
                      onChangeText={(text) => handleInputChangeTicketExtras("tid_mti", text)}
                      // placeholder="TID MTI"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
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
                      value={formData.signal_bar}
                      onChangeText={(text) => handleInputChangeTicketExtras("signal_bar", text)}
                      // placeholder="TID MTI"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">Signal Type</Text>
                    <TextInput
                      value={formData.signal_type}
                      onChangeText={(text) => handleInputChangeTicketExtras("signal_type", text)}
                      // placeholder="Signal Type"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
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
                      value={geofence.find((t) => t.external_id === selectedTicket?.geofence_id)?.coordinates?.join(", ") || ""}
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
                      value={formData.pic_name}
                      onChangeText={(text) => handleInputChangeTicketExtras("pic_name", text)}
                      // placeholder="Nama PIC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
                    />
                  </View>
                  <View className="flex-1 mb-4">
                    <Text className="text-sm text-gray-600">No. Telepon PIC</Text>
                    <TextInput
                      value={formData.pic_phone}
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
                      value={formData.edc_priority}
                      onChangeText={(text) => handleInputChangeTicketExtras("edc_priority", text)}
                      // placeholder="Prioritas EDC"
                      className="p-2 mt-2 border border-gray-300 rounded-md"
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
                      value={formData.merchant_comment}
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
                      value={formData.usual_edc}
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
                      value={formData.other_edc}
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
                      value={formData.merchant_request}
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
                      value={formData.promo_material}
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
            <TouchableOpacity
              onPress={() => setTicketExtrasModalVisible(false)}
              className={`items-center px-4 py-2 rounded-full ${isSubmittingTicketExtras ? "bg-gray-300" : "bg-gray-400"}`}
              activeOpacity={0.7}
              disabled={isSubmittingTicketExtras}
            >
              <Text className="text-lg font-bold text-white">
                {isSubmittingTicketExtras ? "Sedang memproses..." : "Tutup"}
              </Text>
            </TouchableOpacity>
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
              <View className="gap-y-2">
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Deskripsi:</Text> {selectedTicket.description}
                </Text>
                <Text className="text-center text-gray-600">
                  <Text className="font-bold">Lokasi Tujuan:</Text> {geofence.find((g) => g.external_id === selectedTicket.geofence_id)?.description}
                </Text>
              </View>
            )}
          </View>
          {tracking && (
            <Text className="mb-4 text-xl text-center">{formatTime(time)}</Text>
          )}

          {/* Idle */}
          {!tracking && (
            <LottieView
              source={require('../../assets/animations/idle1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '50%',
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
          )}

          {/* Working */}
          {tracking && (
            <LottieView
              source={require('../../assets/animations/working1.json')}
              autoPlay
              loop
              style={{
                position: 'absolute',
                top: '50%',
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
          )}
        </View>

        {/* debug */}
        {/* <TouchableOpacity
              onPress={handleDebugPhotoModal}
          +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
          className="items-center w-full px-8 py-4 mb-4 bg-gray-500 rounded-full"
              activeOpacity={0.7}
            >
              <Text className="text-xl font-bold text-white">debug photo modal</Text>
        </TouchableOpacity>

        {ticketExtrasFlag && (
          <TouchableOpacity
            onPress={handleDebugTicketExtrasModal}
            className="items-center w-full px-8 py-4 mb-4 bg-gray-500 rounded-full"
            activeOpacity={0.7}
          >
            <Text className="text-xl font-bold text-white">debug ticket extras</Text>
          </TouchableOpacity>
        )} */}

        {/* Start/Stop Button */}
        <TouchableOpacity
          onPress={tracking ? handleCompletetWithConfirmation : handleStartWithConfirmation}
          className={`items-center w-full py-4 px-8 rounded-full ${isCompleting ? "bg-gray-300" : tracking ? "bg-red-500" : "bg-[#059669]"}`}
          activeOpacity={0.7}
          disabled={isCompleting}
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
                  <Text className="font-bold">Tempat tujuan:</Text> {geofence.find((g) => g.external_id === selectedTicket?.geofence_id)?.description}
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
