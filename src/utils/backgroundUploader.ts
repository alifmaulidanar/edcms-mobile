import { QueueItem } from '../types';
import { saveToLibraryAsync } from 'expo-media-library';
import BackgroundJob from 'react-native-background-actions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { AndroidNotificationPriority, scheduleNotificationAsync } from 'expo-notifications';

const MAX_RETRY_ATTEMPTS = 5;
const MAX_FAILED_QUEUE_SIZE = 20;

const processPhoto = async (photoUri: string, ticketId: string, timestamp: string, location: any, index: number) => {
  try {
    // Compression dan resize 
    const compressed = await manipulateAsync(
      photoUri,
      [{ resize: { width: 800 } }],
      { compress: 0.5, format: SaveFormat.JPEG }
    );

    // Timestamp and location
    // const processedUri = await addTimestampToPhoto(
    //   compressed.uri,
    //   `${ticketId}-${timestamp}-${index}.jpg`,
    //   timestamp,
    //   location
    // );

    // Save to library
    if (compressed.uri) {
      await saveToLibraryAsync(compressed.uri);
    } else {
      handleLog('Gagal simpan ke galeri, lanjutkan upload...');
    }
    return compressed.uri;
  } catch (error: any) {
    handleError(`Gagal memproses foto: ${error}`);
    throw error;
  }
};

const uploadWorker = async (taskData: any) => {
  while (true) {
    const queue: QueueItem[] = JSON.parse(await AsyncStorage.getItem('uploadQueue') || '[]');
    if (queue.length === 0) {
      await BackgroundJob.updateNotification({
        taskDesc: 'Tidak ada pekerjaan yang tertunda',
        progressBar: { max: 100, value: 100 }
      });
      await new Promise(resolve => setTimeout(resolve, 5000));
      await BackgroundJob.stop();
      continue;
    }

    const currentJob = queue[0];
    try {
      await scheduleNotificationAsync({
        content: {
          title: 'Sedang memproses tiket',
          body: `Tiket ${currentJob.ticket_id} - Foto 1/${currentJob.photos.length}`,
          sound: true,
          priority: AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });

      // Processing photos (compression and resize, timestamp and location, save to library)
      const processedPhotos = [];
      for (let i = 0; i < currentJob.photos.length; i++) {
        const processedUri = await processPhoto(
          currentJob.photos[i],
          currentJob.ticket_id,
          currentJob.timestamp,
          currentJob.location,
          i
        );

        // Progress bar
        await BackgroundJob.updateNotification({
          taskTitle: `Upload Foto (${i + 1}/${currentJob.photos.length})`,
          taskDesc: `Tiket: ${currentJob.ticket_id} (${queue.indexOf(currentJob) + 1}/${queue.length})`,
          progressBar: {
            max: currentJob.photos.length,
            value: i + 1,
            indeterminate: false
          }
        });
        processedPhotos.push(processedUri);
      }

      // Upload to server
      const formData = new FormData();
      processedPhotos.forEach((uri, index) => {
        formData.append('photos', {
          uri,
          name: `${currentJob.ticket_id}-${currentJob.timestamp}-${index}.jpg`,
          type: 'image/jpeg',
        } as any);
      });

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/ticket/photos/upload/${currentJob.ticket_id}`, {
        method: 'POST',
        headers: {
          'user_id': currentJob.user_id,
        },
        body: formData,
      });

      // Delete current job from queue if success
      if (response.ok) {
        const newQueue = queue.slice(1);
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
      }
    } catch (error) {
      handleError(`Gagal memproses tiket: ${error}`);
      const updatedQueue = queue.map(item =>
        item.ticket_id === currentJob.ticket_id
          ? { ...item, attempts: (item.attempts || 0) + 1 }
          : item
      );

      if ((currentJob.attempts || 0) < MAX_RETRY_ATTEMPTS) {
        const newQueue = [...queue.slice(1), { ...currentJob, attempts: (currentJob.attempts || 0) + 1 }];
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
      } else {
        // Save to failed queue
        const failed = JSON.parse(await AsyncStorage.getItem('failedQueue') || '[]');
        if (failed.length >= MAX_FAILED_QUEUE_SIZE) {
          handleError('Antrian gagal terlalu besar, hapus antrian terlama...');
          failed.shift(); // Remove the oldest item
        }
        failed.push(currentJob);
        await AsyncStorage.setItem('failedQueue', JSON.stringify([...failed, currentJob]));
        handleLog(`[${new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta' })}] Tiket ${currentJob.ticket_id} gagal, attempts: ${currentJob.attempts || 0}`);
        await scheduleNotificationAsync({
          content: {
            title: 'Gagal mengunggah foto',
            body: `Tiket ${currentJob.ticket_id} - ${currentJob.photos.length} foto`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        });
      }

      // Try for 5 attempts, then remove from queue
      if ((currentJob.attempts || 0) < MAX_RETRY_ATTEMPTS) {
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(updatedQueue));
      } else {
        handleError(`Gagal memproses tiket: ${error}`);
        await scheduleNotificationAsync({
          content: {
            title: 'Gagal mengunggah foto',
            body: `Tiket ${currentJob.ticket_id} - ${currentJob.photos.length} foto`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
          },
          trigger: null,
        });
        const newQueue = queue.slice(1);
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
        await stopUploadService();
      }
    }
  }
};

export const startUploadService = async () => {
  const options = {
    taskName: 'PhotoUploader',
    taskTitle: 'Mengunggah foto pekerjaan',
    taskDesc: 'Sedang memproses foto...',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    linkingURI: `${process.env.EXPO_PUBLIC_LINKING_URI}://ticket`,
    parameters: {
      delay: 1000
    },
  };
  await BackgroundJob.start(uploadWorker, options);
  handleLog(`[${new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })}] Background service status: ${BackgroundJob.isRunning()}`);
};

export const stopUploadService = async () => {
  handleLog('Menghentikan background service...');
  await BackgroundJob.stop();
};