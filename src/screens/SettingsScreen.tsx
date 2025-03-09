import { Modal } from "react-native";
import { logout } from "../api/auth";
import Constants from "expo-constants";
import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";


type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const [visible, setVisible] = useState(false);
  // const [darkMode, setDarkMode] = useState(false);
  // const [notifications, setNotifications] = useState(true);

  // App Version
  const appVersion = Constants.expoConfig?.version;

  const handleLogout = async () => {
    await logout();
    hideDialog();
    await AsyncStorage.removeItem("userData");
    navigation.navigate("Login");
  };

  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  return (
    <View className="flex-1 bg-[#f5f5f5] p-4 mt-6">
      <Text className="mb-6 text-2xl font-semibold text-gray-700">Setelan</Text>

      {/* Akun */}
      {/* <Text className="mb-2 text-lg font-semibold text-gray-600">Akun</Text> */}
      {/* <TouchableOpacity className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg">
        <Text className="text-gray-700">Ganti Kata Sandi</Text>
        <Ionicons name="chevron-forward" size={20} color="gray" />
      </TouchableOpacity> */}

      {/* Preferensi */}
      {/* <Text className="mb-2 text-lg font-semibold text-gray-600">Preferensi</Text>
      <View className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg">
      <Text className="text-gray-700">Mode Gelap</Text>
      <Switch value={darkMode} onValueChange={() => setDarkMode(!darkMode)} />
      </View>
      <View className="flex-row items-center justify-between p-4 mb-4 bg-white rounded-lg">
      <Text className="text-gray-700">Notifikasi</Text>
      <Switch value={notifications} onValueChange={() => setNotifications(!notifications)} />
      </View> */}

      {/* Tentang */}
      <Text className="mb-2 text-lg font-semibold text-gray-600">Tentang Aplikasi</Text>
      <View className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg">
        <Text className="text-gray-700">Nama Aplikasi</Text>
        <Text className="text-gray-500">{process.env.EXPO_PUBLIC_APP_NAME}</Text>
      </View>
      <View className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg">
        <Text className="text-gray-700">Versi</Text>
        <Text className="text-gray-500">{appVersion}</Text>
      </View>
      <TouchableOpacity
        className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg"
        onPress={() => navigation.navigate("PrivacyPolicy")}
      >
        <Text className="text-gray-700">Kebijakan Privasi</Text>
        <Ionicons name="chevron-forward" size={20} color="gray" />
      </TouchableOpacity>
      {/* <TouchableOpacity className="flex-row items-center justify-between p-4 mb-2 bg-white rounded-lg">
        <Text className="text-gray-700">Bantuan & Dukungan</Text>
        <Ionicons name="chevron-forward" size={20} color="gray" />
      </TouchableOpacity> */}

      <View className="mt-40">
        <View className="flex justify-center mx-4 my-6 text-center text-gray-600">
          <Text className="mb-4 text-sm text-center">Jangan keluar dari akun Anda tanpa instruksi dari Admin.</Text>
          <Text className="text-sm text-center">Keluar dari akun Anda dapat menyebabkan tiket dan foto tidak tersimpan dan rusak. Hindari risiko ini dengan tidak keluar dari akun Anda dan tidak mencopot (<Text className="italic">uninstall</Text>) aplikasi ini.</Text>
        </View>
        <TouchableOpacity
          onPress={showDialog}
          className="flex-row items-center justify-between p-4 mb-4 bg-white rounded-lg"
        >
          <Text className="text-red-500">Keluar</Text>
          <Ionicons name="log-out" size={20} color="#f15a5a" />
        </TouchableOpacity>
      </View>

      {visible && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={visible}
          onRequestClose={hideDialog}
        >
          <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
            <View className="p-6 bg-white rounded-lg w-80">
              <Text className="mb-4 text-xl text-center">Apakah yakin ingin keluar dari akun Anda?</Text>
              <Text className="mb-6 text-center">
                Jangan keluar dari akun Anda tanpa instruksi dari Admin karena akan berakibat fatal bagi data Anda.
              </Text>
              <View className="flex-row justify-between">
                <TouchableOpacity
                  onPress={hideDialog}
                  className="px-4 py-2 bg-gray-500 rounded"
                >
                  <Text className="text-white">Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLogout}
                  className="px-4 py-2 bg-red-500 rounded"
                >
                  <Text className="text-white">Keluar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

export default SettingsScreen;
