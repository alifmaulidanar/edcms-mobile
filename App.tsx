import "./global.css";
import { Provider } from "react-redux";
import { StatusBar } from "react-native";
import React, { useEffect, useState } from "react";
import store, { setUser } from "./src/store/index";
import { initializeRadar } from "./src/utils/radar";
import LoginScreen from "./src/screens/LoginScreen";
import TabsNavigator from "./src/navigation/TabsNavigator";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, Text } from "react-native";

// Constants for route names
const Routes = {
  Login: "Login",
  Main: "Main",
};

// Stack navigator
const Stack = createStackNavigator();

export default function App() {
  // Set status bar style
  StatusBar.setBarStyle("dark-content");
  StatusBar.setBackgroundColor("transparent");
  StatusBar.setTranslucent(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Initialize Radar SDK
    const publishableKey = process.env.EXPO_PUBLIC_RADAR_PUBLISHABLE_KEY as string;
    initializeRadar(publishableKey);

    // Load user data from AsyncStorage
    const loadUserData = async () => {
      try {
        const storedUserData = await AsyncStorage.getItem("userData");
        if (storedUserData) {
          const user = JSON.parse(storedUserData);
          store.dispatch(setUser(user)); // Set user in Redux
          setIsLoggedIn(true);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, []);

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName={isLoggedIn ? Routes.Main : Routes.Login}>
            <Stack.Screen
              name={Routes.Login}
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name={Routes.Main}
              component={TabsNavigator}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </Provider>
  );
}
