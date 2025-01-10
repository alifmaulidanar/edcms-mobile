// import * as Notifications from 'expo-notifications';

// // Setup notification channel
// export const setupNotificationChannel = async (): Promise<void> => {
//   await Notifications.setNotificationChannelAsync('tracking', {
//     name: 'Tracking',
//     importance: Notifications.AndroidImportance.HIGH,
//     vibrationPattern: [0, 250, 250, 250],
//     lightColor: '#FF231F7C',
//   })
// }

// // Send tracking notification
// export const sendTrackingNotification = async (): Promise<void> => {
//   await Notifications.scheduleNotificationAsync({
//     content: {
//       title: 'Tracking Active',
//       body: 'Your location is being updated in the background!',
//     },
//     trigger: null,
//   })
// }