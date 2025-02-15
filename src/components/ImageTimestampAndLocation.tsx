import { ImageManipulator } from "expo-image-manipulator";

export const getLocationAddress = async (latitude: number, longitude: number) => {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
  const data = await response.json();
  return data.address;
};

export const processPhotoWithText = async (uri: string, locationText: string, timestamp: string) => {
  try {
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          drawText: {
            text: `${timestamp}\n${locationText}`,
            position: { x: 10, y: 10 }, // Posisi teks di kanan bawah
            color: "#FFFFFF", // Warna teks putih
            backgroundColor: "rgba(0,0,0,0.5)", // Latar belakang semi-transparan
            fontSize: 24,
            fontWeight: "bold"
          }
        }
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return manipulatedImage.uri;
  } catch (error) {
    console.error("Error processing photo:", error);
    return uri; // Kembalikan URI asli jika terjadi kesalahan
  }
};
