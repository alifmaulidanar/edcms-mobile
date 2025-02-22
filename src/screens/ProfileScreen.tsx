import { Profile } from "../types";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import { getProfile, logout } from "../api/auth";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View, Text, ScrollView, Image, RefreshControl, TouchableOpacity, Modal, ActivityIndicator } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInitialData = async () => {
    try {
      const userData = await AsyncStorage.getItem("userData");
      if (userData) {
        setProfile(JSON.parse(userData));
      }
    } catch (error) {
      console.error("Error reading userData from AsyncStorage:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      setIsRefreshing(true);
      if (profile) {
        const response = await getProfile(profile.user_id);
        setProfile(response);
        await AsyncStorage.setItem("userData", JSON.stringify(response));
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    setStringAsync(text);
    alert("ID pengguna telah disalin ke clipboard!");
  };

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    hideDialog();
    await AsyncStorage.removeItem("userData");
    navigation.navigate("Login");
  };

  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  // App Version
  const appVersion = Constants.expoConfig?.version;

  useEffect(() => {
    fetchInitialData();
  }, []);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-[#f5f5f5]">
        <ActivityIndicator size="large" color="#84439b" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#f5f5f5] p-6 mt-8"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={fetchProfile} />
      }
    >
      <View className="flex items-end w-full mb-4">
        <TouchableOpacity onPress={showDialog} className="flex items-center">
          <View className="flex-row items-center justify-center px-4 py-2 bg-red-500 rounded-full gap-x-2">
            <Text className="font-semibold text-white rounded-full">Keluar</Text>
            <Ionicons name="log-out-outline" size={20} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      <View className="flex items-center justify-center py-8 bg-white shadow-sm rounded-3xl">
        {profile?.avatar ? (
          <Image
            source={{ uri: profile.avatar }}
            className="w-24 h-24 border-4 border-gray-200 rounded-full"
          />
        ) : (
          <View className="flex items-center justify-center w-24 h-24 bg-gray-200 rounded-full">
            <Text className="text-gray-500">No Image</Text>
          </View>
        )}
        <Text className="mt-4 text-lg font-semibold text-gray-800">
          {profile?.username || "Loading..."}
        </Text>
        <View className="flex-row items-center mt-2">
          <Text className="text-sm text-gray-600">{profile?.user_id || ""}</Text>
          {profile?.user_id && (
            <TouchableOpacity
              onPress={() => copyToClipboard(`ID Pengguna (${profile.username}): ${profile.user_id}`)}
              className="ml-2"
            >
              <Ionicons name="copy-outline" size={16} color="#4F46E5" />
            </TouchableOpacity>
          )}
        </View>

        <View className="w-full px-6 pt-8 pb-2">
          <Text className="mb-4 text-base font-bold text-gray-700">
            Informasi Pribadi
          </Text>
          {profile ? (
            <View className="gap-y-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Email</Text>
                <Text className="font-medium text-gray-800">{profile.email}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">No. Telepon (HP)</Text>
                <Text className="font-medium text-gray-800">{profile.phone}</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Dibuat pada</Text>
                <Text className="font-medium text-gray-800">
                  {(() => {
                    const createdAt = new Date(profile.created_at);
                    const day = String(createdAt.getDate()).padStart(2, "0");
                    const month = String(createdAt.getMonth() + 1).padStart(2, "0");
                    const year = createdAt.getFullYear();
                    const hours = String(createdAt.getHours()).padStart(2, "0");
                    const minutes = String(createdAt.getMinutes()).padStart(2, "0");
                    const seconds = String(createdAt.getSeconds()).padStart(2, "0");
                    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                  })()}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Diperbarui pada</Text>
                <Text className="font-medium text-gray-800">
                  {(() => {
                    const updatedAt = new Date(profile.updated_at);
                    const day = String(updatedAt.getDate()).padStart(2, "0");
                    const month = String(updatedAt.getMonth() + 1).padStart(2, "0");
                    const year = updatedAt.getFullYear();
                    const hours = String(updatedAt.getHours()).padStart(2, "0");
                    const minutes = String(updatedAt.getMinutes()).padStart(2, "0");
                    const seconds = String(updatedAt.getSeconds()).padStart(2, "0");
                    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds} WIB`;
                  })()}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Status</Text>
                <Text className="font-medium text-gray-800">
                  {profile.status === "active" ? "Aktif" : "Tidak Aktif"}
                </Text>
              </View>
            </View>
          ) : (
            <Text className="text-center text-gray-500">
              Data pengguna tidak tersedia.
            </Text>
          )}
        </View>
      </View>

      {/* App Version */}
      <Text className="mt-4 text-center text-gray-600">
        Versi: {appVersion}
      </Text>
      <View className="flex justify-center mx-12 my-8 text-center text-gray-600">
        <Text className="mb-6 text-sm text-center">Jangan keluar dari akun Anda tanpa instruksi dari Admin.</Text>
        <Text className="mb-6 text-sm text-center">Keluar dari akun Anda dapat menyebabkan tiket dan foto tidak tersimpan dan rusak. Hindari risiko ini dengan tidak keluar dari akun Anda dan tidak mencopot (<Text className="italic">uninstall</Text>) aplikasi ini.</Text>
      </View>

      {/* Logout Confirmation Modal */}
      {visible && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={visible}
          onRequestClose={hideDialog}
        >
          <View className="items-center justify-center flex-1 bg-black bg-opacity-50">
            <View className="p-6 bg-white rounded-lg w-80">
              <Text className="mb-4 text-xl text-center">Apakah yakin ingin logout?</Text>
              <Text className="mb-6 text-center">Jangan keluar dari akun Anda tanpa instruksi dari Admin.</Text>
              <Text className="mb-6 text-center">Keluar dari akun Anda dapat menyebabkan tiket dan foto tidak tersimpan dan rusak. Hindari risiko ini dengan tidak keluar dari akun Anda dan tidak mencopot (<Text className="italic">uninstall</Text>) aplikasi ini.</Text>
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
    </ScrollView>
  );
};

export default ProfileScreen;
