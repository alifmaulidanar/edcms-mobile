import supabase from '../utils/supabase';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from "@react-native-async-storage/async-storage";

const logFilePath = FileSystem.documentDirectory + `${process.env.EXPO_PUBLIC_LINKING_URI}_logs.txt`;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const MAX_LOG_AGE = 3 * 30 * 24 * 60 * 60 * 1000; // 3 months in milliseconds

// Send log file to server
export const sendLogToBackend = async () => {
  try {
    let user_id;
    await AsyncStorage.getItem('userData')
      .then((userData) => {
        const user = userData ? JSON.parse(userData) : null;
        user_id = user?.user_id;
      })
      .catch((err: any) => error(`Error saat mengambil data pengguna: ${err}`));

    const fileUri = logFilePath;
    const fileContent = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    const datetime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/[:/]/g, '-').replace(/\s/g, '_');
    const fileName = `${user_id}/${user_id}@${datetime}.txt`;

    // Upload to Supabase Storage
    const { error: err } = await supabase.storage
      .from('app-logs')
      .upload(fileName, fileContent, {
        contentType: 'text/plain',
        upsert: true,
      });

    if (err) {
      error(`Gagal mengunggah log ke Supabase Storage: ${err}`);
      throw err;
    }
    log('Log berhasil diunggah ke database');
  } catch (err: any) {
    error(`Error saat mengirim log ke backend: ${err}`);
  }
};

// Check log file size and age
export const checkLogSizeAndAge = async () => {
  try {
    const logFileInfo = await FileSystem.getInfoAsync(logFilePath);
    if (!logFileInfo.exists) return;
    const currentTime = new Date(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
    const fileSize = logFileInfo.size;
    const lastModifiedTime = new Date(new Date(logFileInfo.modificationTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
    if (fileSize >= MAX_LOG_SIZE || (currentTime.getTime() - lastModifiedTime.getTime()) >= MAX_LOG_AGE) {
      log('Log perlu diputar, mengirimkan ke backend dan menghapus log...');
      await sendLogToBackend();
      await FileSystem.deleteAsync(logFilePath);
      log('Log lama telah dihapus, mulai log baru.');
    }
  } catch (err: any) {
    error(`Error saat memeriksa log: ${err}`);
  }
};

// Write log to file
const writeLog = async (message: any) => {
  const date = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const logMessage = `${date} - ${message}\n`;
  try {
    await checkLogSizeAndAge();
    const existingLogs = await FileSystem.readAsStringAsync(logFilePath, { encoding: FileSystem.EncodingType.UTF8 }).catch(() => '');
    const updatedLogs = existingLogs + logMessage;
    await FileSystem.writeAsStringAsync(logFilePath, updatedLogs, { encoding: FileSystem.EncodingType.UTF8 });
  } catch (err: any) {
    error(`Failed to write log: ${err}`);
  }
};

// Delete log file
export const deleteLog = async () => {
  try {
    const logFileInfo = await FileSystem.getInfoAsync(logFilePath);
    if (logFileInfo.exists) {
      await FileSystem.deleteAsync(logFilePath);
      log('File log berhasil dihapus.');
    } else {
      log('Tidak ada file log yang ditemukan untuk dihapus.');
    }
  } catch (err: any) {
    error(`Gagal menghapus file log: ${err}`);
  }
};

// Log and error functions
export const log = (message: any) => {
  console.log(message);
  writeLog(message);
};

export const error = (message: any) => {
  console.error(message);
  writeLog(message);
};
