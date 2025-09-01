import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { View, Text, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";

type RootStackParamList = {
  Settings: undefined;
  PrivacyPolicy: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, "PrivacyPolicy">;

const PrivacyPolicyScreen: React.FC<Props> = ({ navigation }) => {
  return (
    <View className="flex-1 p-4 mt-6">
      <View className="flex-row items-center px-1 py-4 shadow-md">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-lg font-semibold text-gray-700">Kebijakan Privasi</Text>
      </View>
      <WebView
        source={{ uri: "https://edcms-privacy-policy.pages.dev/privacy-policy-pastims" }}
        style={{ flex: 1 }}
      />
    </View>
  );
};

export default PrivacyPolicyScreen;
