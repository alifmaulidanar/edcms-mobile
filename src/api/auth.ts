import { Profile } from '../types';
import Radar from 'react-native-radar';
import supabase from '../utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log as handleLog, error as handleError } from '../utils/logHandler';

// Login
export const login = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data) {
    const { error: sessionError } = await supabase.auth.setSession({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
    if (sessionError) {
      handleError(`Error setting session: ${sessionError.message}`);
    }
    await saveUserCredentials(email, password);
  }
  // await AsyncStorage.setItem('session', JSON.stringify(data.session.access_token));
  const userId = data.user?.id;
  if (!userId) {
    handleError('User ID not found');
    throw new Error('User ID not found');
  }
  const userData = await getUserData(userId);
  if (!userData) {
    handleError('User data not found');
    throw new Error('User data not found');
  }
  Radar.setUserId(userId);
  Radar.setMetadata(userData)
  Radar.setDescription(`${userData.username} - ${userData.email} - ${userData.phone}`);
  return userData;
};

export const silentRefreshSession = async () => {
  try {
    const session = await supabase.auth.getSession();
    if (session.data.session) {
      return session.data.session;
    }
    const creds = await AsyncStorage.getItem('userCredentials');
    if (creds) {
      const { email, password } = JSON.parse(creds);
      const user = await login(email, password);
      return user;
    }
    throw new Error('Session expired and no credentials found');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    handleError(`Silent refresh session failed: ${errMsg}`);
    throw error;
  }
};

export const saveUserCredentials = async (email: string, password: string) => {
  try {
    await AsyncStorage.setItem('userCredentials', JSON.stringify({ email, password }));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    handleError(`Failed to save credentials: ${errMsg}`);
  }
};

// Get user data
const getUserData = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) {
    handleError(`Error getting user data: ${error.message}`);
    throw error;
  }
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
      handleError(`Error fetching user profile: ${data.message || "Unknown error"}`);
      throw new Error(data.message || "Unknown error");
    }

    const data = await response.json();
    return data as Profile;
  } catch (error) {
    handleError(`Error: ${error}`);
    throw error;
  }
};

// Logout
export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  handleLog("User logged out");
  if (error) {
    handleError(`Error logging out: ${error.message}`);
    throw error;
  }
};
