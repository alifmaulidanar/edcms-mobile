import { requestForegroundPermissionsAsync } from 'expo-location';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Skia, FontStyle, PaintStyle } from '@shopify/react-native-skia';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { readAsStringAsync, writeAsStringAsync, documentDirectory, EncodingType } from 'expo-file-system';

// Base64
const loadImageAsBase64 = async (uri: string) => {
  try {
    // handleLog(`Membaca file gambar sebagai Base64: ${uri}`);
    const base64Data = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    if (!base64Data) {
      handleError('Base64 kosong atau tidak valid.');
      throw new Error('Base64 kosong atau tidak valid.');
    }
    return base64Data;
  } catch (error) {
    handleError(`Gagal membaca file gambar: ${error}`);
    return null;
  }
};

export const getUserLocationInfo = async (location: any) => {
  try {
    handleLog('Mendapatkan informasi lokasi pengguna...');
    const { status } = await requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      handleError('Izin lokasi foreground ditolak');
      return null;
    }

    const { latitude, longitude } = location.coords;
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36' } }
    );

    if (!response.ok) {
      handleError(`HTTP error! status: ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const address = data.address;
    // handleLog(`Informasi lokasi: ${address}`);
    if (!address) {
      handleError('Alamat tidak ditemukan dalam hasil data');
      return null;
    }
    return {
      latitude,
      longitude,
      jalan: address.road || '-',
      kelurahan: address.neighbourhood || '-',
      kecamatan: address.suburb || '-',
      kota: address.city || '-',
      provinsi: address.region || '-',
      kode_pos: address.postcode || '-',
      negara: address.country || '-',
    }
  } catch (error) {
    handleError(`Gagal mendapatkan lokasi: ${error}`);
    return null;
  }
};

const getUserLocationWithRetry = async (location: any, maxRetries = 3, delay = 5000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // handleLog(`Mencoba mendapatkan lokasi pengguna... (Percobaan ${attempt})`);
      const userInfo = await getUserLocationInfo(location);
      if (userInfo) return userInfo;
    } catch (error) {
      handleError(`Gagal mendapatkan lokasi (Percobaan ${attempt}): ${error}`);
    }
    handleLog(`Menunggu ${delay / 1000} detik sebelum mencoba lagi...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  handleError('Gagal mendapatkan lokasi setelah beberapa percobaan.');
  return null;
};

// Timestamp and Location
export const addTimestampToPhoto = async (photoUri: string, fileName: string, timestamp: any, location: any) => {
  try {
    let userInfo = await getUserLocationWithRetry(location);
    if (!userInfo) {
      handleError('Tidak bisa mendapatkan lokasi, menunda proses.');
      return null;
    }

    const timestampText = [
      `${timestamp} WIB`,
      `${userInfo.latitude}, ${userInfo.longitude}`,
      `${userInfo.jalan}`,
      `${userInfo.kelurahan}`,
      `${userInfo.kecamatan}`,
      `${userInfo.kota}`,
      `${userInfo.kode_pos}`,
      `${userInfo.provinsi}`,
      `${userInfo.negara}`
    ];
    handleLog(`Menambahkan timestamp ke foto`);

    // 1. Image Dimensions
    const { width: imgWidth, height: imgHeight } = await manipulateAsync(
      photoUri,
      [],
      { format: SaveFormat.JPEG }
    );

    // 2. Skia Surface & Canvas
    const surface = Skia.Surface.Make(imgWidth, imgHeight);
    if (!surface) return photoUri;
    const canvas = surface.getCanvas();

    // 3. Load Image
    const base64Data = photoUri.startsWith('file://') ? await loadImageAsBase64(photoUri) : photoUri.split('base64,')[1];
    if (!base64Data) return photoUri;
    const skData = Skia.Data.fromBase64(base64Data);
    const img = Skia.Image.MakeImageFromEncoded(skData);
    if (!img) return photoUri;

    // 4. Canvas Draw Image
    canvas.drawImage(img, 0, 0);

    // 5. Text Paint & Font
    const margin = imgWidth * 0.02; // 2% from image width
    const fontSize = imgWidth * 0.04; // 4% from image width
    const lineHeight = fontSize * 1.2;
    const fontMgr = Skia.FontMgr.System();
    const typeface = fontMgr.matchFamilyStyle('Helvetica', FontStyle.Bold);
    const font = Skia.Font(typeface, fontSize);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color('white'));
    paint.setStyle(PaintStyle.Fill);
    paint.setStrokeWidth(1);

    // 6. Text Position
    let yPos = imgHeight - margin;
    const textX = imgWidth - margin;

    // 7. Draw Text
    timestampText.reverse().forEach(line => {
      const textWidth = font.measureText(line).width;
      const x = textX - textWidth;
      canvas.drawText(line, x, yPos, paint, font);
      yPos -= lineHeight;
    });

    // 8. Save
    const snapshot = surface.makeImageSnapshot();
    if (!snapshot) return photoUri;
    const newImageBase64 = snapshot.encodeToBase64();
    const fileUri = `${documentDirectory}${fileName}`;
    await writeAsStringAsync(fileUri, newImageBase64, { encoding: EncodingType.Base64 });
    return fileUri;
  } catch (error) {
    handleError(`Error adding timestamp: ${error}`);
    return photoUri;
  }
};
