import { Profile } from "../types";
import { RootState } from "../store";
import { useSelector } from "react-redux";
import React, { useEffect, useState } from "react";
import { getProfile, getUserData } from "../api/auth";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from "react-native";

const ProfileScreen = () => {
  const [profile, setProfile] = useState<Profile | null>(null);

  const userData = useSelector((state: RootState) => state.user);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (userData) {
          const response = await getUserData(userData.user_id);
          setProfile(response);
        }
      }
      catch (error: any) {
        console.error("Error fetching profile:", error.message);
      }
    }
    fetchProfile();
  }, [userData]);

  return (
    <ScrollView className="flex-1 bg-[#f5f5f5] p-6 mt-8">
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
        <Text className="mt-2 text-sm text-gray-600">{profile?.user_id || ""}</Text>

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
                  {new Date(profile.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-500">Diperbarui pada</Text>
                <Text className="font-medium text-gray-800">
                  {new Date(profile.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
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
            <Text className="text-center text-gray-500">Loading profile...</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

export default ProfileScreen;
