import { QueueItem } from '../types';
import { saveToLibraryAsync } from 'expo-media-library';
import BackgroundJob from 'react-native-background-actions';
import { deleteAsync, readAsStringAsync } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { log as handleLog, error as handleError } from '../utils/logHandler';
import { AndroidNotificationPriority, scheduleNotificationAsync } from 'expo-notifications';

const MAX_RETRY_ATTEMPTS = 5;
const MAX_FAILED_QUEUE_SIZE = 20;

const isValidQueueItem = (item: any): item is QueueItem => {
  return (
    typeof item?.ticket_id === 'string' &&
    typeof item?.user_id === 'string' &&
    Array.isArray(item?.photos) &&
    item.photos.every((photo: any) => typeof photo === 'string') &&
    (typeof item?.attempts === 'number' || item?.attempts === undefined) && // Optional number
    item?.timestamp !== undefined && // Any type
    item?.location !== undefined // Any type
  );
};

const getSanitizedQueue = async () => {
  try {
    const rawData = await AsyncStorage.getItem('uploadQueue');
    if (!rawData) return [];

    const parsedData = JSON.parse(rawData);
    if (!Array.isArray(parsedData)) {
      await AsyncStorage.removeItem('uploadQueue');
      return [];
    }

    const validatedData = parsedData.filter(item => {
      const isValid = isValidQueueItem(item);
      if (!isValid) {
        handleError(`Data korup ditemukan di uploadQueue: ${JSON.stringify(item)}`);
      }
      return isValid;
    });

    if (validatedData.length !== parsedData.length) {
      await AsyncStorage.setItem('uploadQueue', JSON.stringify(validatedData));
    }
    return validatedData;
  } catch (error) {
    handleError(`Error memproses uploadQueue: ${error}`);
    return [];
  }
};

const processPhoto = async (photoUri: string, ticketId: string, timestamp: string, location: any, index: number) => {
  try {
    // Compression dan resize 
    const compressed = await manipulateAsync(
      photoUri,
      [{ resize: { width: 800 } }],
      { compress: 0.4, format: SaveFormat.JPEG }
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
    await deleteAsync(photoUri, { idempotent: true });
    return compressed.uri;
  } catch (error: any) {
    handleError(`Gagal memproses foto: ${error}`);
    throw error;
  }
};

const uploadWorker = async (taskData: any) => {
  let emptyQueueRetry = 0;
  while (true) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const queue = await getSanitizedQueue();
      if (queue.length === 0) {
        if (emptyQueueRetry++ > 3) {
          await BackgroundJob.updateNotification({
            taskDesc: 'Tidak ada pekerjaan yang tertunda',
            progressBar: { max: 100, value: 100 }
          });
          await stopUploadService();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      emptyQueueRetry = 0;

      const currentJob = queue[0];
      if (!isValidQueueItem(currentJob)) {
        handleError(`Data tiket korup, dilewati: ${JSON.stringify(currentJob)}`);
        await AsyncStorage.setItem('uploadQueue', JSON.stringify(queue.slice(1)));
        continue;
      }

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
          const photoUri = currentJob.photos[i];
          try {
            const fileInfo = await readAsStringAsync(photoUri);
            if (!fileInfo) {
              handleError(`File tidak ditemukan: ${photoUri}`);
              throw new Error('File tidak ditemukan');
            }
          } catch {
            handleError(`Foto tidak valid: ${photoUri}`);
            throw new Error('Foto korup');
          }
          const processedUri = await processPhoto(
            photoUri,
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
          await Promise.all(processedPhotos.map(uri => deleteAsync(uri, { idempotent: true })));
        }
      } catch (error) {
        handleError(`Gagal memproses tiket: ${error}`);

        if ((currentJob.attempts || 0) < MAX_RETRY_ATTEMPTS) {
          const newQueue = [...queue.slice(1), { ...currentJob, attempts: (currentJob.attempts || 0) + 1 }];
          await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
        } else {
          // Save to failed queue
          const failed = JSON.parse(await AsyncStorage.getItem('failedQueue') || '[]');
          const newFailed = [currentJob, ...failed].slice(0, MAX_FAILED_QUEUE_SIZE);
          await AsyncStorage.setItem('failedQueue', JSON.stringify(newFailed));
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
      }
    } catch (error) {
      handleError(`Error utama di uploadWorker: ${error}`);
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
  handleLog(`Background service status: ${BackgroundJob.isRunning()}`);
};

export const stopUploadService = async () => {
  handleLog('Menghentikan background service...');
  await BackgroundJob.stop();
};