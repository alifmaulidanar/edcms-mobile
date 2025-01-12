import moment from "moment-timezone";
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import { getTickets } from '../api/tickets';
import { Geofence, Ticket } from '../types';
import LottieView from 'lottie-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from "expo-image-picker";
import { getAllGeofences } from '../api/geofences';
import { Picker } from '@react-native-picker/picker';
import * as ImageManipulator from 'expo-image-manipulator';
import React, { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { cancelTrip, startBackgroundTracking, stopBackgroundTracking } from "../utils/radar";
import { View, Alert, Text, Modal, TouchableOpacity, ScrollView, RefreshControl, Image, ActivityIndicator } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

const compressImage = async (uri: string) => {
  const manipResult = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }], // Resize to a width of 800px
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG } // Compress to 50%
  );
  return manipResult.uri;
};

const MainScreen: React.FC<Props> = ({ navigation }) => {
  const [tracking, setTracking] = useState(false);
  const [time, setTime] = useState(0);  // To store the time in seconds
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [geofence, setGeofence] = useState<Geofence[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentTicketID, setCurrentTicketID] = useState<string | null>(null);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);

  // Get user data from Redux store
  const userData = useSelector((state: RootState) => state.user);

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
    if (photos.length < 4) {
      setPhotoModalVisible(true);
      return;
    }
    await handleUploadPhotos();
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
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      if (photos.length < 4) {
        if (result.assets && result.assets.length > 0) {
          setPhotos([...photos, result.assets[0].uri]);
        }
      } else {
        Alert.alert("Limit Exceeded", "You can only upload up to 4 photos.");
      }
    }
  };

  // Handle photo preview
  const handlePreviewPhoto = (uri: string) => {
    setPreviewPhoto(uri);
  };

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

  // Handle upload photos
  const handleUploadPhotos = async () => {
    const ticket_id = currentTicketID || selectedTicket?.ticket_id;
    const user_id = userData?.user_id || '';
    if (typeof ticket_id !== 'string') {
      console.error('Invalid ticket_id:', ticket_id);
      Alert.alert('Kesalahan', 'ticket_id tidak valid.');
      return;
    }

    if (user_id === '') {
      console.error('Invalid user_id:', user_id);
      Alert.alert('Kesalahan', 'user_id tidak valid.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();

      // Compress and append photos to FormData (~200KB each)
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const compressedUri = await compressImage(photo);
        const timestamp = moment().tz("Asia/Jakarta").format("DDMMYY-HHmmss");
        const photoBlob = {
          uri: compressedUri,
          type: "image/jpeg",
          name: `${ticket_id}-${timestamp}-${i + 1}.jpg`,
        } as any;
        formData.append("photos", photoBlob);
      }

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/ticket/photos/upload/${ticket_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "multipart/form-data",
          "user_id": user_id,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Foto gagal diunggah.");
      }

      Alert.alert("Sukses", "Foto berhasil diunggah.");
      await handleStop();
      setPhotos([]);
    } catch (error) {
      console.error("Error uploading photos:", error);
      Alert.alert("Error", (error as Error).message);
    } finally {
      setIsUploading(false);
      setPhotoModalVisible(false);
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
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View className="items-center justify-center flex-1 bg-gray-900 bg-opacity-75">
          <View className="w-11/12 max-w-lg p-6 bg-white rounded-lg">
            <Text className="mb-2 text-lg font-bold">Ambil Bukti Foto.</Text>
            <Text className="mb-4 text-gray-500">Ambil 4 foto untuk menyelesaikan tiket.</Text>

            {/* Photo Grid */}
            <View className="flex flex-row flex-wrap justify-between gap-2 mb-4">
              {Array.from({ length: 4 }).map((_, index) => (
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

            {/* Action Button */}
            {photos.length === 4 ? (
              <TouchableOpacity
                onPress={handleUploadPhotos}
                className="items-center px-8 py-4 mb-4 bg-blue-500 rounded-full"
                activeOpacity={0.7}
                disabled={isUploading}
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
                className="items-center px-8 py-4 mb-4 bg-[#059669] rounded-full"
                activeOpacity={0.7}
              >
                <Text className="text-xl font-bold text-white">Ambil foto sekarang</Text>
              </TouchableOpacity>
            )}

            {/* Close Modal Button */}
            <TouchableOpacity
              onPress={() => setPhotoModalVisible(false)}
              className="items-center px-4 py-2 bg-gray-400 rounded-full"
              activeOpacity={0.7}
            >
              <Text className="text-lg font-bold text-white">Tutup</Text>
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
            <Text className="mb-4 text-xl text-center">
              {formatTime(time)}
            </Text>
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
            <Text className="text-xl font-bold text-white">
              Batalkan
            </Text>
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
                    handleStart(); // Panggil fungsi handleStart
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
