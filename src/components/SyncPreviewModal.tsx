import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SyncPreviewModalProps } from '../types';
import { Modal, View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';

const SyncPreviewModal: React.FC<SyncPreviewModalProps> = ({
  visible,
  onClose,
  syncableTickets,
  selectedTickets,
  onSelectTicket,
  onSelectAll,
  onSync,
  geofenceLookup,
}) => {
  const [accordionOpen, setAccordionOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) setAccordionOpen(null);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View className="w-11/12 p-0 bg-white rounded-lg shadow-lg max-h-[90%]" style={{ zIndex: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: 'white', zIndex: 10 }}>
            <Text className="text-2xl font-semibold text-gray-800">Daftar Foto yang Akan Disinkronkan</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ marginLeft: 12 }}
            >
              <Ionicons name="close" size={28} color="#374151" />
            </TouchableOpacity>
          </View>
          <View className='flex-col px-6'>
            <Text className="text-gray-500">Total Tiket: {syncableTickets.length}</Text>
            <Text className="text-gray-500">Total Foto: {syncableTickets.reduce((acc, row) => acc + row.photos.length, 0)}</Text>
          </View>
          <ScrollView style={{ maxHeight: 400, paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={onSelectAll}
              style={{ marginBottom: 12, alignSelf: 'flex-end' }}
            >
              <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>{selectedTickets.length === syncableTickets.length ? 'Batal Pilih Semua' : 'Pilih Semua'}</Text>
            </TouchableOpacity>
            {syncableTickets.length === 0 ? (
              <Text style={{ textAlign: 'center', color: 'gray', marginTop: 16 }}>Tidak ada tiket dengan foto pending/failed.</Text>
            ) : (
              syncableTickets.map((row, idx) => (
                <View key={row.ticket.ticket_id} style={{ marginBottom: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                    <TouchableOpacity
                      onPress={() => onSelectTicket(row.ticket.ticket_id)}
                      style={{ marginRight: 12 }}
                    >
                      <Ionicons
                        name={selectedTickets.includes(row.ticket.ticket_id) ? 'checkbox' : 'square-outline'}
                        size={24}
                        color={selectedTickets.includes(row.ticket.ticket_id) ? '#2563eb' : '#9ca3af'}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setAccordionOpen(accordionOpen === row.ticket.ticket_id ? null : row.ticket.ticket_id)}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{row.ticket.description || '-'}</Text>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>ID: {row.ticket.ticket_id || '-'}</Text>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>
                          Tempat: {geofenceLookup[row.ticket.geofence_id]?.description || '-'}
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>
                          TID: {row.ticket.additional_info?.tid || '-'}
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>
                          Tipe Tiket: {row.ticket.additional_info?.tipe_tiket || '-'}
                        </Text>
                        <Text style={{ color: '#6b7280', fontSize: 13 }}>
                          Kategori: {row.ticket.additional_info?.edc_service || '-'}
                        </Text>
                      </View>
                      <Ionicons name={accordionOpen === row.ticket.ticket_id ? 'chevron-up' : 'chevron-down'} size={22} color="#374151" />
                    </TouchableOpacity>
                  </View>
                  {accordionOpen === row.ticket.ticket_id && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                      <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>Foto Pending/Failed:</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', paddingTop: 8, paddingBottom: 8, marginBottom: 8 }}>
                        {row.photos.map((photo: any, i: number) => (
                          <View
                            key={photo.id}
                            style={{
                              width: '23%',
                              aspectRatio: 1,
                              margin: '1%',
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#e5e7eb',
                              backgroundColor: '#f3f4f6',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: 8,
                            }}
                          >
                            <Image
                              source={{ uri: photo.local_uri }}
                              style={{ width: '100%', height: '100%', borderRadius: 8 }}
                              resizeMode="cover"
                            />
                            <Text style={{ fontSize: 11, color: '#374151', textAlign: 'center' }}>#{photo.queue_order}</Text>
                            <Text style={{ fontSize: 11, color: photo.status === 'failed' ? '#ef4444' : '#6b7280', textAlign: 'center' }}>
                              {photo.status === 'failed' ? 'Gagal' : 'Pending'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderTopWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
            <TouchableOpacity
              onPress={onSync}
              disabled={selectedTickets.length === 0}
              style={{ backgroundColor: selectedTickets.length === 0 ? '#d1d5db' : '#2563eb', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8 }}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Sinkronkan Sekarang</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default SyncPreviewModal; 