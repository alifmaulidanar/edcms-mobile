import { Ionicons } from '@expo/vector-icons';
import React, { useState, useEffect } from "react";
import { addTimestampToPhoto } from "./ImageTimestampAndLocation";
import { launchCameraAsync } from "expo-image-picker";
import { getCurrentPositionAsync } from 'expo-location';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { saveToLibraryAsync, requestPermissionsAsync } from 'expo-media-library';
import { View, Text, Modal, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert } from "react-native";
import { insertTicketPhoto, initTicketPhotoTable } from '../utils/ticketPhotoDB';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';

// Photo configuration based on ticket type
const TICKET_CONFIG = {
  pullout: {
    TOTAL_PHASES: 1,
    PHOTOS_PER_PHASE: [4],
    TOTAL_PHOTOS: 4,
    photoTitles: [
      'Foto EDC',
      'Foto BAST',
      'Foto PIC Merchant',
      'Foto Struk #1',
    ]
  },
  single: {
    TOTAL_PHASES: 2,
    PHOTOS_PER_PHASE: [4, 4],
    TOTAL_PHOTOS: 8,
    photoTitles: [
      'Foto Plang',
      'Foto EDC',
      'Foto SIM Card + SN EDC + SAM Card',
      'Foto Roll Sales Draft',
      'Foto Sales Draft',
      'Foto BAST',
      'Foto Surat Pernyataan Training',
      'Foto PIC Merchant',
    ]
  },
  default: {
    TOTAL_PHASES: 2,
    PHOTOS_PER_PHASE: [4, 4],
    TOTAL_PHOTOS: 8,
    photoTitles: [
      'Foto Plang',
      'Foto EDC',
      'Foto SIM Card + SN EDC + SAM Card',
      'Foto Roll Sales Draft',
      'Foto Sales Draft',
      'Foto BAST',
      'Foto Surat Pernyataan Training',
      'Foto PIC Merchant',
    ]
  },
  sharing: {
    TOTAL_PHASES: 4,
    PHOTOS_PER_PHASE: [5, 5, 5, 4],
    TOTAL_PHOTOS: 19,
    photoTitles: [
      // Phase 1 (1-5)
      'Foto Plang',
      'Foto EDC',
      'Foto Stiker EDC',
      'Foto Screen Gard',
      'Foto SIM Card + SN EDC + SAM Card',
      // Phase 2 (6-10)
      'Foto Sales Draft',
      'Foto PIC Merchant',
      'Foto Roll Sales Draft',
      'Foto Surat Pernyataan Training',
      'Foto Aplikasi EDC',
      // Phase 3 (11-15)
      'Foto Sales Draft Patch L (EDC Konven)',
      'Foto Screen P2G (EDC Android)',
      'Foto BAST',
      'Foto Sales Draft All Member Bank (tampak logo bank)',
      'Foto Sales Draft BMRI',
      // Phase 4 (16-19)
      'Foto Sales Draft BNI',
      'Foto Sales Draft BRI',
      'Foto Sales Draft BTN',
      'Foto No Telepon TY dan No PIC Kawasan/TL di Belakang EDC',
    ]
  }
};

interface MultiPhasePhotoCaptureProps {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  ticketId: string;
  userId: string;
  isConnected: boolean;
  timestamp: string;
  currentLocation?: any;
  ticketType: 'pullout' | 'single' | 'sharing' | 'default';
}

const MultiPhasePhotoCapture: React.FC<MultiPhasePhotoCaptureProps> = ({
  visible, onClose, onComplete, ticketId, userId, isConnected, timestamp, currentLocation, ticketType = 'default'
}) => {
  // Get configuration based on ticket type
  const config = TICKET_CONFIG[ticketType] || TICKET_CONFIG.default;

  // State variables
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [phasePhotos, setPhasePhotos] = useState<string[]>([]);
  const [allPhaseStatus, setAllPhaseStatus] = useState<boolean[]>(
    Array(config.TOTAL_PHASES).fill(false)
  );
  const [totalPhotosTaken, setTotalPhotosTaken] = useState<number>(0);
  const [isPhotoProcessed, setIsPhotoProcessed] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState<boolean>(false);

  // Reset state when ticket type changes
  useEffect(() => {
    setCurrentPhase(1);
    setPhasePhotos([]);
    setAllPhaseStatus(Array(config.TOTAL_PHASES).fill(false));
    setTotalPhotosTaken(0);
  }, [ticketType]);

  // Cleanup when component unmounts
  useEffect(() => {
    return () => {
      setPhasePhotos([]);
      setAllPhaseStatus(Array(config.TOTAL_PHASES).fill(false));
      setTotalPhotosTaken(0);
    };
  }, []);

  // Inisialisasi table SQLite saat komponen mount
  useEffect(() => {
    initTicketPhotoTable();
  }, []);

  // Calculate required photos for current phase
  const getPhasePhotoCount = (phase: number) => {
    return config.PHOTOS_PER_PHASE[phase - 1];
  };

  // Calculate current photo index based on phase
  const getCurrentPhaseStartIndex = () => {
    let startIndex = 0;
    for (let i = 0; i < currentPhase - 1; i++) {
      startIndex += config.PHOTOS_PER_PHASE[i];
    }
    return startIndex;
  };

  // Helper: Cek storage device sebelum simpan foto
  const checkStorageBeforeSave = async (minFreeMB: number = 100): Promise<boolean> => {
    try {
      const freeBytes = await FileSystem.getFreeDiskStorageAsync();
      const freeMB = freeBytes / (1024 * 1024);
      if (freeMB < minFreeMB) {
        handleError(`[Storage] Sisa storage device sangat rendah: ${freeMB.toFixed(2)} MB`);
        Alert.alert(
          'Penyimpanan Hampir Penuh',
          `Sisa penyimpanan di perangkat Anda sangat sedikit (${freeMB.toFixed(2)} MB). Silakan hapus file tidak penting atau sinkronkan foto sebelum mengambil foto baru.`
        );
        return false;
      }
      return true;
    } catch (err) {
      handleError(`[Storage] Error cek storage: ${err}`);
      // Jika gagal cek storage, tetap lanjut (fallback)
      return true;
    }
  };

  // Save photo to gallery
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

  // Refactor: Simpan foto ke file-system dan SQLite
  const savePhotoToLocalDB = async (photoUri: string, ticketId: string, queueOrder: number): Promise<string | null> => {
    // Cek storage sebelum copy file
    const enoughStorage = await checkStorageBeforeSave();
    if (!enoughStorage) return null;
    try {
      // Buat folder khusus per tiket
      const folderUri = `${FileSystem.documentDirectory}photos/${ticketId}/`;
      await FileSystem.makeDirectoryAsync(folderUri, { intermediates: true }).catch(() => { });
      // Nama file: uuid v4
      const uuid = uuidv4();
      const fileName = `${queueOrder.toString().padStart(2, '0')}_${uuid}.jpg`;
      const destUri = folderUri + fileName;
      await FileSystem.copyAsync({ from: photoUri, to: destUri });
      // Insert ke SQLite
      await insertTicketPhoto(ticketId, queueOrder, destUri);
      handleLog(`[Photo] Foto disimpan ke file-system & SQLite: ${destUri}`);
      return destUri;
    } catch (err) {
      handleError(`[Photo] Gagal simpan foto ke lokal: ${err}`);
      return null;
    }
  };

  // Refactor handleTakePhoto
  const handleTakePhoto = async () => {
    setIsPhotoProcessed(true);
    const requiredPhotoCount = getPhasePhotoCount(currentPhase);
    if (phasePhotos.length >= requiredPhotoCount) {
      Alert.alert("Batas Tercapai", `Anda hanya dapat mengambil ${requiredPhotoCount} foto untuk tahap ini.`);
      setIsPhotoProcessed(false);
      return;
    }

    // Cek storage sebelum ambil foto
    const enoughStorage = await checkStorageBeforeSave();
    if (!enoughStorage) {
      setIsPhotoProcessed(false);
      return;
    }

    try {
      // Pastikan currentLocation valid, jika tidak, coba ambil ulang
      let locationToUse = currentLocation;
      if (!locationToUse || !locationToUse.coords || locationToUse.coords.longitude === 0 && locationToUse.coords.latitude === 0) {
        try {
          const freshLoc = await getCurrentPositionAsync({});
          locationToUse = freshLoc;
        } catch (e) {
          if (currentLocation && currentLocation.coords) {
            locationToUse = currentLocation;
          } else {
            locationToUse = { coords: { longitude: 0, latitude: 0 } };
          }
        }
      }

      const result = await launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.3,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        const globalIndex = getCurrentPhaseStartIndex() + phasePhotos.length;
        const processedUri = await addTimestampToPhoto(
          photoUri,
          `${ticketId}-${timestamp}-${globalIndex + 1}.jpg`,
          timestamp,
          locationToUse
        );
        if (processedUri) {
          await savePhotoToGallery(processedUri);
          // Simpan ke file-system & SQLite
          const localUri = await savePhotoToLocalDB(processedUri, ticketId, globalIndex + 1);
          if (localUri) {
            const newPhotos = [...phasePhotos, localUri];
            setPhasePhotos(newPhotos);
            setTotalPhotosTaken(totalPhotosTaken + 1);
            handleLog(`✅ Photo ${globalIndex + 1} berhasil diambil & disimpan (${newPhotos.length}/${requiredPhotoCount} untuk phase ${currentPhase})`);
            if (newPhotos.length === requiredPhotoCount) {
              setTimeout(() => {
                Alert.alert(
                  "Foto Lengkap",
                  `${requiredPhotoCount} foto untuk tahap ${currentPhase} telah lengkap. Silakan lanjut ke tahap berikutnya.`
                );
              }, 500);
            }
          } else {
            handleError(`Gagal simpan foto ke lokal untuk phase ${currentPhase}`);
            Alert.alert("Gagal menyimpan foto", "Silakan coba lagi.");
          }
        } else {
          handleError(`Failed to process photo for phase ${currentPhase}`);
          Alert.alert("Gagal memproses foto", "Silakan coba lagi.");
        }
      }
    } catch (error) {
      handleError(`Error taking photo for phase ${currentPhase}: ${error}`);
      Alert.alert("Kesalahan", "Gagal mengambil foto. Silakan coba lagi.");
    } finally {
      setIsPhotoProcessed(false);
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
            const updatedPhotos = phasePhotos.filter((_, i) => i !== index);
            setPhasePhotos(updatedPhotos);
            setTotalPhotosTaken(totalPhotosTaken - 1);
          },
        },
      ]
    );
  };

  // Handle close modal attempt
  const handleCloseModal = () => {
    if (isUploading) {
      Alert.alert("Perhatian", "Upload sedang berlangsung. Tunggu hingga selesai.");
      return;
    }

    // If photos have been taken but not uploaded, or we're in the middle of phases
    if (phasePhotos.length > 0 || totalPhotosTaken > 0) {
      Alert.alert(
        "Peringatan",
        totalPhotosTaken === 0
          ? "Anda memiliki foto yang belum diunggah. Ingin keluar tanpa mengunggah?"
          : `Anda belum menyelesaikan semua tahap (${currentPhase} dari ${config.TOTAL_PHASES}). Jika keluar sekarang, semua progress akan hilang.`,
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Ya, Keluar",
            style: "destructive",
            onPress: () => {
              onClose();
              handleLog(`User abandoned multi-phase photo capture at phase ${currentPhase} with ${totalPhotosTaken} photos taken`);
            },
          },
        ]
      );
    } else {
      onClose();
    }
  };

  // Calculate progress percentage for phase
  const getPhaseProgress = () => {
    return Math.round((totalPhotosTaken / config.TOTAL_PHOTOS) * 100);
  };

  const handleFinishAndUpload = async () => {
    if (currentPhase < config.TOTAL_PHASES) {
      // Tahap selain terakhir: validasi jumlah foto tahap ini
      if (phasePhotos.length === getPhasePhotoCount(currentPhase)) {
        setAllPhaseStatus(prev => {
          const updated = [...prev];
          updated[currentPhase - 1] = true;
          return updated;
        });
        setCurrentPhase(currentPhase + 1);
        setPhasePhotos([]);
      } else {
        Alert.alert('Foto Belum Cukup', `Ambil semua foto untuk tahap ini sebelum lanjut.`);
      }
    } else {
      // Tahap terakhir: validasi total foto
      const totalRequired = config.TOTAL_PHOTOS;
      if (totalPhotosTaken >= totalRequired) {
        setIsFinishing(true);
        Alert.alert(
          'Sinkronisasi Manual',
          'Foto sudah cukup. Sinkronisasi foto harus dilakukan manual melalui halaman tiket. Lanjutkan ke pengisian berita acara.',
          [
            {
              text: 'OK', onPress: () => {
                setTimeout(() => {
                  setIsFinishing(false);
                }, 3000);
                onComplete();
              }
            }
          ]
        );
      } else {
        Alert.alert('Foto Belum Cukup', `Anda harus mengambil minimal ${totalRequired} foto sesuai ketentuan sebelum melanjutkan.`);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCloseModal}
    >
      <View className="items-center justify-center flex-1 bg-gray-900 bg-opacity-75">
        <View className="w-11/12 max-w-lg p-6 bg-white rounded-lg">
          {/* Connection status */}
          <Text className={`text-sm font-bold text-center py-2 px-4 rounded-full ${isConnected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {isConnected ? 'Koneksi Internet Stabil' : 'Tidak Ada Koneksi Internet'}
          </Text>

          {/* Ticket type indicator */}
          {/* <View className="mt-2 mb-4">
            <Text className="font-semibold text-center text-blue-600">
              Jenis Tiket: {ticketType.charAt(0).toUpperCase() + ticketType.slice(1)}
              ({config.TOTAL_PHOTOS} foto)
            </Text>
          </View> */}

          {/* Phase indicator */}
          <View className="flex-row items-center justify-between mt-4 mb-2">
            {Array.from({ length: config.TOTAL_PHASES }).map((_, index) => (
              <View key={index} className="items-center">
                <View
                  className={`w-8 h-8 rounded-full flex items-center justify-center 
                    ${currentPhase > index + 1
                      ? 'bg-green-500'
                      : currentPhase === index + 1
                        ? 'bg-blue-500'
                        : 'bg-gray-300'}`}
                >
                  <Text className="font-bold text-white">{index + 1}</Text>
                </View>
                {allPhaseStatus[index] && (
                  <Ionicons name="checkmark-circle" size={14} color="green" className="absolute -right-1 -top-1" />
                )}
              </View>
            ))}
          </View>

          {/* Progress bar */}
          <View className="w-full h-2 mb-4 bg-gray-200 rounded-full">
            <View
              className="h-2 bg-blue-500 rounded-full"
              style={{ width: `${getPhaseProgress()}%` }}
            />
          </View>
          <Text className="mb-2 text-lg font-bold">
            Tahap {currentPhase} dari {config.TOTAL_PHASES} - Ambil {getPhasePhotoCount(currentPhase)} Foto
          </Text>
          <Text className="mb-4 text-gray-500">
            {`Total: ${totalPhotosTaken}/${config.TOTAL_PHOTOS} foto. Ambil ${getPhasePhotoCount(currentPhase)} foto untuk tahap ini.`}
          </Text>

          {/* Photo Grid */}
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 24 }}>
            <View className="flex flex-row flex-wrap justify-between gap-2">
              {Array.from({ length: getPhasePhotoCount(currentPhase) }).map((_, index) => {
                const globalIndex = getCurrentPhaseStartIndex() + index;

                return (
                  <View
                    key={index}
                    className="relative overflow-hidden bg-gray-100 border border-gray-300 rounded-md"
                    style={{ width: "48%", aspectRatio: 1 }}
                  >
                    <View className="p-1 bg-gray-700 rounded-t-sm">
                      <Text className="px-1 text-sm text-white">
                        {globalIndex + 1}. {config.photoTitles[globalIndex] || `Foto ${globalIndex + 1}`}
                      </Text>
                    </View>

                    {phasePhotos[index] ? (
                      <TouchableOpacity onPress={() => handlePreviewPhoto(phasePhotos[index])}>
                        <Image
                          source={{ uri: phasePhotos[index] }}
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
                      <View className="items-center justify-center flex-1">
                        <Text className="text-center text-gray-600">Belum ada foto</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          {/* Action Buttons */}
          <View className="mt-4">
            <View className="items-center w-full mt-2">
              <Text className="text-sm font-bold text-center text-red-500">
                Pastikan semua foto sudah benar karena Anda tidak dapat kembali ke tahap sebelumnya.
              </Text>
            </View>
            {phasePhotos.length === getPhasePhotoCount(currentPhase) ? (
              <TouchableOpacity
                onPress={handleFinishAndUpload}
                disabled={isUploading || isFinishing}
                className={`items-center px-8 py-4 my-2 rounded-full ${(isUploading || isFinishing) ? "bg-gray-300" : "bg-blue-500"}`}
                activeOpacity={0.7}
              >
                {isUploading || isFinishing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-xl font-bold text-white">
                    {currentPhase < config.TOTAL_PHASES
                      ? `Unggah dan lanjut ke tahap ${currentPhase + 1}`
                      : "Selesai dan unggah"}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handleTakePhoto}
                  disabled={isPhotoProcessed}
                  className={`items-center px-8 py-4 my-2 rounded-full ${isPhotoProcessed ? "bg-gray-300" : "bg-[#059669]"}`}
                  activeOpacity={0.7}
                >
                  {isPhotoProcessed ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-xl font-bold text-white">Ambil foto sekarang</Text>
                  )}
                </TouchableOpacity>

                {/* Debug Buttons */}
                {/* <View className="flex-row justify-between mt-4">
                  <TouchableOpacity
                    onPress={() => {
                      if (currentPhase > 1) {
                        setCurrentPhase(currentPhase - 1);
                        setPhasePhotos([]);
                      }
                    }}
                    className="items-center px-4 py-2 bg-yellow-500 rounded-full"
                    activeOpacity={0.7}
                  >
                    <Text className="text-lg font-bold text-white">Debug: Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (currentPhase < config.TOTAL_PHASES) {
                        setCurrentPhase(currentPhase + 1);
                        setPhasePhotos([]);
                      }
                    }}
                    className="items-center px-4 py-2 bg-yellow-500 rounded-full"
                    activeOpacity={0.7}
                  >
                    <Text className="text-lg font-bold text-white">Debug: Next</Text>
                  </TouchableOpacity>
                </View> */}
              </>
            )}
          </View>

          {/* Upload Progress */}
          {isUploading && (
            <View className="mt-2 mb-4">
              <Text className="text-center text-gray-600">{uploadMessage}</Text>
              <View className="relative w-full h-4 mt-2 bg-gray-200 rounded-full">
                <View
                  className="absolute top-0 left-0 h-4 bg-blue-500 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </View>
            </View>
          )}

          {/* Close Button (only enabled when not uploading) */}
          {!isUploading && (
            <TouchableOpacity
              onPress={handleCloseModal}
              disabled={isFinishing}
              className="items-center px-4 py-2 mt-2 bg-gray-400 rounded-full"
              activeOpacity={0.7}
            >
              <Text className="text-lg font-bold text-white">Tutup</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
                    const index = phasePhotos.findIndex((photo) => photo === previewPhoto);
                    if (index !== -1) {
                      handleDeletePhoto(index);
                    }
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
    </Modal>
  );
};

export default MultiPhasePhotoCapture;
