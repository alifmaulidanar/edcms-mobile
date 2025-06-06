import React from 'react';
import { Modal, View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import { setStringAsync } from 'expo-clipboard';

interface SyncProgressModalProps {
  visible: boolean;
  progressState: {
    currentTicketIdx: number;
    currentPhotoIdx: number;
    totalTickets: number;
    totalPhotos: number;
    currentTicket: any;
    currentPhoto: any;
    status: string;
  };
  syncResultSummary: any[] | null;
  onClose: () => void;
}

const copyToClipboard = (text: string) => {
  setStringAsync(text);
  Alert.alert('ID telah disalin ke clipboard!');
};

const openInGoogleMaps = (coordinates: [number, number]) => {
  if (!coordinates || coordinates.length !== 2) return;
  const [longitude, latitude] = coordinates;
  const url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('Gagal membuka Google Maps');
  });
};

const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
  visible,
  progressState,
  syncResultSummary,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => { }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View className="w-11/12 p-0 bg-white rounded-lg shadow-lg max-h-[90%]" style={{ zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: 'white', zIndex: 10 }}>
            <Text className="text-2xl font-semibold text-gray-800">Progres Sinkronisasi Foto</Text>
          </View>
          <View style={{ paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8, minHeight: 120, justifyContent: 'center' }}>
            {progressState.status !== 'done' ? (
              <React.Fragment>
                <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>
                  {progressState.currentTicket ? progressState.currentTicket.description : '-'}
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
                  Tiket {progressState.currentTicketIdx} / {progressState.totalTickets}
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
                  Foto {progressState.currentPhotoIdx} / {progressState.totalPhotos}
                </Text>
                <View style={{ height: 18, backgroundColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <View
                    style={{
                      width: progressState.totalPhotos > 0
                        ? `${(100 *
                          ((progressState.currentPhotoIdx - 1 +
                            (progressState.currentTicketIdx - 1) *
                            (progressState.totalPhotos / progressState.totalTickets))) /
                          progressState.totalPhotos
                        )}%`
                        : '0%',
                      backgroundColor: '#2563eb',
                      height: 18,
                    }}
                  />
                </View>
                <Text style={{ color: '#2563eb', fontWeight: 'bold', fontSize: 15, textAlign: 'center' }}>
                  {progressState.status === 'uploading' ? 'Mengunggah...' : ''}
                </Text>
                <Text style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                  Jangan tutup aplikasi atau pindah halaman selama proses sinkronisasi!
                </Text>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Sinkronisasi Selesai</Text>
                {syncResultSummary && syncResultSummary.map((res: any, idx: number) => (
                  <View key={res.ticket.ticket_id} style={{ marginBottom: 12, padding: 10, backgroundColor: '#f3f4f6', borderRadius: 8 }}>
                    <Text style={{ fontWeight: 'bold', color: '#374151', fontSize: 16 }}>{res.ticket.description}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>ID Tiket: {res.ticket.ticket_id}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>Tempat: {res.geofence?.description || '-'}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>Alamat: {res.geofence?.address || '-'}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 13 }}>Status: {res.ticket.status}</Text>
                    <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Berhasil: {res.success}</Text>
                    <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>Gagal: {res.failed}</Text>
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      <TouchableOpacity onPress={() => copyToClipboard(res.ticket.ticket_id)} style={{ marginRight: 12 }}>
                        <Text style={{ color: '#2563eb', fontSize: 13 }}>Copy ID</Text>
                      </TouchableOpacity>
                      {res.geofence?.coordinates && (
                        <TouchableOpacity onPress={() => openInGoogleMaps(res.geofence.coordinates)}>
                          <Text style={{ color: '#2563eb', fontSize: 13 }}>Buka di Maps</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={onClose}
                  style={{ backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Tutup</Text>
                </TouchableOpacity>
              </React.Fragment>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default SyncProgressModal; 