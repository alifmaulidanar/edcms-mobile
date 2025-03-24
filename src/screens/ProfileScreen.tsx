import { Profile } from "../types";
import Constants from "expo-constants";
import { getProfile } from "../api/auth";
import { Ionicons } from "@expo/vector-icons";
import { setStringAsync } from "expo-clipboard";
import React, { useState, useEffect } from "react";
import { error as handleError } from '../utils/logHandler';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { View, Text, ScrollView, Image, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Tickets: undefined;
  Profile: undefined;
  Settings: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInitialData = async () => {
    try {
      const userData = await AsyncStorage.getItem("userData");
      if (userData) {
        setProfile(JSON.parse(userData));
      }
    } catch (error) {
      handleError(`Error reading userData from AsyncStorage: ${error}`);
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
      handleError(`Error fetching profile: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    setStringAsync(text);
    alert("ID pengguna telah disalin ke clipboard!");
  };

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
      className="flex-1 bg-[#f5f5f5] p-4 mt-6"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={fetchProfile} />
      }
    >
      <Text className="mb-6 text-2xl font-semibold text-gray-700">Profil</Text>

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
        {process.env.EXPO_PUBLIC_APP_NAME} v{appVersion}
      </Text>
    </ScrollView>
  );
};

export default ProfileScreen;
