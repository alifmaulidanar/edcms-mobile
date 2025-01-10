import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Alert, Linking, TouchableOpacity } from 'react-native';

// Props for the component
interface LocationPermissionModalProps {
  onPermissionsGranted: () => void;
}

// LocationPermissionModal component
const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({ onPermissionsGranted }) => {
  const [foregroundStatus, setForegroundStatus] = useState<string | null>(null);
  const [backgroundStatus, setBackgroundStatus] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  // Function to check permissions
  const checkPermissions = async () => {
    const { status: foreground } = await Location.getForegroundPermissionsAsync();
    setForegroundStatus(foreground);

    const { status: background } = await Location.getBackgroundPermissionsAsync();
    setBackgroundStatus(background);

    if (foreground === 'granted' && background === 'granted') {
      setModalVisible(false);
      onPermissionsGranted();
    } else {
      setModalVisible(true);
    }
  };

  useEffect(() => {
    const checkPermissions = async () => {
      const { status: foreground } = await Location.getForegroundPermissionsAsync();
      setForegroundStatus(foreground);
      const { status: background } = await Location.getBackgroundPermissionsAsync();
      setBackgroundStatus(background);
      if (foreground !== 'granted' || background !== 'granted') {
        setModalVisible(true);
      } else {
        onPermissionsGranted();
      }
    };
    checkPermissions();
  }, []);

  // Function to request foreground permission
  const requestForegroundPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setForegroundStatus(status);
    if (status === 'denied') {
      Alert.alert(
        'Permission Denied',
        'You have denied foreground location permission. Please enable it in settings.',
        [
          { text: 'Go to Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', onPress: () => { } },
        ]
      );
    } else if (status === 'granted') {
      checkPermissions();
    }
  };

  // Function to request background permission
  const requestBackgroundPermission = async () => {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    setBackgroundStatus(status);
    if (status === 'denied') {
      Alert.alert(
        'Permission Denied',
        'You have denied background location permission. Please enable it in settings.',
        [
          { text: 'Go to Settings', onPress: () => Linking.openSettings() },
          { text: 'Cancel', onPress: () => { } },
        ]
      );
    } else if (status === 'granted') {
      checkPermissions();
    }
  };

  const handleCloseModal = () => {
    setModalVisible(false);
  };

  return (
    <View className="items-center justify-center px-6 pt-6 bg-transparent">
      <Text className="mb-4 font-semibold text-center text-md">Status Izin Akses Aplikasi</Text>
      {/* Foreground Status */}
      <View className="flex-row items-center mb-4">
        <Text className="mr-2 font-medium text-gray-700">Foreground:</Text>
        <View className={
          `flex-row items-center justify-center ${foregroundStatus === 'granted'
            ? 'bg-green-500'
            : 'bg-red-500'
          } text-white rounded-full py-1 px-3 shadow-md`
        }
        >
          <Text className="font-semibold text-white">{foregroundStatus}</Text>
        </View>
      </View>

      {/* Background Status */}
      <View className="flex-row items-center mb-4">
        <Text className="mr-2 font-medium text-gray-700">Background:</Text>
        <View
          className={
            `flex-row items-center justify-center ${backgroundStatus === 'granted'
              ? 'bg-green-500'
              : 'bg-red-500'
            } text-white rounded-full py-1 px-3 shadow-md`
          }
        >
          <Text className="font-semibold text-white">{backgroundStatus}</Text>
        </View>
      </View>

      {/* Modal for location permission */}
      {(backgroundStatus || foregroundStatus !== 'granted') && (
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={handleCloseModal}
        >
          <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
            <View className="p-6 bg-white rounded-lg shadow-lg w-80">
              <Text className="mb-6 text-lg font-semibold text-center text-gray-800">
                Izinkan Akses Lokasi
              </Text>

              {/* Foreground Permission */}
              {foregroundStatus !== 'granted' && (
                <TouchableOpacity
                  onPress={requestForegroundPermission}
                  className="bg-[#84439b] py-3 px-4 rounded-lg mb-4 w-full items-center"
                >
                  <Text className="font-semibold text-white">Izinkan Foreground</Text>
                </TouchableOpacity>
              )}

              {/* Background Permission */}
              {backgroundStatus !== 'granted' && (
                <TouchableOpacity
                  onPress={requestBackgroundPermission}
                  className="bg-[#84439b] py-3 px-4 rounded-lg mb-4 w-full items-center"
                >
                  <Text className="font-semibold text-white">Izinkan Background</Text>
                </TouchableOpacity>
              )}

              {/* Reject Button */}
              <TouchableOpacity
                onPress={handleCloseModal}
                className="items-center w-full px-4 py-3 bg-gray-300 rounded-lg"
              >
                <Text className="font-semibold text-gray-800">Tolak (Tidak bisa login)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default LocationPermissionModal;
