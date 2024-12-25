import { Profile } from "../types";
import { RootState } from "../store";
import { useSelector } from "react-redux";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { getProfile, logout } from "../api/auth";
import React, { useEffect, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View, Text, ScrollView, Image, RefreshControl, TouchableOpacity, Modal } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const userData = useSelector((state: RootState) => state.user);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visible, setVisible] = useState(false);

  // Fungsi untuk fetch data profile
  const fetchProfile = async () => {
    try {
      if (userData) {
        const response = await getProfile(userData.user_id);
        setProfile(response);
      }
    } catch (error: any) {
      console.error("Error fetching profile:", error.message);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [userData]);

  // Handle pull-to-refresh
  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchProfile(); // Refresh profile data
    setIsRefreshing(false);
  };

  // Fungsi untuk salin User ID ke clipboard
  const copyToClipboard = (text: string) => {
    Clipboard.setStringAsync(text);
    alert("ID pengguna telah disalin ke clipboard!");
  };

  // Handle Logout
  const handleLogout = async () => {
    await logout();
    hideDialog();
    navigation.navigate("Login");
  };

  // Show Dialog for Logout confirmation
  const showDialog = () => setVisible(true);
  const hideDialog = () => setVisible(false);

  return (
    <ScrollView
      className="flex-1 bg-[#f5f5f5] p-6 mt-8"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
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
          <Text className="mb-4 text-base font-medium text-gray-700">
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
                  {new Date(profile.created_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}{" "}
                  WIB
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Diperbarui pada</Text>
                <Text className="font-medium text-gray-800">
                  {new Date(profile.updated_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}{" "}
                  WIB
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
              Loading profile...
            </Text>
          )}
        </View>
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
              <Text className="mb-4 text-xl text-center">Konfirmasi Logout</Text>
              <Text className="mb-6 text-center">Apakah yakin ingin logout?</Text>
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
