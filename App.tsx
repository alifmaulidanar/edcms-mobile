import "./global.css";
import React from "react";
import store from "./src/store/index";
import { Provider } from "react-redux";
import { StatusBar } from "react-native";
import { initializeRadar } from "./src/utils/radar";
import LoginScreen from "./src/screens/LoginScreen";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import TabsNavigator from "./src/navigation/TabsNavigator"; // Import TabsNavigator

// Stack navigator
const Stack = createStackNavigator();

// Initialize Radar SDK
const publishableKey = process.env.EXPO_PUBLIC_RADAR_PUBLISHABLE_KEY as string;
initializeRadar(publishableKey);

// App component
export default function App() {
  // Set status bar style
  StatusBar.setBarStyle("dark-content");
  StatusBar.setBackgroundColor("transparent");
  StatusBar.setTranslucent(true);
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Login">
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Main"
              component={TabsNavigator} // Use TabsNavigator here
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </Provider>
  );
}
