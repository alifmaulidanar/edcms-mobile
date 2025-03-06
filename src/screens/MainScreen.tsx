import moment from "moment-timezone";
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import { getTickets } from '../api/tickets';
import { Geofence, Ticket } from '../types';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllGeofences } from '../api/geofences';
import { Picker } from '@react-native-picker/picker';
import { getCurrentPositionAsync } from 'expo-location';
import React, { useState, useEffect, useCallback } from "react";
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchCameraAsync, MediaTypeOptions } from "expo-image-picker";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { addTimestampToPhoto } from "../components/ImageTimestampAndLocation";
import { requestPermissionsAsync, saveToLibraryAsync } from 'expo-media-library';
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl, Image, ActivityIndicator } from "react-native";

const requiredPhotoCount = parseInt(process.env.EXPO_PUBLIC_REQUIRED_PHOTO_COUNT);

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const compressImage = async (uri: string) => {
  const manipResult = await manipulateAsync(
    uri,
    [{ resize: { width: 800 } }], // Resize to a width of 800px
    { compress: 0.5, format: SaveFormat.JPEG, base64: true }, // Compress to 50%
  );
  return manipResult.uri;
};

const MainScreen: React.FC<Props> = ({ navigation }) => {
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [timestamp, setTimestamp] = useState(moment().tz("Asia/Jakarta").format("DDMMYY-HHmmss"));
  const [tracking, setTracking] = useState(false);
  const [time, setTime] = useState(0);  // To store the time in seconds
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [currentTicketID, setCurrentTicketID] = useState<string | null>(null);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

  useEffect(() => {
    // AsyncStorage.removeItem("pendingUploads");
    // const queue = AsyncStorage.getItem("pendingUploads");
    const interval = setInterval(uploadPendingPhotos, 120000); // Cek setiap 2 menit
    return () => clearInterval(interval);
  }, []);

  // Fetch tickets dari API
  const fetchTickets = useCallback(async () => {
    try {
      if (userData) {
        const response = await getTickets(userData.user_id);
        setTickets(response);
      }
    } catch (error: any) {
      console.error("Error fetching tickets:", error.message);
    }
  }, [userData]);

  const fetchGeofences = useCallback(async () => {
    try {
      const response = await getAllGeofences();
      setGeofence(response);
    } catch (error: any) {
      console.error("Error fetching geofences:", error.message);
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
      console.log('Trip started');
      setTracking(true);
    } catch (error: any) {
      Alert.alert("Failed to start tracking", error.message);
    }
  };

  const handleCompleteTrip = async () => {
    const ticket_id = currentTicketID || selectedTicket?.ticket_id;
    if (!ticket_id || typeof ticket_id !== 'string') {
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
        await AsyncStorage.removeItem("startTime"); // Clear AsyncStorage
        await AsyncStorage.removeItem("selectedTicket");
        setTracking(false); // Reset state
        setPhotos([]);
        setSelectedTicket(null);
        setTime(0);
        setCurrentLocation(null);
        setUploadProgress(0);
        Alert.alert("Sukses", "Foto berhasil diunggah.");
        setIsUploading(false);
        setPhotoModalVisible(false);
        onRefresh();
      }
    } catch (error) {
      console.error("Error stopping trip:", error);
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
        onRefresh();
      }
    } catch (error) {
      console.error("Error canceling trip:", error);
    }
  };

  const handleStartWithConfirmation = () => {
    if (!selectedTicket) {
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
        } catch (error) {
          console.error("Error updating time:", error);
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
      } catch (error) {
        console.error("Error loading tracking data:", error);
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

  // Handle picking photo
  const handleTakePhoto = async () => {
    const result = await launchCameraAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.5,
    });

    if (!result.canceled && result.assets.length > 0) {
      const photoUri = result.assets[0].uri;
      if (photos.length < requiredPhotoCount) {
        setPhotos([...photos, photoUri]);
      } else {
        Alert.alert("Batas Tercapai", `Anda hanya dapat mengambil ${requiredPhotoCount} foto.`);
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
  const savePhotoLocally = async (photoUris: string[], ticketId: string, userId: string) => {
    try {
      const storedData = await AsyncStorage.getItem("pendingUploads");
      let pendingUploads = storedData ? JSON.parse(storedData) : [];
      if (!Array.isArray(pendingUploads)) {
        pendingUploads = [];
      }

      let ticketData = pendingUploads.find((item: any) => item.ticket_id === ticketId);
      if (!ticketData) {
        ticketData = { ticket_id: ticketId, user_id: userId, photos: [], timestamp: timestamp, location: currentLocation };
        pendingUploads.push(ticketData);
      }

      ticketData.photos = Array.from(new Set([...ticketData.photos, ...photoUris]));
      await AsyncStorage.setItem("pendingUploads", JSON.stringify(pendingUploads));
      // console.log(`✅ Semua foto untuk tiket ${ticketId} telah disimpan.`);
    } catch (error) {
      console.error("❌ Error saving photos locally:", error);
    }
  };

  // Background photo upload
  const uploadPendingPhotos = async () => {
    try {
      let storedData = await AsyncStorage.getItem("pendingUploads");
      let pendingUploads = storedData ? JSON.parse(storedData) : [];
      if (!Array.isArray(pendingUploads) || pendingUploads.length === 0) {
        // console.log("📭 Tidak ada foto yang perlu diunggah.");
        return;
      }

      // console.log(`📦 Jumlah tiket dalam antrian: ${pendingUploads.length}`);
      let updatedUploads = [...pendingUploads]; // Salinan array untuk diubah
      for (let i = 0; i < pendingUploads.length; i++) {
        const { ticket_id, user_id, photos } = pendingUploads[i];
        if (!ticket_id || !user_id || !Array.isArray(photos) || photos.length !== requiredPhotoCount) {
          // console.error(`⚠️ Data tiket ${ticket_id} tidak valid, melewati tiket ini...`);
          continue;
        }

        // console.log(`🚀 Memproses tiket ${ticket_id} dengan ${photos.length} foto.`);
        const formData = new FormData();
        let isSuccess = true;
        for (let j = 0; j < photos.length; j++) {
          try {
            const compressedUri = await compressImage(photos[j]);
            const fileName = `${ticket_id}-${photos[j].timestamp}-${j + 1}.jpg`;
            let timestampedPhoto = await addTimestampToPhoto(compressedUri, fileName, pendingUploads[i].timestamp, pendingUploads[i].location);
            let retryCount = 0;

            while (!timestampedPhoto && retryCount < 3) {
              // console.log(`🔄 Menunggu ulang pendingUploads[i].timestamp untuk ${fileName}... Percobaan ke-${retryCount + 1}`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              timestampedPhoto = await addTimestampToPhoto(compressedUri, fileName, pendingUploads[i].timestamp, pendingUploads[i].location);
              retryCount++;
            }

            if (!timestampedPhoto) {
              console.error(`❌ Gagal menambahkan timestamp ke foto ${fileName}.`);
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
              console.log("🚫 Izin untuk menyimpan ke galeri ditolak.");
            }
          } catch (error) {
            console.error(`❌ Gagal memproses foto ${j + 1} untuk tiket ${ticket_id}:`, error);
            isSuccess = false;
            break;
          }
        }

        if (!isSuccess) {
          // console.log(`⚠️ Tiket ${ticket_id} tidak dapat diproses, akan dicoba lagi nanti.`);
          continue;
        }

        // console.log(`📤 Mengunggah semua foto untuk tiket ${ticket_id}...`);
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
            // console.log(`✅ [${ticket_id}] Semua foto berhasil diunggah.`);
            updatedUploads = updatedUploads.filter(item => item.ticket_id !== ticket_id);
            await AsyncStorage.setItem("pendingUploads", JSON.stringify(updatedUploads));
            // console.log(`🗑️ [${ticket_id}] Tiket dihapus dari antrian.`);
          } else {
            console.error(`❌ [${ticket_id}] Gagal mengunggah foto, akan dicoba lagi nanti.`);
          }
        } catch (error) {
          console.error(`❌ [${ticket_id}] Error saat mengunggah:`, error);
        }
      }
    } catch (error) {
      console.error("❌ Error dalam background upload:", error);
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
            <Text className="mb-2 text-lg font-bold">Ambil Bukti Foto.</Text>
            <Text className="mb-4 text-gray-500">Ambil {requiredPhotoCount} foto untuk menyelesaikan tiket.</Text>

            {/* Photo Grid */}
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={true}>
              <View className="flex flex-row flex-wrap justify-between gap-2 mb-4">
                {Array.from({ length: requiredPhotoCount }).map((_, index) => (
                  <View
                    key={index}
                    className="relative overflow-hidden bg-gray-100 border border-gray-300 rounded-md"
                    style={{ width: "48%", aspectRatio: 1 }}
                  >
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
                      <Text className="text-center text-gray-400">Tidak ada foto</Text>
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
                  await savePhotoLocally(photos, selectedTicket.ticket_id, userData.user_id);
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
                onPress={handleTakePhoto}
                className="items-center px-8 py-4 my-4 bg-[#059669] rounded-full"
                activeOpacity={0.7}
              >
                <Text className="text-xl font-bold text-white">Ambil foto sekarang</Text>
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

      {/* Activity Card */}
      <View className="items-center justify-start flex-1 p-8 mt-4 bg-white rounded-3xl">
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

        {/* Start/Stop Button */}
        <TouchableOpacity
          onPress={tracking ? handleCompletetWithConfirmation : handleStartWithConfirmation}
          className={`items-center w-full py-4 px-8 rounded-full ${tracking ? "bg-red-500" : "bg-[#059669]"}`}
          activeOpacity={0.7}
        >
          <Text className="text-xl font-bold text-white">
            {tracking ? "Selesai" : "Mulai Bekerja"}
          </Text>
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
    </ScrollView>
  );
};

export default MainScreen;
