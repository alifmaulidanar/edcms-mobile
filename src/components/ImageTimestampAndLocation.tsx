import { LocationCache } from '../types';
import { requestForegroundPermissionsAsync } from 'expo-location';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Skia, FontStyle, PaintStyle } from '@shopify/react-native-skia';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { readAsStringAsync, writeAsStringAsync, documentDirectory, EncodingType } from 'expo-file-system';

/**
 * Location Caching System
 * 
 * This implementation reduces the number of API calls to Nominatim for reverse geocoding
 * by caching location data in memory. The location cache is used as follows:
 * 
 * - When a photo is taken, the system first checks if there's valid cached location data
 * - If valid data exists in cache, it's used directly without making an API call
 * - If no cache or expired cache, the system makes an API call and stores the result in cache
 * - Cache expires after 30 minutes
 * 
 * To clear the cache manually (e.g., when a ticket is submitted or canceled), call clearLocationCache()
 */

// Cache expiration time in milliseconds (30 minutes)
const CACHE_EXPIRATION = 30 * 60 * 1000;

// Global location cache
let locationCache: LocationCache | null = null;

// Base64
const loadImageAsBase64 = async (uri: string) => {
  try {
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

// Cache management functions
export const getLocationCache = () => {
  if (!locationCache) return null;
  const now = Date.now();
  if (now - locationCache.timestamp > CACHE_EXPIRATION) {
    handleLog('Cache lokasi telah kedaluwarsa');
    locationCache = null;
    return null;
  }
  return locationCache.data;
};

export const setLocationCache = (locationData: any) => {
  if (!locationData) return;
  locationCache = {
    timestamp: Date.now(),
    data: locationData
  };
  handleLog('Cache lokasi berhasil diperbarui');
};

export const clearLocationCache = () => {
  locationCache = null;
  handleLog('Cache lokasi telah dihapus');
};

export const getUserLocationInfo = async (location: any, forceRefresh: boolean = false) => {
  try {
    if (!forceRefresh) {
      const cachedLocation = getLocationCache();
      if (cachedLocation) {
        handleLog('Menggunakan data lokasi dari cache');
        return cachedLocation;
      }
    }

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
    if (!address) {
      handleError('Alamat tidak ditemukan dalam hasil data');
      return null;
    }
    const locationData = {
      latitude,
      longitude,
      jalan: address.road || '-',
      kelurahan: address.neighbourhood || '-',
      kecamatan: address.suburb || '-',
      kota: address.city || '-',
      provinsi: address.region || '-',
      kode_pos: address.postcode || '-',
      negara: address.country || '-',
    };

    // Store in cache
    setLocationCache(locationData);
    return locationData;
  } catch (error) {
    handleLog(`Gagal mendapatkan lokasi: ${error}`);
    return null;
  }
};

const getUserLocationWithRetry = async (location: any, maxRetries = 3, delay = 5000, forceRefresh = false) => {
  // Check cache first if not forcing a refresh
  if (!forceRefresh) {
    const cachedLocation = getLocationCache();
    if (cachedLocation) {
      handleLog('Menggunakan data lokasi dari cache');
      return cachedLocation;
    }
  }
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const userInfo = await getUserLocationInfo(location, forceRefresh);
      if (userInfo) return userInfo;
    } catch (error) {
      handleLog(`Gagal mendapatkan lokasi (Percobaan ${attempt}): ${error}`);
    }
    handleLog(`Menunggu ${delay / 1000} detik sebelum mencoba lagi...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  handleLog('Gagal mendapatkan lokasi setelah beberapa percobaan.');
  return null;
};

// Timestamp and Location
export const addTimestampToPhoto = async (photoUri: string, fileName: string, timestamp: any, location: any, forceRefresh: boolean = false) => {
  try {
    let userInfo = await getUserLocationWithRetry(location, 3, 5000, forceRefresh);
    if (!userInfo) {
      // Fallback: gunakan koordinat saja, alamat dan lain-lain '[no internet]'
      userInfo = {
        latitude: location?.coords?.latitude || location?.latitude || 0,
        longitude: location?.coords?.longitude || location?.longitude || 0,
        jalan: '[no internet]',
        kelurahan: '[no internet]',
        kecamatan: '[no internet]',
        kota: '[no internet]',
        kode_pos: '[no internet]',
        provinsi: '[no internet]',
        negara: '[no internet]'
      };
    }

    if (!photoUri || typeof photoUri !== 'string') {
      handleError('Invalid photo URI');
      throw new Error('Invalid photo URI');
    }

    if (!fileName || typeof fileName !== 'string') {
      handleError('Invalid file name');
      throw new Error('Invalid file name');
    }

    if (!timestamp) {
      handleError('Invalid timestamp');
      throw new Error('Invalid timestamp');
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

    try {
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

      // 9. Cleanup resources
      if (snapshot) snapshot.dispose();
      if (img) img.dispose();
      if (skData) skData.dispose();
      if (surface) surface.dispose();
      paint.dispose();
      font.dispose();
      return fileUri;
    } catch (error) {
      handleError(`Error during image processing: ${error}`);
      if (surface) surface.dispose();
      return photoUri;
    }
  } catch (error) {
    handleError(`Error adding timestamp: ${error}`);
    return photoUri;
  }
};
