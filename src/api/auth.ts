import { Profile } from '../types';
import Radar from 'react-native-radar';
import supabase from '../utils/supabase';

// Login
export const login = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('User ID not found');
  const userData = await getUserData(userId);
  if (!userData) throw new Error('User data not found');
  Radar.setUserId(userId);
  Radar.setMetadata(userData)
  Radar.setDescription(`${userData.username} - ${userData.email} - ${userData.phone}`);
  return userData;
};

// Get user data
const getUserData = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
};

// Get Profile data
export const getProfile = async (user_id: string): Promise<Profile> => {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL as string}/profile`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "user_id": user_id,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      console.error("Error fetching user profile:", data.message || "Unknown error");
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Profile;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
};

// Logout
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  console.log("User logged out");
  if (error) throw error;
};
