import { QueueItem } from '../types';
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
    (typeof item?.photoStartIndex === 'number' || item?.photoStartIndex === undefined) && // Optional photo start index
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

// Optimized photo processing to avoid memory issues
const processPhoto = async (photoUri: string, ticketId: string, timestamp: string, location: any, index: number) => {
  try {
    if (!photoUri || typeof photoUri !== 'string') {
      handleError('Invalid photo URI');
      throw new Error('Invalid photo URI');
    }

    if (!ticketId || typeof ticketId !== 'string') {
      handleError('Invalid ticket ID');
      throw new Error('Invalid ticket ID');
    }

    if (!timestamp || typeof timestamp !== 'string') {
      handleError('Invalid timestamp');
      throw new Error('Invalid timestamp');
    }

    // Compression dan resize - reduced quality to improve performance
    const compressed = await manipulateAsync(
      photoUri,
      [{ resize: { width: 800 } }],
      { compress: 0.3, format: SaveFormat.JPEG }
    );

    if (!compressed.uri) {
      handleError('Failed to compress photo');
      throw new Error('Failed to compress photo');
    }

    // Delete original photo to free up memory
    await deleteAsync(photoUri, { idempotent: true }).catch((err) => {
      handleError(`Failed to delete original photo: ${err}`);
    });
    return compressed.uri;
  } catch (error: any) {
    handleError(`Gagal memproses foto: ${error}`);
    return null; // Return null instead of throwing to continue with other photos
  }
};

// Fixed background worker to be more resilient
const uploadWorker = async (taskData: any) => {
  let emptyQueueRetry = 0;
  try {
    // Show initial notification that the service has started
    await scheduleNotificationAsync({
      content: {
        title: 'Upload foto dimulai',
        body: 'Aplikasi akan mengunggah foto di latar belakang',
        sound: false,
        priority: AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });

    // Initial notification in the background service
    await BackgroundJob.updateNotification({
      taskTitle: 'Mengunggah foto',
      taskDesc: 'Memulai layanan upload...',
      progressBar: { max: 100, value: 0, indeterminate: true }
    });

    let errorCount = 0;
    const MAX_ERRORS = 5;
    await AsyncStorage.setItem('uploadInProgress', 'true');
    while (true) {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const queue = await getSanitizedQueue();
        if (queue.length === 0) {
          emptyQueueRetry++;
          if (emptyQueueRetry > 3) {
            await BackgroundJob.updateNotification({
              taskDesc: 'Tidak ada pekerjaan yang tertunda',
              progressBar: { max: 100, value: 100 }
            });
            handleLog("No pending uploads. Stopping background job.");
            await AsyncStorage.setItem('uploadInProgress', 'false');
            await scheduleNotificationAsync({
              content: {
                title: 'Upload selesai',
                body: 'Semua foto berhasil diunggah',
                sound: false,
                priority: AndroidNotificationPriority.DEFAULT,
              },
              trigger: null,
            });
            await stopUploadService();
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
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
              sound: false,
              priority: AndroidNotificationPriority.DEFAULT,
            },
            trigger: null,
          });

          // Processing photos with proper error handling
          const processedPhotos = [];
          for (let i = 0; i < currentJob.photos.length; i++) {
            const photoUri = currentJob.photos[i];
            try {
              const fileExists = await readAsStringAsync(photoUri).catch(() => null);
              if (!fileExists) {
                handleError(`File tidak ditemukan: ${photoUri}`);
                continue; // Skip this photo but continue with others
              }
            } catch {
              handleError(`Foto tidak valid: ${photoUri}`);
              continue; // Skip this photo but continue with others
            }

            const processedUri = await processPhoto(
              photoUri,
              currentJob.ticket_id,
              currentJob.timestamp,
              currentJob.location,
              i
            ).catch(err => {
              handleError(`Error processing photo ${i + 1}: ${err}`);
              return null;
            });

            if (processedUri) {
              processedPhotos.push(processedUri);
            }

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
            await new Promise(resolve => setTimeout(resolve, 200)); // Add a short delay to prevent overwhelming the system
          }

          if (processedPhotos.length === 0) {
            handleError('No photos were successfully processed.');
            throw new Error('No photos were successfully processed.');
          }

          // Upload to server
          const formData = new FormData();
          const photoStartIndex = currentJob.photoStartIndex || 0; // Use photoStartIndex if provided, default to 0
          processedPhotos.forEach((uri, index) => {
            const photoIndex = photoStartIndex + index; // Calculate the actual photo index
            formData.append('photos', {
              uri,
              name: `${currentJob.ticket_id}-${currentJob.timestamp}-${photoIndex}.jpg`,
              type: 'image/jpeg',
            } as any);
          });

          try {
            const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/ticket/photos/upload/${currentJob.ticket_id}`, {
              method: 'POST',
              headers: {
                'user_id': currentJob.user_id,
              },
              body: formData,
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Delete current job from queue if success
            if (response.ok) {
              const newQueue = queue.slice(1);
              await AsyncStorage.setItem('uploadQueue', JSON.stringify(newQueue));
              await Promise.all(processedPhotos.filter((uri): uri is string => uri !== null).map(uri =>
                deleteAsync(uri, { idempotent: true }).catch(err => {
                  handleError(`Failed to delete processed photo: ${err}`);
                })
              ));

              // Notify success
              await scheduleNotificationAsync({
                content: {
                  title: 'Foto berhasil diunggah',
                  body: `Tiket ${currentJob.ticket_id} - ${processedPhotos.length} foto`,
                  sound: true,
                  priority: AndroidNotificationPriority.DEFAULT,
                },
                trigger: null,
              });
            }
          } catch (error) {
            handleError(`HTTP error: ${error}`);
            throw error; // Re-throw to handle in the outer catch block
          }
        } catch (error) {
          handleError(`Gagal mengunggah foto: ${error}`);
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
                body: `Tiket ${currentJob.ticket_id} - ${currentJob.photos.length} foto - telah mencapai batas percobaan`,
                sound: false,
                priority: AndroidNotificationPriority.DEFAULT,
              },
              trigger: null,
            });
          }
        }
      } catch (error) {
        handleError(`Error utama di uploadWorker: ${error}`);
        errorCount++;
        if (errorCount > MAX_ERRORS) {
          handleError('Too many consecutive errors, stopping background service');
          await AsyncStorage.setItem('uploadInProgress', 'false');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    handleError(`Fatal error in background service: ${error}`);
    await AsyncStorage.setItem('uploadInProgress', 'false');
    await scheduleNotificationAsync({
      content: {
        title: 'Layanan upload terganggu',
        body: 'Terjadi kesalahan pada layanan upload. Silakan coba lagi nanti.',
        sound: false,
        priority: AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });
  }
};

// Improved start service function
export const startUploadService = async (): Promise<boolean> => {
  try {
    if (BackgroundJob.isRunning()) {
      handleLog("Background job is already running.");
      return true;
    }
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
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: true,
      },
      // Required for Android 14 (API level 34)
      androidConfig: {
        foregroundServiceType: ['dataSync', 'location'],
      },
    };
    await BackgroundJob.start(uploadWorker, options);
    handleLog(`Background service started. Status: ${BackgroundJob.isRunning()}`);
    return true;
  } catch (error) {
    handleError(`Failed to start background job: ${error}`);
    await scheduleNotificationAsync({
      content: {
        title: 'Gagal memulai layanan upload',
        body: 'Silakan coba lagi nanti atau restart aplikasi',
        sound: false,
        priority: AndroidNotificationPriority.DEFAULT,
      },
      trigger: null,
    });
    return false;
  }
};

// Improved stop service function
export const stopUploadService = async (): Promise<boolean> => {
  try {
    if (BackgroundJob.isRunning()) {
      handleLog('Menghentikan background service...');
      await BackgroundJob.stop();
      handleLog('Background service stopped.');
      return true;
    } else {
      handleLog('Background service is not running.');
      return false;
    }
  } catch (error) {
    handleError(`Failed to stop background job: ${error}`);
    return false;
  }
};

// Check if upload is in progress
export const isUploadInProgress = async (): Promise<boolean> => {
  try {
    const status = await AsyncStorage.getItem('uploadInProgress');
    return status === 'true';
  } catch (error) {
    handleError(`Failed to check upload status: ${error}`);
    return false;
  }
};